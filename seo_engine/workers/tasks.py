"""Job execution: dispatches a Job row to the right service and records status/result/errors."""

from __future__ import annotations

import logging
import traceback
from typing import Any

from sqlalchemy import update

from ..db import Job, session_scope
from ..services import cycles
from ..services import fixes as fix_service
from ..services.common import JobReporter, now
from ..workforce import rituals, runner

log = logging.getLogger(__name__)


async def _dispatch(job: Job, report: JobReporter) -> dict[str, Any]:
    p = job.params or {}
    if job.type == "audit":
        return await cycles.run_audit_only(job.site_id, report)
    if job.type == "task":
        return await runner.execute_task(p["task_id"], report)
    if job.type == "standup":
        return await rituals.standup(job.site_id, report)
    if job.type == "weekly_report":
        return await rituals.weekly_report(job.site_id, report)
    if job.type == "cycle":
        return await cycles.run_cycle(job.site_id, report, fresh_audit=p.get("fresh_audit", True))
    if job.type == "apply":
        return await fix_service.apply(job.site_id, p["ids"], report)
    if job.type == "rollback":
        inverse = await fix_service.create_rollback(p["fix_id"])
        return await fix_service.apply(job.site_id, [inverse.id], report)
    if job.type == "measure":
        return await cycles.run_measure(job.site_id, report)
    if job.type == "rank_check":
        from ..services import rankings

        return await rankings.check_rankings(job.site_id, report)
    raise ValueError(f"unknown job type {job.type}")


async def execute_job(job_id: int) -> None:
    async with session_scope() as s:
        claimed = await s.execute(update(Job).where(Job.id == job_id, Job.status == "queued")
                                  .values(status="running", started_at=now()))
        if not claimed.rowcount:
            return  # already taken by another worker
        job = await s.get(Job, job_id)
    report = JobReporter(job_id)
    try:
        result = await _dispatch(job, report)
        status, error = "done", None
    except Exception as exc:
        log.exception("job %s failed", job_id)
        result, status = None, "failed"
        error = f"{type(exc).__name__}: {exc}"
        await report(f"Failed: {error}", "error")
        if job.type in ("cycle", "audit", "apply", "rollback"):
            from ..integrations.notify import notify_event

            await notify_event("job_failed", f"{job.type.capitalize()} failed", error[:1500], site_id=job.site_id,
                               level="error")
        log.debug(traceback.format_exc())
    async with session_scope() as s:
        j = await s.get(Job, job_id)
        j.status, j.result, j.error, j.finished_at = status, _jsonable(result), error, now()


def _jsonable(value: Any) -> Any:
    import json

    return json.loads(json.dumps(value, default=str)) if value is not None else None
