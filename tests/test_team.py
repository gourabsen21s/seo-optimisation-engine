"""Workspace teams, customer API keys, refunds, and the guards that keep customers inside their own workspace."""

from __future__ import annotations

import json
import time
from types import SimpleNamespace

from tests.test_saas import _signed, browser, signup, verify


async def _invite_link(c, email: str, role: str = "member") -> str:
    r = await c.post("/api/workspace/invites", json={"email": email, "role": role})
    assert r.status_code == 201, r.text
    return r.json()["dev_invite_url"].split("token=")[1]


async def test_invite_accept_roles_and_removal(fixture_site):
    async with browser() as owner, browser() as guest, browser() as outsider:
        me = await signup(owner, "team-owner@example.com")
        # Unverified owners cannot send invitations (they are emails in our name).
        r = await owner.post("/api/workspace/invites", json={"email": "mate@example.com"})
        assert r.status_code == 400 and "Confirm your own email" in r.json()["detail"]
        await verify(owner, me)
        site = (await owner.post("/api/sites", json={"url": fixture_site + "?team=inv", "start_audit": False})).json()
        token = await _invite_link(owner, "mate@example.com")
        # Already-registered emails cannot be invited.
        await signup(outsider, "outsider@example.com")
        assert (await owner.post("/api/workspace/invites", json={"email": "outsider@example.com"})).status_code == 409

        info = (await guest.get("/api/auth/invite", params={"token": token})).json()
        assert info["email"] == "mate@example.com" and info["role"] == "member"
        r = await guest.post("/api/auth/accept-invite", json={"token": token, "name": "Mate",
                                                              "password": "a long mate passphrase", "accept_terms": True})
        assert r.status_code == 200, r.text
        mate = r.json()
        assert mate["account"]["id"] == me["account"]["id"] and mate["user"]["email_verified"] is True
        # Single use.
        assert (await guest.post("/api/auth/accept-invite", json={"token": token, "name": "x", "accept_terms": True,
                                                                  "password": "another long passphrase"})
                ).status_code == 401
        # The member shares the workspace's sites but cannot manage the team.
        assert any(s["id"] == site["site"]["id"] for s in (await guest.get("/api/sites")).json())
        assert (await guest.post("/api/workspace/invites", json={"email": "x@example.com"})).status_code == 403
        assert (await guest.post("/api/workspace/api-keys", json={"name": "nope"})).status_code == 403
        # The outsider sees none of it.
        assert (await outsider.get(f"/api/sites/{site['site']['id']}")).status_code == 404

        members = (await owner.get("/api/workspace/members")).json()
        mate_id = next(m["id"] for m in members["members"] if m["email"] == "mate@example.com")
        # A workspace always keeps an owner.
        r = await owner.patch(f"/api/workspace/members/{me['user']['id']}", json={"role": "member"})
        assert r.status_code == 400
        assert (await owner.patch(f"/api/workspace/members/{mate_id}", json={"role": "owner"})).status_code == 200
        assert (await owner.patch(f"/api/workspace/members/{mate_id}", json={"role": "member"})).status_code == 200
        # Another workspace's owner cannot touch this member.
        assert (await outsider.delete(f"/api/workspace/members/{mate_id}")).status_code == 404
        assert (await owner.delete(f"/api/workspace/members/{mate_id}")).status_code == 204
        assert (await guest.get("/api/auth/me")).status_code == 401  # their session ended with them

        # Pending invitations can be withdrawn, and count towards the member cap.
        await _invite_link(owner, "later@example.com")
        pending = (await owner.get("/api/workspace/members")).json()["invites"]
        assert [i["email"] for i in pending] == ["later@example.com"]
        assert (await owner.delete(f"/api/workspace/invites/{pending[0]['id']}")).status_code == 204
        assert (await owner.get("/api/workspace/members")).json()["invites"] == []


async def test_customer_api_keys(fixture_site):
    import httpx

    async with browser() as a, browser() as b:
        me = await signup(a, "keys-a@example.com")
        await signup(b, "keys-b@example.com")
        site_a = (await a.post("/api/sites", json={"url": fixture_site + "?keys=a", "start_audit": False})).json()
        site_b = (await b.post("/api/sites", json={"url": fixture_site + "?keys=b", "start_audit": False})).json()
        r = await a.post("/api/workspace/api-keys", json={"name": "CI"})
        assert r.status_code == 201, r.text
        raw, key_id = r.json()["key"], r.json()["id"]
        assert raw.startswith("rc_") and r.json()["prefix"] == raw[:10]
        assert "key" not in (await a.get("/api/workspace/api-keys")).json()[0]  # never shown again

        transport = a._transport  # same app instance
        async with httpx.AsyncClient(transport=transport, base_url="http://test", timeout=60) as api:
            auth = {"Authorization": f"Bearer {raw}"}
            sites = (await api.get("/api/sites", headers=auth)).json()
            assert [s["id"] for s in sites] == [site_a["site"]["id"]]
            # Scoped to its workspace: another tenant's site is a 404.
            assert (await api.get(f"/api/sites/{site_b['site']['id']}", headers=auth)).status_code == 404
            # Writes need no CSRF header (it is not a cookie), but keys in the URL are refused.
            assert (await api.patch(f"/api/sites/{site_a['site']['id']}", json={"name": "Via key"}, headers=auth)
                    ).status_code == 200
            assert (await api.get("/api/sites", params={"api_key": raw})).status_code == 401
            # A customer key is not an operator.
            assert (await api.get("/api/admin/accounts", headers=auth)).status_code == 403
            assert (await a.delete(f"/api/workspace/api-keys/{key_id}")).status_code == 204
            assert (await api.get("/api/sites", headers=auth)).status_code == 401
        assert me["account"]["kind"] == "customer"


async def test_refunds_take_back_credits_once(monkeypatch):
    from seo_engine.core.config import get_settings
    from seo_engine.db import Purchase, session_scope

    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", "whsec_test")
    async with browser() as c:
        me = await signup(c, "refund@example.com")
        async with session_scope() as s:
            p = Purchase(account_id=me["account"]["id"], pack_id="starter", credits=500, amount_cents=900,
                         stripe_session_id="cs_refund_1")
            s.add(p)
            await s.flush()
            pid = p.id

        async def hook(event: dict) -> dict:
            body = json.dumps(event).encode()
            r = await c.post("/api/billing/webhook", content=body,
                             headers={"stripe-signature": _signed(body, "whsec_test", int(time.time()))})
            assert r.status_code == 200, r.text
            return r.json()

        paid = {"type": "checkout.session.completed", "data": {"object": {
            "id": "cs_refund_1", "payment_status": "paid", "amount_total": 900, "payment_intent": "pi_1",
            "metadata": {"purchase_id": str(pid)}}}}
        assert (await hook(paid))["status"] == "fulfilled"
        assert (await c.get("/api/billing")).json()["credits"] == 600

        def refunded(cents: int) -> dict:
            return {"type": "charge.refunded", "data": {"object": {"payment_intent": "pi_1", "amount_refunded": cents}}}

        assert (await hook(refunded(450)))["credits_removed"] == 250  # half refunded → half the credits
        assert (await hook(refunded(450)))["status"] == "already_refunded"  # Stripe retries are harmless
        assert (await hook(refunded(900)))["credits_removed"] == 250
        billing = (await c.get("/api/billing")).json()
        assert billing["credits"] == 100
        assert billing["purchases"][0]["status"] == "refunded" and billing["purchases"][0]["refunded_cents"] == 900
        # A replayed "paid" event after the refund does not hand the credits back.
        assert (await hook(paid))["status"] == "already_fulfilled"
        assert (await c.get("/api/billing")).json()["credits"] == 100
        assert (await hook(refunded(900)))["status"] == "already_refunded"


async def test_customers_cannot_use_server_side_connectors(client, fixture_site, site_copy):
    async with browser() as c:
        await signup(c, "conn@example.com")
        sid = (await c.post("/api/sites", json={"url": fixture_site + "?conn=1", "start_audit": False})).json()["site"]["id"]
        assert "local" not in (await c.get("/api/connectors/fields")).json()
        r = await c.put(f"/api/sites/{sid}/connector", json={"type": "local", "config": {"root": str(site_copy)}})
        assert r.status_code == 400 and "not available" in r.json()["detail"]
        # An operator cannot hand one to a customer site either.
        r = await client.put(f"/api/sites/{sid}/connector", json={"type": "local", "config": {"root": str(site_copy)}})
        assert r.status_code == 400
    # The operator's own sites still can.
    assert "local" in (await client.get("/api/connectors/fields")).json()


async def test_wordpress_and_webhooks_must_be_public(monkeypatch, fixture_site):
    from seo_engine.core.config import get_settings

    async with browser() as c:
        await signup(c, "ssrf@example.com")
        sid = (await c.post("/api/sites", json={"url": fixture_site + "?ssrf=1", "start_audit": False})).json()["site"]["id"]
        monkeypatch.setattr(get_settings(), "allow_private_networks", False)
        r = await c.put(f"/api/sites/{sid}/connector", json={"type": "wordpress", "config": {
            "base_url": "http://127.0.0.1:9/", "username": "admin", "app_password": "x x x"}})
        assert r.status_code == 400 and "cannot be used" in r.json()["detail"]
        r = await c.put("/api/account/notifications", json={"notify_webhook_url": "https://127.0.0.1/hook"})
        assert r.status_code == 400 and "cannot be used" in r.json()["detail"]
        r = await c.put("/api/account/notifications", json={"notify_webhook_url": "http://example.com/hook"})
        assert r.status_code == 400


async def test_admin_emails_need_a_verified_address(monkeypatch):
    from seo_engine.core.config import get_settings

    monkeypatch.setattr(get_settings(), "admin_emails", "boss@example.com")
    async with browser() as c:
        me = await signup(c, "boss@example.com")
        assert me["is_superuser"] is False
        assert (await c.get("/api/admin/accounts")).status_code == 403
        await c.post("/api/auth/logout")
        await c.post("/api/auth/login", json={"email": "boss@example.com", "password": "correct horse battery"})
        assert (await c.get("/api/auth/me")).json()["is_superuser"] is False  # still unproven
        await verify(c, me)
        assert (await c.get("/api/auth/me")).json()["is_superuser"] is True
        assert (await c.get("/api/admin/accounts")).status_code == 200


async def test_credit_floor_and_comment_scope(client, site_with_audit, fixture_site):
    from sqlalchemy import update

    from seo_engine.db import Account, session_scope
    from seo_engine.workforce import board
    from seo_engine.workforce.tools import comment

    async with browser() as c:
        me = await signup(c, "floor@example.com")
        await verify(c, me)
        sid = (await c.post("/api/sites", json={"url": fixture_site + "?floor=1", "start_audit": False})).json()["site"]["id"]
        async with session_scope() as s:  # half a credit left: not enough to start anything
            await s.execute(update(Account).where(Account.id == me["account"]["id"]).values(balance_mc=500))
        r = await c.post(f"/api/sites/{sid}/audits")
        assert r.status_code == 402 and "at least 1" in r.json()["detail"]

    # An AI employee working on one site cannot post into another site's tasks.
    other = await board.create_task(site_with_audit, "manager", "Someone else's task", enqueue=False)
    ctx = SimpleNamespace(deps=SimpleNamespace(site_id=sid, task_id=None, employee_id="manager"))
    assert "not found" in await comment(ctx, "injected", task_id=other.id)
    _, comments = await board.get_task(other.id)
    assert not any(cm.body == "injected" for cm in comments)


async def test_invite_to_suspended_workspace_is_refused(client):
    async with browser() as owner, browser() as guest:
        me = await signup(owner, "suspended-owner@example.com")
        await verify(owner, me)
        token = await _invite_link(owner, "late@example.com")
        r = await client.post(f"/api/admin/accounts/{me['account']['id']}/status", params={"value": "suspended"})
        assert r.status_code == 200, r.text
        r = await guest.post("/api/auth/accept-invite", json={"token": token, "name": "Late", "accept_terms": True,
                                                              "password": "a long late passphrase"})
        assert r.status_code == 401 and "suspended" in r.json()["detail"]


async def test_leaving_owner_takes_their_keys_and_invites_along(fixture_site):
    import httpx

    async with browser() as a, browser() as b:
        me = await signup(a, "boss-a@example.com")
        await verify(a, me)
        b_token = await _invite_link(a, "co-owner@example.com", role="owner")
        r = await b.post("/api/auth/accept-invite", json={"token": b_token, "name": "Co", "accept_terms": True,
                                                          "password": "co owner passphrase"})
        assert r.status_code == 200, r.text
        co_id = r.json()["user"]["id"]
        key = (await b.post("/api/workspace/api-keys", json={"name": "B's key"})).json()
        assert (await a.get("/api/workspace/api-keys")).json()[0]["created_by"] == "Co"
        alias_token = await _invite_link(b, "alias@example.com", role="owner")
        # While an owner, B redirects the notifications; that setting outlives B, the grants do not.
        assert (await b.put("/api/account/notifications", json={"email_members": False})).status_code == 200
        assert (await a.delete(f"/api/workspace/members/{co_id}")).status_code == 204
        async with httpx.AsyncClient(transport=a._transport, base_url="http://test", timeout=60) as api:
            assert (await api.get("/api/sites", headers={"Authorization": f"Bearer {key['key']}"})).status_code == 401
        # The invitation B sent died with B.
        assert (await b.get("/api/auth/invite", params={"token": alias_token})).status_code == 401


async def test_members_cannot_change_notifications_and_keys_stay_in_headers():
    import httpx

    async with browser() as owner, browser() as mate:
        me = await signup(owner, "notify-owner@example.com")
        await verify(owner, me)
        token = await _invite_link(owner, "notify-mate@example.com")
        await mate.post("/api/auth/accept-invite", json={"token": token, "name": "M", "accept_terms": True,
                                                         "password": "member passphrase!"})
        assert (await mate.get("/api/account/notifications")).status_code == 200
        assert (await mate.put("/api/account/notifications", json={"email_members": False})).status_code == 403
        assert (await mate.post("/api/account/notifications/test")).status_code == 403
        key = (await owner.post("/api/workspace/api-keys", json={"name": "k"})).json()["key"]
        async with httpx.AsyncClient(transport=owner._transport, base_url="http://test", timeout=60) as api:
            r = await api.get("/api/sites", params={"api_key": key}, headers={"Authorization": "x"})
            assert r.status_code == 401


async def test_operator_workspace_has_no_invites_or_keys():
    from seo_engine.db import User, session_scope
    from seo_engine.services import accounts, team
    from seo_engine.services.common import ServiceError, now

    account_id = await accounts.operator_account_id()
    async with session_scope() as s:
        u = User(account_id=account_id, email="op-owner@example.com", role="owner", is_superuser=True,
                 password_hash=accounts.hash_password("operator passphrase"), email_verified_at=now())
        s.add(u)
        await s.flush()
        uid = u.id
    for call in (team.invite(uid, "someone@example.com"), team.create_key(uid, "k")):
        try:
            await call
            raise AssertionError("operator workspace allowed it")
        except ServiceError as exc:
            assert "create-admin" in str(exc)


async def test_paid_jobs_are_not_queued_twice(client, fixture_site):
    from seo_engine.db import Job, session_scope
    from seo_engine.workers.queue import enqueue

    sid = (await client.post("/api/sites", json={"url": fixture_site + "?dedupe=1", "start_audit": False})).json()["site"]["id"]
    async with session_scope() as s:
        running = Job(type="rank_check", site_id=sid, params={}, status="running", events=[])
        s.add(running)
        await s.flush()
        rid = running.id
    assert await enqueue("rank_check", sid, dedupe=False) == rid


async def test_refund_before_payment_is_retried(monkeypatch):
    from seo_engine.core.config import get_settings
    from seo_engine.db import Purchase, session_scope

    monkeypatch.setattr(get_settings(), "stripe_webhook_secret", "whsec_test")
    async with browser() as c:
        me = await signup(c, "early-refund@example.com")
        async with session_scope() as s:
            p = Purchase(account_id=me["account"]["id"], pack_id="starter", credits=500, amount_cents=900,
                         stripe_session_id="cs_early")
            s.add(p)
            await s.flush()
            pid = p.id
        body = json.dumps({"type": "charge.refunded", "data": {"object": {
            "payment_intent": "pi_early", "amount": 900, "amount_refunded": 900,
            "metadata": {"purchase_id": str(pid)}}}}).encode()
        r = await c.post("/api/billing/webhook", content=body,
                         headers={"stripe-signature": _signed(body, "whsec_test", int(time.time()))})
        assert r.status_code == 503  # Stripe retries; nothing was applied
        assert (await c.get("/api/billing")).json()["credits"] == 100


def test_url_and_credential_guards():
    import json as _json

    from seo_engine.core.security import _is_public
    from seo_engine.integrations.gsc import GOOGLE_TOKEN_URI, GSCConfig, SearchConsole

    assert _is_public("8.8.8.8")
    for ip in ("127.0.0.1", "10.0.0.1", "169.254.169.254", "100.100.100.200", "::1", "::ffff:127.0.0.1", "0.0.0.0"):
        assert not _is_public(ip), ip
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    pem = rsa.generate_private_key(public_exponent=65537, key_size=2048).private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    info = {"type": "service_account", "client_email": "x@y.iam.gserviceaccount.com", "private_key": pem,
            "private_key_id": "1", "token_uri": "http://127.0.0.1:9/steal"}
    sc = SearchConsole(GSCConfig(property_url="sc-domain:example.com", service_account_json=_json.dumps(info)))
    assert sc._creds._token_uri == GOOGLE_TOKEN_URI


def test_invite_email_text_is_plain():
    from seo_engine.api.routers.workspace import _plain

    assert _plain("Acme\nBooks") == "Acme Books"
    assert "http" not in _plain("Verify now at https://evil.example/login")
    assert "evil.com" not in _plain("go to evil.com")
