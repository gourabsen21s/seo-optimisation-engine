"""Credits: the unit customers buy and the crew spends.

Balances are integers in millicredits (1 credit = 1000 mc) so per-token LLM charges add up exactly. Every change goes
through `_apply`, which updates the balance atomically and appends a ledger row in the same transaction.
"""

from __future__ import annotations

import logging
import math
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from ..core.config import get_settings
from ..db import Account, CreditEntry, Site, session_scope
from .common import NotFound, ServiceError, now

log = logging.getLogger(__name__)
MC = 1000


class InsufficientCredits(ServiceError):
    """Mapped to HTTP 402 by the API."""


class EmailNotVerified(ServiceError):
    """Mapped to HTTP 403 by the API."""


def fmt(mc: int) -> str:
    c = mc / MC
    return f"{c:,.0f}" if float(c).is_integer() else f"{c:,.1f}"


async def account_of_site(site_id: int | None) -> int | None:
    if site_id is None:
        return None
    async with session_scope() as s:
        return await s.scalar(select(Site.account_id).where(Site.id == site_id))


async def balance(account_id: int) -> int:
    async with session_scope() as s:
        mc = await s.scalar(select(Account.balance_mc).where(Account.id == account_id))
    if mc is None:
        raise NotFound("account not found")
    return int(mc)


async def _apply(account_id: int, amount_mc: int, reason: str, *, ref: str | None = None,
                 site_id: int | None = None, note: str = "") -> int | None:
    """Adjust the balance and write the ledger row. Returns the new balance, or None if `ref` was already used."""
    try:
        async with session_scope() as s:
            res = await s.execute(update(Account).where(Account.id == account_id)
                                  .values(balance_mc=Account.balance_mc + amount_mc)
                                  .returning(Account.balance_mc))
            new = res.scalar_one_or_none()
            if new is None:
                raise NotFound("account not found")
            s.add(CreditEntry(account_id=account_id, amount_mc=amount_mc, balance_mc=new, reason=reason, ref=ref,
                              site_id=site_id, note=note[:300]))
        return int(new)
    except IntegrityError:
        if ref is None:
            raise
        return None  # idempotent: this credit (e.g. a Stripe session) was already applied


async def add(account_id: int, amount_mc: int, reason: str, *, ref: str | None = None, note: str = "") -> int | None:
    if amount_mc <= 0:
        raise ValueError("credit amounts are positive")
    return await _apply(account_id, amount_mc, reason, ref=ref, note=note)


async def charge(account_id: int | None, amount_mc: int, reason: str, *, site_id: int | None = None,
                 note: str = "") -> int | None:
    """Spend credits for work already done. Never raises for a low balance: guards run before the work."""
    if not account_id or amount_mc <= 0:
        return None
    new = await _apply(account_id, -amount_mc, reason, site_id=site_id, note=note)
    if new is not None and new <= 0:
        await _warn_exhausted(account_id, site_id)
    return new


async def _warn_exhausted(account_id: int, site_id: int | None) -> None:
    """Tell the account once (per 24 h) that the crew has stopped for lack of credits."""
    from datetime import timedelta

    async with session_scope() as s:
        acc = await s.get(Account, account_id)
        if acc is None or (acc.credits_warned_at and now() - acc.credits_warned_at < timedelta(hours=24)):
            return
        acc.credits_warned_at = now()
    from ..integrations.notify import notify_event

    await notify_event("credits_exhausted", "Your crew is out of credits",
                       "Audits, AI tasks and rank checks are paused until you add credits.",
                       site_id=site_id, account_id=account_id, path="/billing", level="warning")


# ── guards ───────────────────────────────────────────────────────────────────
async def ensure(account_id: int | None, *, minimum_mc: int = 1, user_verified: bool | None = None) -> int | None:
    """Raise before starting paid work. `account_id` None (no tenant, e.g. a CLI audit) is free."""
    if not account_id:
        return None
    async with session_scope() as s:
        acc = await s.get(Account, account_id)
        if acc is None:
            raise NotFound("account not found")
        if acc.kind == "operator":
            return None  # the operator's own workspace is not metered
        if get_settings().require_email_verification:
            verified = user_verified
            if verified is None:
                from ..db import User

                verified = bool(await s.scalar(select(func.count()).select_from(User).where(
                    User.account_id == account_id, User.email_verified_at.is_not(None))))
            if not verified:
                raise EmailNotVerified("Confirm your email address first. We sent you a link when you signed up.")
        if acc.status != "active":
            raise InsufficientCredits("This workspace is suspended.")
        if acc.balance_mc < minimum_mc:
            raise InsufficientCredits(f"Out of credits: you have {fmt(max(0, acc.balance_mc))}. "
                                      "Add credits in Billing to keep the crew working.")
        return int(acc.balance_mc)


async def ensure_for_site(site_id: int | None, **kw: Any) -> int | None:
    return await ensure(await account_of_site(site_id), **kw)


async def is_metered(account_id: int | None) -> bool:
    if not account_id:
        return False
    async with session_scope() as s:
        kind = await s.scalar(select(Account.kind).where(Account.id == account_id))
    return kind == "customer"


# ── prices ───────────────────────────────────────────────────────────────────
def price_pages(pages: int) -> int:
    return max(1, pages) * get_settings().credit_mc_per_page


def price_tokens(tokens: int) -> int:
    per = max(1, get_settings().credit_tokens_per_credit)
    return math.ceil(max(0, tokens) * MC / per) if tokens > 0 else 0


def price_rank_keywords(n: int) -> int:
    return max(0, n) * get_settings().credit_mc_per_rank_keyword


async def affordable_pages(account_id: int | None, wanted: int) -> int:
    """How many pages this account can pay to crawl (operator / no tenant: all of them)."""
    if not await is_metered(account_id):
        return wanted
    per = max(1, get_settings().credit_mc_per_page)
    return max(0, min(wanted, (await balance(account_id)) // per))


def price_table() -> list[dict[str, Any]]:
    cfg = get_settings()
    return [
        {"item": "Audit", "unit": "per crawled page", "credits": cfg.credit_mc_per_page / MC},
        {"item": "AI work (tasks, chat, reports)", "unit": f"per {cfg.credit_tokens_per_credit:,} tokens",
         "credits": 1},
        {"item": "Live rank check", "unit": "per keyword", "credits": cfg.credit_mc_per_rank_keyword / MC},
        {"item": "Fixes, rollbacks, Search Console", "unit": "", "credits": 0},
    ]


async def ledger(account_id: int, limit: int = 100) -> list[dict[str, Any]]:
    async with session_scope() as s:
        rows = list(await s.scalars(select(CreditEntry).where(CreditEntry.account_id == account_id)
                                    .order_by(CreditEntry.id.desc()).limit(min(limit, 500))))
        names = dict((await s.execute(select(Site.id, Site.name).where(Site.account_id == account_id))).all())
    return [{"id": r.id, "at": r.created_at, "amount": r.amount_mc / MC, "balance": r.balance_mc / MC,
             "reason": r.reason, "note": r.note, "site_id": r.site_id, "site": names.get(r.site_id)} for r in rows]


async def spend_summary(account_id: int, days: int = 30) -> dict[str, Any]:
    from datetime import timedelta

    start = now() - timedelta(days=days)
    async with session_scope() as s:
        rows = (await s.execute(select(CreditEntry.reason, func.sum(CreditEntry.amount_mc))
                                .where(CreditEntry.account_id == account_id, CreditEntry.amount_mc < 0,
                                       CreditEntry.created_at >= start)
                                .group_by(CreditEntry.reason))).all()
    return {"days": days, "by_reason": {r: -int(v or 0) / MC for r, v in rows}}
