"""LLM spend control: a usage ledger plus an optional daily token budget shared by all employees and chat."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any

from sqlalchemy import func, select

from ..db import LLMUsage, session_scope
from .common import ServiceError, now


class BudgetExceeded(ServiceError):
    pass


# (UTC day, site) pairs already told that the daily budget ran out, so each site hears it once a day.
_budget_notified: set[tuple[str, int | None]] = set()


def _day_start() -> datetime:
    n = now()
    return datetime.combine(n.date(), time.min, tzinfo=n.tzinfo)


async def tokens_since(start: datetime, account_id: int | None = None) -> int:
    q = select(func.coalesce(func.sum(LLMUsage.input_tokens + LLMUsage.output_tokens), 0)).where(LLMUsage.at >= start)
    if account_id is not None:
        q = q.where(LLMUsage.account_id == account_id)
    async with session_scope() as s:
        total = await s.scalar(q)
    return int(total or 0)


async def remaining_today() -> int | None:
    """Tokens left today, or None when no budget is set."""
    from .integrations import get_integrations

    budget = (await get_integrations()).llm_daily_token_budget
    if not budget:
        return None
    return max(0, budget - await tokens_since(_day_start()))


async def ensure_budget(site_id: int | None = None, actor: str = "") -> int | None:
    """Raise before AI work: the site's account must have credits (InsufficientCredits), and the platform's
    optional daily token budget must not be used up (BudgetExceeded)."""
    from . import credits

    await credits.ensure_for_site(site_id)
    remaining = await remaining_today()
    if remaining is not None and remaining <= 0:
        from ..integrations.notify import notify_event

        day_key = (_day_start().date().isoformat(), site_id)
        if day_key in _budget_notified:
            raise BudgetExceeded("The platform's daily AI budget is used up. AI work resumes tomorrow (UTC).")
        _budget_notified.add(day_key)
        if len(_budget_notified) > 10_000:
            _budget_notified.clear()
        await notify_event("budget_reached", "AI work paused for today",
                           "The platform's daily AI budget is used up, so the crew paused AI work until tomorrow (UTC). "
                           "Audits and fixes keep running.", site_id=site_id, level="warning")
        raise BudgetExceeded("The platform's daily AI budget is used up. AI work resumes tomorrow (UTC).")
    # A metered account's balance caps the run too, so one task cannot spend far past zero.
    cap = await credits.affordable_tokens(await credits.account_of_site(site_id))
    if cap is not None:
        remaining = max(1, cap if remaining is None else min(remaining, cap))
    return remaining


def meter(site_id: int | None, actor: str, model: str | None) -> Any:
    """A PydanticAI capability that bills every model response as it arrives and re-checks credits and the daily
    budget before the next request. Runs sharing one balance can then overshoot by at most one request each, and a
    run that fails half-way has still paid for what it used."""
    from pydantic_ai.capabilities import Hooks

    async def before(ctx: Any, request_context: Any) -> Any:
        await ensure_budget(site_id, actor)  # raises InsufficientCredits / BudgetExceeded and stops the run
        return request_context

    async def after(ctx: Any, *, request_context: Any, response: Any) -> Any:
        u = response.usage
        await record(site_id, actor, model, {"requests": 1, "input_tokens": u.input_tokens,
                                             "output_tokens": u.output_tokens})
        return response

    return Hooks(before_model_request=before, after_model_request=after)


async def record(site_id: int | None, actor: str, model: str | None, usage: Any) -> None:
    """Record a PydanticAI RunUsage (or a dict with the same keys) and charge the site's account for it."""
    from . import credits

    get = (lambda k: usage.get(k, 0)) if isinstance(usage, dict) else (lambda k: getattr(usage, k, 0))
    tin, tout = int(get("input_tokens") or 0), int(get("output_tokens") or 0)
    if not (tin or tout or get("requests")):
        return
    account_id = await credits.account_of_site(site_id)
    async with session_scope() as s:
        s.add(LLMUsage(site_id=site_id, account_id=account_id, actor=actor, model=model,
                       requests=int(get("requests") or 0), input_tokens=tin, output_tokens=tout))
    if await credits.is_metered(account_id):
        await credits.charge(account_id, credits.price_tokens(tin + tout), "llm", site_id=site_id,
                             note=f"{actor}: {tin + tout:,} tokens")


async def usage_summary(days: int = 30, account_id: int | None = None) -> dict[str, Any]:
    """Token usage, platform-wide, or for one account when `account_id` is given."""
    from .integrations import get_integrations

    start = now() - timedelta(days=days)
    scope = [LLMUsage.at >= start] + ([LLMUsage.account_id == account_id] if account_id is not None else [])
    async with session_scope() as s:
        by_actor = (await s.execute(
            select(LLMUsage.actor, func.sum(LLMUsage.input_tokens), func.sum(LLMUsage.output_tokens),
                   func.sum(LLMUsage.requests))
            .where(*scope).group_by(LLMUsage.actor))).all()
        rows = (await s.execute(select(LLMUsage.at, LLMUsage.input_tokens + LLMUsage.output_tokens)
                                .where(*scope))).all()
    per_day: dict[str, int] = {}
    for at, tokens in rows:
        key = at.date().isoformat()
        per_day[key] = per_day.get(key, 0) + int(tokens or 0)
    budget = (await get_integrations()).llm_daily_token_budget
    return {
        "today": await tokens_since(_day_start(), account_id),
        "budget": budget if account_id is None else 0,
        "last_days": days,
        "per_day": [{"date": d, "tokens": t} for d, t in sorted(per_day.items())],
        "by_actor": [{"actor": a, "input_tokens": int(i or 0), "output_tokens": int(o or 0), "requests": int(r or 0)}
                     for a, i, o, r in by_actor],
    }
