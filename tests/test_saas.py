"""Accounts, tenant isolation, credits and billing."""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from contextlib import asynccontextmanager

import httpx
import pytest

H = {"X-Requested-With": "rankcrew"}


@asynccontextmanager
async def browser():
    """A cookie-keeping client with no API key: behaves like the web app."""
    from asgi_lifespan import LifespanManager

    from seo_engine.api.app import create_app

    app = create_app()
    async with LifespanManager(app):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test", headers=H,
                                     timeout=120) as c:
            yield c


async def signup(c: httpx.AsyncClient, email: str, password: str = "correct horse battery") -> dict:
    r = await c.post("/api/auth/signup", json={"email": email, "password": password, "name": "Test",
                                                "accept_terms": True})
    assert r.status_code == 201, r.text
    return r.json()


async def verify(c: httpx.AsyncClient, me: dict) -> None:
    token = me["dev_verify_url"].split("token=")[1]
    r = await c.post("/api/auth/verify-email", json={"token": token})
    assert r.status_code == 200, r.text


async def test_signup_login_logout_and_csrf():
    async with browser() as c:
        me = await signup(c, "ana@example.com")
        assert me["user"]["email"] == "ana@example.com"
        assert me["account"]["credits"] == 100
        assert me["user"]["email_verified"] is False
        assert (await c.get("/api/auth/me")).status_code == 200
        # A cookie-authenticated write without our header is refused (CSRF).
        r = await c.post("/api/sites", json={"url": "https://ana.example"}, headers={"X-Requested-With": ""})
        assert r.status_code == 403
        assert (await c.post("/api/auth/logout")).status_code == 204
        assert (await c.get("/api/auth/me")).status_code == 401
        r = await c.post("/api/auth/login", json={"email": "ANA@example.com", "password": "correct horse battery"})
        assert r.status_code == 200, r.text
        assert (await c.get("/api/auth/me")).json()["user"]["email"] == "ana@example.com"
        # duplicate sign-up and weak passwords
        assert (await c.post("/api/auth/signup", json={"email": "ana@example.com", "password": "another long one",
                                                        "accept_terms": True})).status_code == 409
        assert (await c.post("/api/auth/signup", json={"email": "weak@example.com", "password": "short",
                                                        "accept_terms": True})).status_code == 400


async def test_lockout_after_repeated_failures():
    async with browser() as c:
        await signup(c, "lock@example.com")
        await c.post("/api/auth/logout")
        from seo_engine.api.deps import limiter

        for _ in range(10):
            limiter._hits.clear()  # isolate the database lockout from the per-process rate limit
            r = await c.post("/api/auth/login", json={"email": "lock@example.com", "password": "wrong password!!"})
            assert r.status_code == 401
        limiter._hits.clear()
        r = await c.post("/api/auth/login", json={"email": "lock@example.com", "password": "correct horse battery"})
        assert r.status_code == 401 and "Too many" in r.json()["detail"]


async def test_tenant_isolation(client, fixture_site):
    async with browser() as a, browser() as b:
        await signup(a, "owner-a@example.com")
        await signup(b, "owner-b@example.com")
        site = (await a.post("/api/sites", json={"url": fixture_site + "?tenant=a", "start_audit": False})).json()
        sid = site["site"]["id"]
        # B cannot see, read, change or delete A's site, and gets 404 (existence is not confirmed).
        assert all(s["id"] != sid for s in (await b.get("/api/sites")).json())
        for method, path in (("get", f"/api/sites/{sid}"), ("patch", f"/api/sites/{sid}"),
                             ("delete", f"/api/sites/{sid}"), ("get", f"/api/sites/{sid}/fixes"),
                             ("get", f"/api/sites/{sid}/tasks"), ("post", f"/api/sites/{sid}/audits")):
            r = await getattr(b, method)(path, **({"json": {}} if method == "patch" else {}))
            assert r.status_code == 404, (method, path, r.status_code)
        # The same URL can live in two workspaces.
        assert (await b.post("/api/sites", json={"url": fixture_site + "?tenant=a", "start_audit": False})
                ).status_code == 201
        # Operators (API key) see everything.
        assert any(s["id"] == sid for s in (await client.get("/api/sites")).json())
        # Customers cannot touch platform settings.
        assert (await a.get("/api/settings/llm")).status_code == 403
        assert (await a.get("/api/settings/integrations")).status_code == 403
        assert (await a.get("/api/admin/accounts")).status_code == 403


async def test_verification_credits_and_charging(fixture_site):
    from sqlalchemy import update

    from seo_engine.db import Account, session_scope
    from tests.test_api import wait_job

    async with browser() as c:
        me = await signup(c, "credits@example.com")
        r = await c.post("/api/sites", json={"url": fixture_site + "?tenant=credits", "start_audit": True})
        assert r.status_code == 201 and r.json()["job_id"] is None and r.json()["audit_blocked"]
        sid = r.json()["site"]["id"]
        await c.patch(f"/api/sites/{sid}", json={"obey_robots": False, "max_pages": 10})
        r = await c.post(f"/api/sites/{sid}/audits")
        assert r.status_code == 403 and r.json()["code"] == "email_not_verified"
        await verify(c, me)
        job = await wait_job(c, (await c.post(f"/api/sites/{sid}/audits")).json()["job_id"])
        assert job["status"] == "done", job
        billing = (await c.get("/api/billing")).json()
        assert 0 < billing["credits"] < 100
        assert any(e["reason"] == "audit" and e["amount"] < 0 for e in billing["ledger"])
        # Out of credits: paid work is refused with 402.
        async with session_scope() as s:
            await s.execute(update(Account).where(Account.id == me["account"]["id"]).values(balance_mc=0))
        r = await c.post(f"/api/sites/{sid}/audits")
        assert r.status_code == 402 and r.json()["code"] == "insufficient_credits"


def _signed(payload: bytes, secret: str, ts: int | None = None) -> str:
    ts = ts or int(time.time())
    sig = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"


async def test_stripe_webhook_fulfils_once(monkeypatch):
    from seo_engine.core.config import get_settings
    from seo_engine.db import Purchase, session_scope

    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", "whsec_test")
    async with browser() as c:
        me = await signup(c, "buyer@example.com")
        async with session_scope() as s:
            p = Purchase(account_id=me["account"]["id"], pack_id="starter", credits=500, amount_cents=900,
                         stripe_session_id="cs_test_123")
            s.add(p)
        event = {"type": "checkout.session.completed", "data": {"object": {
            "id": "cs_test_123", "payment_status": "paid", "amount_total": 900, "customer": "cus_1",
            "metadata": {"purchase_id": "1"}}}}
        body = json.dumps(event).encode()
        bad = await c.post("/api/billing/webhook", content=body, headers={"stripe-signature": _signed(body, "nope")})
        assert bad.status_code == 400
        old = await c.post("/api/billing/webhook", content=body,
                           headers={"stripe-signature": _signed(body, "whsec_test", int(time.time()) - 3600)})
        assert old.status_code == 400
        for expected in ("fulfilled", "already_fulfilled"):
            r = await c.post("/api/billing/webhook", content=body,
                             headers={"stripe-signature": _signed(body, "whsec_test")})
            assert r.status_code == 200 and r.json()["status"] == expected, r.text
        billing = (await c.get("/api/billing")).json()
        assert billing["credits"] == 600
        assert billing["purchases"][0]["status"] == "paid"


async def test_password_reset():
    async with browser() as c:
        await signup(c, "reset@example.com")
        await c.post("/api/auth/logout")
        r = await c.post("/api/auth/forgot-password", json={"email": "reset@example.com"})
        assert r.status_code == 200
        token = r.json()["dev_reset_url"].split("token=")[1]
        # unknown emails get the same answer
        assert (await c.post("/api/auth/forgot-password", json={"email": "nobody@example.com"})).json()["ok"]
        r = await c.post("/api/auth/reset-password", json={"token": token, "password": "a brand new passphrase"})
        assert r.status_code == 200 and r.json()["user"]["email_verified"] is True
        # single use
        assert (await c.post("/api/auth/reset-password", json={"token": token, "password": "yet another one!!"})
                ).status_code == 401
        await c.post("/api/auth/logout")
        assert (await c.post("/api/auth/login", json={"email": "reset@example.com",
                                                      "password": "a brand new passphrase"})).status_code == 200


def test_password_hashing_roundtrip():
    from seo_engine.services.accounts import hash_password, verify_password

    h = hash_password("correct horse battery")
    assert h.startswith("scrypt$") and verify_password("correct horse battery", h)
    assert not verify_password("wrong", h) and not verify_password("x", "garbage")


def test_signature_rejects_tampering():
    from seo_engine.services.billing import verify_signature
    from seo_engine.services.common import ServiceError

    body = b'{"a":1}'
    header = _signed(body, "s")
    verify_signature(body, header, "s")
    with pytest.raises(ServiceError):
        verify_signature(b'{"a":2}', header, "s")
