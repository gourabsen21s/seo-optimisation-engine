"""The autonomous scheduler: enqueues audits, optimisation cycles and impact measurement when they are due."""

from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select

from ..core.config import get_settings
from ..db import Job, Report, Site, session_scope
from ..services.common import now
from .queue import active_job, enqueue

log = logging.getLogger(__name__)


def _due(last, hours: int) -> bool:
    return bool(hours) and (last is None or now() - last >= timedelta(hours=hours))


async def tick() -> list[int]:
    """One scheduling pass. Safe to run concurrently thanks to the per-site active-job check."""
    settings = get_settings()
    enqueued: list[int] = []
    async with session_scope() as s:
        sites = list(await s.scalars(select(Site)))
        stale = list(await s.scalars(select(Job).where(Job.status == "running", Job.started_at
                                                       < now() - timedelta(seconds=settings.job_timeout_seconds))))
        for job in stale:  # worker died mid-job
            job.status, job.error, job.finished_at = "failed", "timed out", now()
    for site in sites:
        if await active_job(site.id):
            continue
        if site.autopilot != "off" and _due(site.last_cycle_at, site.cycle_every_hours):
            enqueued.append(await enqueue("cycle", site.id, {"fresh_audit": True}))
        elif _due(site.last_audit_at, site.audit_every_hours):
            enqueued.append(await enqueue("audit", site.id))
        elif site.gsc_secret and site.autopilot != "off":
            async with session_scope() as s:
                last_measure = await s.scalar(select(Job.created_at).where(Job.site_id == site.id,
                                                                            Job.type == "measure")
                                              .order_by(Job.id.desc()).limit(1))
            if _due(last_measure, 24):
                enqueued.append(await enqueue("measure", site.id))
    for site in sites:  # daily rank tracking for sites with tracked keywords
        from ..services.rankings import has_keywords

        if not await has_keywords(site.id):
            continue
        async with session_scope() as s:
            last_check = await s.scalar(select(Job.created_at).where(Job.site_id == site.id, Job.type == "rank_check")
                                        .order_by(Job.id.desc()).limit(1))
        if _due(last_check, 24):
            enqueued.append(await enqueue("rank_check", site.id, dedupe=False))
    try:  # workspaces left behind by crashed code tasks
        from ..code.workspace import purge_stale

        await purge_stale()
    except Exception:
        log.exception("workspace purge failed")
    for site in sites:  # team rituals for sites the team is actively working on
        if site.autopilot == "off":
            continue
        async with session_scope() as s:
            last = dict((await s.execute(select(Report.kind, Report.created_at).where(Report.site_id == site.id)
                                         .order_by(Report.id.desc()).limit(50))).all()[::-1])
        if _due(last.get("standup"), 24):
            enqueued.append(await enqueue("standup", site.id, dedupe=False))
        if _due(last.get("weekly"), 24 * 7):
            enqueued.append(await enqueue("weekly_report", site.id, dedupe=False))
    if enqueued:
        log.info("scheduler enqueued jobs %s", enqueued)
    return enqueued


async def run_forever(stop: asyncio.Event) -> None:
    """In-process scheduler loop used when there is no Redis/arq worker."""
    interval = get_settings().scheduler_interval_seconds
    while not stop.is_set():
        try:
            await tick()
        except Exception:
            log.exception("scheduler tick failed")
        try:
            await asyncio.wait_for(stop.wait(), timeout=interval)
        except TimeoutError:
            pass
