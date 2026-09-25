"""arq worker entry point:  arq seo_engine.workers.worker.WorkerSettings  (or `seo-engine worker`)."""

from __future__ import annotations

from arq import cron
from arq.connections import RedisSettings

from ..core.config import get_settings
from ..core.logging import configure_logging
from .scheduler import tick
from .tasks import execute_job


async def run_job(ctx, job_id: int) -> None:
    await execute_job(job_id)


async def scheduler_tick(ctx) -> None:
    if get_settings().scheduler_enabled:
        await tick()


async def startup(ctx) -> None:
    configure_logging()


_settings = get_settings()


class WorkerSettings:
    functions = [run_job]
    cron_jobs = [cron(scheduler_tick, minute=set(range(0, 60, 10)), run_at_startup=True, unique=True)]
    on_startup = startup
    redis_settings = RedisSettings.from_dsn(_settings.redis_url or "redis://localhost:6379")
    job_timeout = _settings.job_timeout_seconds
    max_jobs = 4
    keep_result = 3600
