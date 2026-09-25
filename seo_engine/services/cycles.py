"""The autonomous optimisation cycle, run like a team sprint.

  1. Theo (Technical Auditor) audits the site and refreshes the knowledge index.
  2. Search Console data is pulled; fixes applied ≥ N days ago are measured and regressions rolled back.
  3. Maya (SEO Manager) plans the cycle and assigns tasks on the board.
  4. Colleagues work their tasks in parallel (and may delegate further); Jev verifies every proposed change;
     autopilot applies eligible fixes.
  5. When the board for this cycle is clear, Maya reviews the results, records team lessons, and reports.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select

from ..db import AgentRun, Fix, Site, session_scope
from ..knowledge.index import get_index
from ..workforce import board
from ..workforce.roster import AUDITOR, MANAGER
from ..workforce.runner import execute_task
from . import audits as audit_service
from .common import JobReporter, NotFound, latest_audit
from .impact import measure_and_rollback, snapshot_metrics
from .settings import get_llm_config
from .sites import gsc_for

log = logging.getLogger(__name__)


def run_summary(r: AgentRun) -> dict[str, Any]:
    return {c: getattr(r, c) for c in ("id", "kind", "status", "model", "output", "usage", "error", "created_at",
                                        "finished_at")}


async def list_runs(site_id: int, limit: int = 30) -> list[AgentRun]:
    async with session_scope() as s:
        return list(await s.scalars(select(AgentRun).where(AgentRun.site_id == site_id)
                                    .order_by(AgentRun.id.desc()).limit(limit)))


async def _impact_digest(site_id: int) -> str:
    async with session_scope() as s:
        measured = list(await s.scalars(select(Fix).where(Fix.site_id == site_id, Fix.impact.is_not(None))
                                        .order_by(Fix.applied_at.desc()).limit(20)))
    return "\n".join(f"- {f.title} on {f.target_url}: {(f.impact or {}).get('verdict')} "
                     f"{(f.impact or {}).get('delta', {})}" for f in measured)


async def run_cycle(site_id: int, report: JobReporter, fresh_audit: bool = True) -> dict[str, Any]:
    async with session_scope() as s:
        site = await s.get(Site, site_id)
    if site is None:
        raise NotFound(f"site {site_id} not found")
    llm_cfg = await get_llm_config()
    async with session_scope() as s:
        run = AgentRun(site_id=site_id, kind="cycle", status="running", model=llm_cfg.model, output={})
        s.add(run)
        await s.flush()
        run_id = run.id

    try:
        # 1. Technical audit (Theo) + knowledge index
        if fresh_audit:
            audit_task = await board.create_task(site_id, AUDITOR, "Crawl and audit the site", created_by=MANAGER,
                                                 kind="audit", priority=1, run_id=run_id, enqueue=False)
            await execute_task(audit_task.id, report)
        audit, audit_report, crawl = await latest_audit(site_id)
        if not fresh_audit:
            await get_index().index_audit(site_id, crawl, audit_report)

        # 2. Rankings + learning from previous changes
        impact: dict[str, Any] = {}
        gsc = gsc_for(site)
        if gsc:
            await report("Fetching Search Console rankings (last 28 days)")
            try:
                rows = await gsc.performance(days=28)
                await get_index().index_queries(site_id, rows)
                await snapshot_metrics(site)
                impact = await measure_and_rollback(site, report)
            except Exception as exc:
                await report.warn(f"Search Console unavailable: {exc}")

        # 3. Maya plans and assigns
        digest = await _impact_digest(site_id)
        plan = await board.create_task(
            site_id, MANAGER, "Plan this optimisation cycle", created_by=MANAGER, kind="plan", priority=1,
            run_id=run_id, enqueue=False,
            description="Decide the highest-value work for this cycle and assign it. Consider failing AdSense "
                        "requirements, ranking opportunities (if Search Console is connected) and what past changes "
                        "achieved.\n\nMeasured impact of past changes:\n" + (digest or "- none measured yet")
                        + (f"\n\nThis cycle's impact check: {impact}" if impact else ""))
        async with session_scope() as s:
            r = await s.get(AgentRun, run_id)
            r.audit_id = audit.id
        try:
            await execute_task(plan.id, report)
        except Exception as exc:  # the cycle still closes via the wrap-up path
            await report.warn(f"Planning failed: {str(exc)[:300]}")
        created = await board.list_tasks(site_id, run_id=run_id, status="todo,in_progress,blocked")
        await report(f"Maya assigned {len(created)} tasks; the team is working on them")
        if not created:
            # nothing delegated → wrap up right away
            from ..workforce.runner import _maybe_wrap_up

            task, _ = await board.get_task(plan.id)
            await _maybe_wrap_up(task)
        return {"run_id": run_id, "tasks": len(created), **{f"impact_{k}": v for k, v in impact.items()}}
    except Exception as exc:
        async with session_scope() as s:
            r = await s.get(AgentRun, run_id)
            r.status, r.error = "failed", str(exc)[:2000]
        raise


async def run_audit_only(site_id: int, report: JobReporter) -> dict[str, Any]:
    """Standalone audit (scheduled or manual) that also refreshes the knowledge index."""
    res = await audit_service.run_audit(site_id, report)
    _, audit_report, crawl = await latest_audit(site_id)
    await get_index().index_audit(site_id, crawl, audit_report)
    return res


async def run_measure(site_id: int, report: JobReporter) -> dict[str, Any]:
    async with session_scope() as s:
        site = await s.get(Site, site_id)
    if site is None:
        raise NotFound(f"site {site_id} not found")
    await snapshot_metrics(site)
    return await measure_and_rollback(site, report)
