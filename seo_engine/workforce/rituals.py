"""Team rituals: daily standup (deterministic, free) and the weekly report (written by Maya)."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from pydantic_ai import Agent, UsageLimits
from sqlalchemy import func, select

from ..agent.llm import build_model, model_settings
from ..db import Audit, Fix, MetricSnapshot, Report, Site, Task, session_scope
from ..knowledge.memory import TEAM, get_memory
from ..services import budget
from ..services.common import JobReporter, NotFound, now
from ..services.settings import get_llm_config
from .roster import MANAGER, ROSTER


async def standup(site_id: int, report: JobReporter | None = None) -> dict[str, Any]:
    since = now() - timedelta(hours=24)
    async with session_scope() as s:
        tasks = list(await s.scalars(select(Task).where(Task.site_id == site_id)))
    lines = [f"# Daily standup — {now():%A %d %B %Y}", ""]
    for e in ROSTER.values():
        mine = [t for t in tasks if t.assignee == e.id]
        done = [t for t in mine if t.status == "done" and t.completed_at and t.completed_at >= since]
        doing = [t for t in mine if t.status in ("in_progress", "todo")]
        blocked = [t for t in mine if t.status == "blocked"]
        if not (done or doing or blocked):
            continue
        lines.append(f"**{e.name}** — {e.title}")
        lines += [f"- ✅ {t.title}" for t in done[:5]]
        lines += [f"- 🔄 {t.title}" for t in doing[:5]]
        lines += [f"- ⛔ waiting on you: {t.title}" for t in blocked[:5]]
        lines.append("")
    if len(lines) == 2:
        lines.append("Quiet day — no tasks in the last 24 hours.")
    content = "\n".join(lines)
    async with session_scope() as s:
        rep = Report(site_id=site_id, kind="standup", author=MANAGER, title=f"Standup {now():%Y-%m-%d}",
                     content=content)
        s.add(rep)
        await s.flush()
        return {"report_id": rep.id}


async def weekly_report(site_id: int, report: JobReporter | None = None) -> dict[str, Any]:
    since = now() - timedelta(days=7)
    async with session_scope() as s:
        site = await s.get(Site, site_id)
        if site is None:
            raise NotFound(f"site {site_id} not found")
        done = list(await s.scalars(select(Task).where(Task.site_id == site_id, Task.completed_at >= since)))
        applied = await s.scalar(select(func.count()).select_from(Fix).where(
            Fix.site_id == site_id, Fix.status == "applied", Fix.applied_at >= since))
        measured = list(await s.scalars(select(Fix).where(Fix.site_id == site_id, Fix.impact.is_not(None))
                                        .order_by(Fix.applied_at.desc()).limit(20)))
        audits = list(await s.scalars(select(Audit).where(Audit.site_id == site_id, Audit.status == "done")
                                      .order_by(Audit.id.desc()).limit(2)))
        metrics = list(await s.scalars(select(MetricSnapshot).where(MetricSnapshot.site_id == site_id,
                                                                     MetricSnapshot.captured_at >= since)))
    facts = [f"Site: {site.name} ({site.url})",
             f"Scores: {[(a.overall_score, a.seo_score, a.adsense_score) for a in audits]} (latest first)",
             f"Fixes applied this week: {applied}",
             f"Search Console (daily): clicks {sum(m.clicks for m in metrics):.0f}, impressions "
             f"{sum(m.impressions for m in metrics):.0f}" if metrics else "Search Console: not connected or no data",
             "Tasks finished this week:"] + [f"- {t.assignee}: {t.title} — {((t.output or {}).get('summary') or '')[:200]}"
                                              for t in done[:40]]
    facts += ["Measured impact:"] + [f"- {f.title}: {(f.impact or {}).get('verdict')}" for f in measured]
    facts += ["Team memory highlights:"] + [f"- {m['text']}" for m in (await get_memory().list(site_id, TEAM))[:15]]
    data = "\n".join(facts)
    try:
        remaining = await budget.ensure_budget(site_id, MANAGER)  # out of credits: the factual digest below
        cfg = await get_llm_config()
        agent = Agent(build_model(cfg), instructions=ROSTER[MANAGER].card() + (
            "\nWrite the weekly report for the site owner in Markdown: headline results, what the team did, "
            "measured impact (honest about what is not yet measurable), risks, and next week's plan. Keep it under "
            "400 words. Never promise rankings."), model_settings=model_settings(cfg))
        content = (await agent.run(data, capabilities=[budget.meter(site_id, MANAGER, cfg.model)],
                                   usage_limits=UsageLimits(request_limit=3,
                                                            total_tokens_limit=remaining or None))).output
    except Exception:  # no LLM configured, no credits, or it failed: fall back to a factual digest
        content = "# Weekly report\n\n" + data
    async with session_scope() as s:
        rep = Report(site_id=site_id, kind="weekly", author=MANAGER, title=f"Weekly report — week of {since:%d %b}",
                     content=content)
        s.add(rep)
        await s.flush()
        return {"report_id": rep.id}


async def list_reports(site_id: int, kind: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    q = select(Report).where(Report.site_id == site_id)
    if kind:
        q = q.where(Report.kind == kind)
    async with session_scope() as s:
        rows = list(await s.scalars(q.order_by(Report.id.desc()).limit(limit)))
    return [{"id": r.id, "kind": r.kind, "author": r.author, "title": r.title, "content": r.content,
             "created_at": r.created_at} for r in rows]
