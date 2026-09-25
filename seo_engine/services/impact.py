"""Measure the ranking impact of applied fixes with Search Console data and roll back regressions."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import select

from ..core.config import get_settings
from ..db import Fix, MetricSnapshot, Site, session_scope
from ..integrations.notify import notify_event
from .common import JobReporter, now
from .fixes import AUTO_ROLLBACK_KINDS, apply, create_rollback
from .sites import gsc_for

log = logging.getLogger(__name__)


def verdict(baseline: dict[str, float], current: dict[str, float]) -> tuple[str, dict[str, float]]:
    """Compare per-day clicks/impressions, CTR and position between two windows."""
    b_days, c_days = baseline.get("days", 28), current.get("days", 14)
    b_clicks, c_clicks = baseline["clicks"] / b_days, current["clicks"] / c_days
    delta = {
        "clicks_per_day": round(c_clicks - b_clicks, 3),
        "impressions_per_day": round(current["impressions"] / c_days - baseline["impressions"] / b_days, 2),
        "ctr": round(current["ctr"] - baseline["ctr"], 4),
        "position": round(current["position"] - baseline["position"], 2),  # negative = better
    }
    enough = baseline["impressions"] >= 100 or current["impressions"] >= 50
    if not enough:
        return "insufficient_data", delta
    if delta["position"] >= 2 or (b_clicks > 0.5 and c_clicks < b_clicks * 0.7 and delta["ctr"] < 0):
        return "worse", delta
    if delta["position"] <= -1 or (b_clicks > 0 and c_clicks > b_clicks * 1.15) or (b_clicks == 0 and c_clicks > 0.3):
        return "improved", delta
    return "neutral", delta


async def snapshot_metrics(site: Site) -> MetricSnapshot | None:
    gsc = gsc_for(site)
    if gsc is None:
        return None
    rows = await gsc.performance(days=1, dimensions=("query",), row_limit=25)
    total = await gsc.performance(days=1, dimensions=("date",), row_limit=1)
    t = total[0] if total else {"clicks": 0, "impressions": 0, "ctr": 0, "position": None}
    snap = MetricSnapshot(site_id=site.id, clicks=t["clicks"], impressions=t["impressions"], ctr=t["ctr"],
                          position=t["position"],
                          top_queries=[{k: r[k] for k in ("query", "clicks", "impressions", "position")} for r in rows])
    async with session_scope() as s:
        s.add(snap)
    return snap


async def measure_and_rollback(site: Site, report: JobReporter) -> dict[str, Any]:
    gsc = gsc_for(site)
    if gsc is None:
        return {"measured": 0}
    window = get_settings().impact_window_days
    cutoff = now() - timedelta(days=window + 3)  # GSC data lags ~3 days
    async with session_scope() as s:
        due = list(await s.scalars(select(Fix).where(Fix.site_id == site.id, Fix.status == "applied",
                                                      Fix.impact.is_(None), Fix.baseline.is_not(None),
                                                      Fix.applied_at <= cutoff)))
    if not due:
        return {"measured": 0}
    await report(f"Measuring impact of {len(due)} fixes applied ≥{window} days ago")
    current = await gsc.page_metrics(days=window)
    rollbacks, results = [], {"improved": 0, "neutral": 0, "worse": 0, "insufficient_data": 0}
    async with session_scope() as s:
        for fix in await s.scalars(select(Fix).where(Fix.id.in_([f.id for f in due]))):
            cur = current.get(fix.target_url or "")
            if cur is None:
                fix.impact = {"verdict": "insufficient_data", "measured_at": now().isoformat()}
                results["insufficient_data"] += 1
                continue
            v, delta = verdict(fix.baseline, {**cur, "days": window})
            fix.impact = {"verdict": v, "delta": delta, "measured_at": now().isoformat()}
            results[v] += 1
            if v == "worse" and site.autopilot != "off" and fix.kind in AUTO_ROLLBACK_KINDS:
                rollbacks.append(fix.id)
    for fix_id in rollbacks:
        try:
            inverse = await create_rollback(fix_id)
            await apply(site.id, [inverse.id], report)
            await report.warn(f"Rolled back fix {fix_id} (ranking got worse)")
            await notify_event("rollback", "A change was rolled back",
                               f"Search performance got worse after “{inverse.title.removeprefix('Rollback: ')}”, so the "
                               "team reverted it automatically.", site_id=site.id, path=f"/sites/{site.id}/fixes",
                               level="warning")
        except Exception as exc:
            await report.warn(f"Rollback of {fix_id} failed: {exc}")
    return {"measured": len(due), **results, "rolled_back": len(rollbacks)}
