"""Job queue abstraction: arq/Redis in production, in-process asyncio tasks when SEO_REDIS_URL is empty."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from sqlalchemy import select

from ..core.config import get_settings
from ..db import Job, session_scope

log = logging.getLogger(__name__)
JOB_TYPES = {"audit", "cycle", "apply", "rollback", "measure", "task", "standup", "weekly_report", "rank_check"}
_inline_tasks: set[asyncio.Task] = set()
_pool = None


async def _arq_pool():
    global _pool
    if _pool is None:
        from arq import create_pool
        from arq.connections import RedisSettings

        _pool = await create_pool(RedisSettings.from_dsn(get_settings().redis_url))
    return _pool


async def active_job(site_id: int) -> Job | None:
    async with session_scope() as s:
        return await s.scalar(select(Job).where(Job.site_id == site_id, Job.status.in_(("queued", "running")))
                              .order_by(Job.id.desc()).limit(1))


async def enqueue(job_type: str, site_id: int | None, params: dict[str, Any] | None = None,
                  dedupe: bool = True) -> int:
    if job_type not in JOB_TYPES:
        raise ValueError(f"unknown job type {job_type}")
    if dedupe and site_id is not None:
        existing = await active_job(site_id)
        if existing is not None and existing.type in ("audit", "cycle") and job_type in ("audit", "cycle"):
            return existing.id
    async with session_scope() as s:
        job = Job(type=job_type, site_id=site_id, params=params or {}, status="queued", events=[])
        s.add(job)
        await s.flush()
        job_id = job.id
    if get_settings().redis_url:
        pool = await _arq_pool()
        await pool.enqueue_job("run_job", job_id, _job_id=f"seo-job-{job_id}")
    else:
        from .tasks import execute_job

        task = asyncio.create_task(execute_job(job_id))
        _inline_tasks.add(task)
        task.add_done_callback(_inline_tasks.discard)
    return job_id


async def shutdown() -> None:
    for task in list(_inline_tasks):
        task.cancel()
    if _pool is not None:
        await _pool.close()
