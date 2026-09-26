"""Buying credits: packs, Stripe Checkout sessions and the Stripe webhook that fulfils them.

Talks to Stripe's REST API directly (no SDK). Fulfilment is idempotent twice over: the purchase row flips from
pending to paid once, and the ledger's unique (reason, ref) refuses a second credit for the same session.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from typing import Any

import httpx
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from ..core.config import get_settings
from ..db import Account, Purchase, User, session_scope
from . import credits
from .common import NotFound, ServiceError, now

log = logging.getLogger(__name__)
STRIPE_API = "https://api.stripe.com/v1"
SIGNATURE_TOLERANCE = 300  # seconds


class Pack(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]{1,40}$")
    name: str
    credits: int = Field(gt=0)
    price_cents: int = Field(gt=0)
    note: str = ""


DEFAULT_PACKS = [
    Pack(id="starter", name="Starter", credits=500, price_cents=900, note="A few audits and a week of AI work"),
    Pack(id="growth", name="Growth", credits=2000, price_cents=2900, note="One site, fully managed for a month"),
    Pack(id="scale", name="Scale", credits=6000, price_cents=7900, note="Several sites or a large catalogue"),
]


class BillingUnavailable(ServiceError):
    """Mapped to HTTP 503: payments are not configured on this server."""


def packs() -> list[Pack]:
    raw = get_settings().credit_packs.strip()
    if not raw:
        return DEFAULT_PACKS
    try:
        return [Pack(**p) for p in json.loads(raw)]
    except (ValueError, ValidationError) as exc:
        log.error("SEO_CREDIT_PACKS is invalid (%s); using the default packs", exc)
        return DEFAULT_PACKS


def pack(pack_id: str) -> Pack:
    for p in packs():
        if p.id == pack_id:
            return p
    raise NotFound("Unknown credit pack.")


def enabled() -> bool:
    return bool(get_settings().stripe_secret_key)


def public_packs() -> dict[str, Any]:
    cfg = get_settings()
    return {"currency": cfg.currency, "enabled": enabled(), "signup_credits": cfg.signup_credits,
            "packs": [p.model_dump() for p in packs()], "prices": credits.price_table()}


async def _stripe(path: str, data: dict[str, Any]) -> dict[str, Any]:
    key = get_settings().stripe_secret_key
    async with httpx.AsyncClient(timeout=20) as client:
        r = await client.post(f"{STRIPE_API}{path}", data=data, auth=(key, ""))
    body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
    if r.status_code >= 400:
        msg = (body.get("error") or {}).get("message") or r.text[:300]
        log.error("stripe %s failed (%s): %s", path, r.status_code, msg)
        raise ServiceError(f"Payment provider error: {msg}")
    return body


async def create_checkout(account_id: int, user_id: int | None, pack_id: str, base_url: str) -> str:
    """Create a pending purchase and a Stripe Checkout session; returns the URL to redirect the browser to."""
    if not enabled():
        raise BillingUnavailable("Payments are not set up on this server yet.")
    p = pack(pack_id)
    cfg = get_settings()
    async with session_scope() as s:
        acc = await s.get(Account, account_id)
        user = await s.get(User, user_id) if user_id else None
        purchase = Purchase(account_id=account_id, user_id=user_id, pack_id=p.id, credits=p.credits,
                            amount_cents=p.price_cents, currency=cfg.currency)
        s.add(purchase)
        await s.flush()
        purchase_id, customer = purchase.id, acc.stripe_customer_id
        email = user.email if user else None
    base = base_url.rstrip("/")
    data: dict[str, Any] = {
        "mode": "payment",
        "client_reference_id": str(purchase_id),
        "success_url": f"{base}/billing?checkout=success&session_id={{CHECKOUT_SESSION_ID}}",
        "cancel_url": f"{base}/billing?checkout=cancelled",
        "line_items[0][quantity]": 1,
        "line_items[0][price_data][currency]": cfg.currency,
        "line_items[0][price_data][unit_amount]": p.price_cents,
        "line_items[0][price_data][product_data][name]": f"Rankcrew credits: {p.name} ({p.credits:,} credits)",
        "metadata[purchase_id]": str(purchase_id),
        "metadata[account_id]": str(account_id),
        "payment_intent_data[metadata][purchase_id]": str(purchase_id),
    }
    if customer:
        data["customer"] = customer
    else:
        data["customer_creation"] = "always"
        if email:
            data["customer_email"] = email
    session = await _stripe("/checkout/sessions", data)
    async with session_scope() as s:
        row = await s.get(Purchase, purchase_id)
        row.stripe_session_id = session["id"]
    return session["url"]


# ── webhook ──────────────────────────────────────────────────────────────────
def verify_signature(payload: bytes, header: str, secret: str, tolerance: int = SIGNATURE_TOLERANCE) -> None:
    """Stripe's scheme: HMAC-SHA256 over "<timestamp>.<payload>", sent as `t=…,v1=…`."""
    try:
        parts = dict(kv.split("=", 1) for kv in header.split(",") if "=" in kv)
        ts = int(parts["t"])
    except (KeyError, ValueError):
        raise ServiceError("Bad signature header") from None
    if abs(time.time() - ts) > tolerance:
        raise ServiceError("Signature timestamp outside tolerance")
    expected = hmac.new(secret.encode(), f"{ts}.".encode() + payload, hashlib.sha256).hexdigest()
    candidates = [v for k, v in (kv.split("=", 1) for kv in header.split(",") if "=" in kv) if k == "v1"]
    if not any(hmac.compare_digest(expected, c) for c in candidates):
        raise ServiceError("Signature mismatch")


async def handle_webhook(payload: bytes, signature: str) -> dict[str, Any]:
    secret = get_settings().stripe_webhook_secret
    if not secret:
        raise BillingUnavailable("Stripe webhook secret is not configured.")
    verify_signature(payload, signature or "", secret)
    event = json.loads(payload)
    kind = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}
    if kind in ("checkout.session.completed", "checkout.session.async_payment_succeeded"):
        if obj.get("payment_status") == "paid":
            return await fulfil(obj)
        return {"status": "awaiting_payment"}
    if kind in ("checkout.session.expired", "checkout.session.async_payment_failed"):
        await _mark(obj.get("id"), "expired" if kind.endswith("expired") else "failed")
        return {"status": "closed"}
    if kind == "charge.refunded":
        return await refund(obj)
    return {"status": "ignored"}


class RetryLater(BillingUnavailable):
    """The webhook cannot be applied yet; a non-2xx answer makes Stripe send it again later."""


async def refund(charge: dict[str, Any]) -> dict[str, Any]:
    """Take back the credits for the refunded share of a purchase. Idempotent per refunded total, so partial
    refunds and repeated webhooks each remove exactly what is newly refunded."""
    pi = charge.get("payment_intent")
    refunded = int(charge.get("amount_refunded") or 0)
    if not pi or refunded <= 0:
        return {"status": "ignored"}
    ref_id = str((charge.get("metadata") or {}).get("purchase_id") or "")
    try:
        async with session_scope() as s:
            row = await s.scalar(select(Purchase).where(Purchase.payment_intent_id == pi))
            if row is None and ref_id.isdigit():
                row = await s.get(Purchase, int(ref_id))
            if row is None or row.status not in ("paid", "refunded"):
                # Events can arrive out of order: refund only what has been paid for, so ask Stripe to retry.
                raise RetryLater(f"refund for payment {pi} arrived before the payment was recorded")
            total = int(charge.get("amount") or row.amount_cents)  # what was charged, tax included
            refunded, prev = min(refunded, total), row.refunded_cents or 0
            if refunded <= prev:
                return {"status": "already_refunded"}
            # Compare-and-swap on the refunded total: a concurrent webhook for the same charge matches nothing.
            res = await s.execute(update(Purchase).where(Purchase.id == row.id, Purchase.refunded_cents == prev)
                                  .values(refunded_cents=refunded, payment_intent_id=pi,
                                          status="refunded" if refunded >= total else row.status))
            if res.rowcount != 1:
                raise RetryLater("another refund for this payment is being applied")
            # Credits for the newly refunded share, removed in the same transaction as the purchase update.
            delta = row.credits * credits.MC * refunded // total - row.credits * credits.MC * prev // total
            if delta > 0:
                await credits.apply_in(s, row.account_id, -delta, "refund", ref=f"refund:{pi}:{refunded}",
                                       note=f"{row.pack_id} pack refunded")
    except IntegrityError:
        return {"status": "already_refunded"}
    return {"status": "refunded", "credits_removed": delta / credits.MC}


async def _mark(session_id: str | None, status: str) -> None:
    if not session_id:
        return
    async with session_scope() as s:
        row = await s.scalar(select(Purchase).where(Purchase.stripe_session_id == session_id))
        if row is not None and row.status == "pending":
            row.status = status


async def fulfil(session: dict[str, Any]) -> dict[str, Any]:
    sid = session.get("id")
    ref = (session.get("metadata") or {}).get("purchase_id") or session.get("client_reference_id")
    async with session_scope() as s:
        row = await s.scalar(select(Purchase).where(Purchase.stripe_session_id == sid)) if sid else None
        if row is None and ref and str(ref).isdigit():
            row = await s.get(Purchase, int(ref))
        if row is None:
            log.error("stripe session %s has no matching purchase", sid)
            return {"status": "unknown_purchase"}
        if int(session.get("amount_total") or 0) < row.amount_cents:
            log.error("stripe session %s paid %s, expected %s", sid, session.get("amount_total"), row.amount_cents)
            return {"status": "amount_mismatch"}
        already = row.status in ("paid", "refunded")
        if not already:  # a replayed "completed" event must not undo a later refund
            row.status = "paid"
        row.paid_at = row.paid_at or now()
        row.stripe_session_id = row.stripe_session_id or sid
        row.payment_intent_id = row.payment_intent_id or session.get("payment_intent")
        account_id, amount, pack_id = row.account_id, row.credits, row.pack_id
        if session.get("customer"):
            acc = await s.get(Account, account_id)
            acc.stripe_customer_id = acc.stripe_customer_id or session["customer"]
    new = await credits.add(account_id, amount * credits.MC, "purchase", ref=f"stripe:{sid}",
                            note=f"{pack_id} pack")
    return {"status": "already_fulfilled" if already or new is None else "fulfilled"}


async def purchases(account_id: int, limit: int = 50) -> list[dict[str, Any]]:
    async with session_scope() as s:
        rows = list(await s.scalars(select(Purchase).where(Purchase.account_id == account_id)
                                    .order_by(Purchase.id.desc()).limit(limit)))
    return [{"id": r.id, "pack_id": r.pack_id, "credits": r.credits, "amount_cents": r.amount_cents,
             "currency": r.currency, "status": r.status, "refunded_cents": r.refunded_cents or 0,
             "created_at": r.created_at, "paid_at": r.paid_at}
            for r in rows]
