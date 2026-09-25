"""Credits and payments, per-account notifications and usage, and operator tools."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ...core.config import get_settings
from ...db import Account, Site, User, session_scope
from ...integrations.notify import send
from ...services import billing, budget, credits
from ...services import notifications as notify_service
from ...services.accounts import Principal
from ...services.integrations import get_integrations
from ..deps import current_principal, require_superuser, require_user

public = APIRouter(tags=["billing"])  # no authentication
router = APIRouter(tags=["billing"])


class CheckoutIn(BaseModel):
    pack_id: str = Field(max_length=40)


class GrantIn(BaseModel):
    credits: float = Field(gt=-1_000_000, lt=1_000_000)
    note: str = Field(default="", max_length=300)


@public.get("/billing/packs")
async def packs():
    return billing.public_packs()


@public.post("/billing/webhook", include_in_schema=False)
async def webhook(request: Request):
    payload = await request.body()
    return await billing.handle_webhook(payload, request.headers.get("stripe-signature", ""))


@router.get("/billing")
async def overview(p: Principal = Depends(current_principal)):
    return {
        "credits": await credits.balance(p.account_id) / credits.MC,
        "metered": await credits.is_metered(p.account_id),
        **billing.public_packs(),
        "purchases": await billing.purchases(p.account_id),
        "ledger": await credits.ledger(p.account_id, 100),
        "spend": await credits.spend_summary(p.account_id, 30),
    }


@router.post("/billing/checkout")
async def checkout(body: CheckoutIn, request: Request, p: Principal = Depends(require_user)):
    base = (await get_integrations()).public_url or get_settings().public_url
    if not base:
        base = request.headers.get("origin") or str(request.base_url)
    return {"url": await billing.create_checkout(p.account_id, p.user_id, body.pack_id, base)}


# ── per-account notifications and usage ──────────────────────────────────────
@router.get("/account/notifications")
async def get_notifications(p: Principal = Depends(current_principal)):
    return await notify_service.public(p.account_id)


@router.put("/account/notifications")
async def put_notifications(body: notify_service.AccountNotifyUpdate, p: Principal = Depends(require_user)):
    await notify_service.update(p.account_id, body)
    return await notify_service.public(p.account_id)


@router.post("/account/notifications/test")
async def test_notifications(p: Principal = Depends(require_user)):
    _, cfg = await notify_service.channel_config(p.account_id)
    if not cfg.notifications_configured:
        return {"ok": False, "message": "Add an email, Slack or webhook channel first."}
    try:
        channels = await send(cfg, "Test notification", "Notifications from your Rankcrew crew will look like this.",
                              event="test")
        return {"ok": True, "message": f"Sent via {', '.join(channels)}"}
    except RuntimeError as exc:
        return {"ok": False, "message": str(exc)}


@router.get("/account/usage")
async def account_usage(days: int = 30, p: Principal = Depends(current_principal)):
    days = max(1, min(days, 90))
    return {**(await budget.usage_summary(days, account_id=p.account_id)),
            "spend": await credits.spend_summary(p.account_id, days)}


# ── operator ─────────────────────────────────────────────────────────────────
@router.get("/admin/accounts", dependencies=[Depends(require_superuser)])
async def admin_accounts(q: str = "", limit: int = 100):
    async with session_scope() as s:
        stmt = select(Account).order_by(Account.id.desc()).limit(min(limit, 500))
        if q:
            ids = select(User.account_id).where(User.email.contains(q.strip().lower()))
            stmt = stmt.where((Account.name.contains(q)) | (Account.id.in_(ids)))
        rows = list(await s.scalars(stmt))
        ids = [a.id for a in rows]
        owners = dict((await s.execute(select(User.account_id, User.email).where(User.account_id.in_(ids),
                                                                                 User.role == "owner"))).all())
        sites = dict((await s.execute(select(Site.account_id, func.count()).where(Site.account_id.in_(ids))
                                      .group_by(Site.account_id))).all())
    return [{"id": a.id, "name": a.name, "kind": a.kind, "status": a.status, "credits": a.balance_mc / credits.MC,
             "owner": owners.get(a.id), "sites": sites.get(a.id, 0), "created_at": a.created_at} for a in rows]


@router.post("/admin/accounts/{account_id}/credits", dependencies=[Depends(require_superuser)])
async def admin_grant(account_id: int, body: GrantIn):
    mc = round(body.credits * credits.MC)
    if mc > 0:
        new = await credits.add(account_id, mc, "grant", note=body.note or "Granted by operator")
    else:
        new = await credits.charge(account_id, -mc, "adjustment", note=body.note or "Adjusted by operator")
    return {"credits": (new or 0) / credits.MC}


@router.post("/admin/accounts/{account_id}/status", dependencies=[Depends(require_superuser)])
async def admin_status(account_id: int, value: Literal["active", "suspended"]):
    async with session_scope() as s:
        acc = await s.get(Account, account_id)
        if acc is not None and acc.kind == "customer":
            acc.status = value
    return {"ok": True}
