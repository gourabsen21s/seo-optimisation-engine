"""LLM spend control: a usage ledger plus an optional daily token budget shared by all employees and chat."""

from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any

from sqlalchemy import func, select

from ..db import LLMUsage, session_scope
from .common import ServiceError, now


class BudgetExceeded(ServiceError):
    pass


def _day_start() -> datetime:
    n = now()
    return datetime.combine(n.date(), time.min, tzinfo=n.tzinfo)


async def tokens_since(start: datetime) -> int:
    async with session_scope() as s:
        total = await s.scalar(select(func.coalesce(func.sum(LLMUsage.input_tokens + LLMUsage.output_tokens), 0))
                               .where(LLMUsage.at >= start))
    return int(total or 0)


async def remaining_today() -> int | None:
    """Tokens left today, or None when no budget is set."""
    from .integrations import get_integrations

    budget = (await get_integrations()).llm_daily_token_budget
    if not budget:
        return None
    return max(0, budget - await tokens_since(_day_start()))


async def ensure_budget(site_id: int | None = None, actor: str = "") -> int | None:
    """Raise BudgetExceeded (and notify the owner once) when today's budget is used up."""
    remaining = await remaining_today()
    if remaining is not None and remaining <= 0:
        from ..integrations.notify import notify_event

        await notify_event("budget_reached", "Daily LLM budget reached",
                           "The team paused AI work until tomorrow (UTC). Raise the budget in Workspace settings → "
                           "Integrations to continue now.", site_id=site_id, path="/settings", level="warning")
        raise BudgetExceeded("Daily LLM token budget reached — AI work resumes tomorrow (UTC) or when the budget is "
                             "raised in Workspace settings.")
    return remaining


async def record(site_id: int | None, actor: str, model: str | None, usage: Any) -> None:
    """Record a PydanticAI RunUsage (or a dict with the same keys)."""
    get = (lambda k: usage.get(k, 0)) if isinstance(usage, dict) else (lambda k: getattr(usage, k, 0))
    async with session_scope() as s:
        s.add(LLMUsage(site_id=site_id, actor=actor, model=model, requests=int(get("requests") or 0),
                       input_tokens=int(get("input_tokens") or 0), output_tokens=int(get("output_tokens") or 0)))


async def usage_summary(days: int = 30) -> dict[str, Any]:
    from .integrations import get_integrations

    start = now() - timedelta(days=days)
    async with session_scope() as s:
        by_actor = (await s.execute(
            select(LLMUsage.actor, func.sum(LLMUsage.input_tokens), func.sum(LLMUsage.output_tokens),
                   func.sum(LLMUsage.requests))
            .where(LLMUsage.at >= start).group_by(LLMUsage.actor))).all()
        rows = (await s.execute(select(LLMUsage.at, LLMUsage.input_tokens + LLMUsage.output_tokens)
                                .where(LLMUsage.at >= start))).all()
    per_day: dict[str, int] = {}
    for at, tokens in rows:
        key = at.date().isoformat()
        per_day[key] = per_day.get(key, 0) + int(tokens or 0)
    budget = (await get_integrations()).llm_daily_token_budget
    return {
        "today": await tokens_since(_day_start()),
        "budget": budget,
        "last_days": days,
        "per_day": [{"date": d, "tokens": t} for d, t in sorted(per_day.items())],
        "by_actor": [{"actor": a, "input_tokens": int(i or 0), "output_tokens": int(o or 0), "requests": int(r or 0)}
                     for a, i, o, r in by_actor],
    }
