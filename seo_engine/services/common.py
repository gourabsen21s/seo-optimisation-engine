"""Shared service helpers: secrets, job progress reporting, serialisation of stored crawls."""

from __future__ import annotations

import gzip
import logging
from datetime import UTC, datetime
from functools import lru_cache

from sqlalchemy import select

from ..core.config import get_settings
from ..core.models import AuditReport, CrawlResult
from ..core.security import SecretBox
from ..db import Audit, Job, session_scope

log = logging.getLogger(__name__)


class ServiceError(RuntimeError):
    """A user-facing error (bad input, missing configuration)."""


class NotFound(ServiceError):
    pass


class Forbidden(ServiceError):
    """Signed in, but this role may not do that (HTTP 403)."""


@lru_cache
def secret_box() -> SecretBox:
    return SecretBox(get_settings().secret_key)


def now() -> datetime:
    return datetime.now(UTC)


def pack_crawl(crawl: CrawlResult) -> bytes:
    return gzip.compress(crawl.model_dump_json().encode(), compresslevel=6)


def unpack_crawl(blob: bytes) -> CrawlResult:
    return CrawlResult.model_validate_json(gzip.decompress(blob))


async def latest_audit(site_id: int) -> tuple[Audit, AuditReport, CrawlResult]:
    async with session_scope() as s:
        audit = await s.scalar(select(Audit).where(Audit.site_id == site_id, Audit.status == "done")
                               .order_by(Audit.id.desc()).limit(1))
    if audit is None or audit.report is None or audit.crawl_gz is None:
        raise ServiceError("No completed audit for this site yet — run an audit first.")
    return audit, AuditReport.model_validate(audit.report), unpack_crawl(audit.crawl_gz)


class JobReporter:
    """Appends progress events to a Job row (each in its own transaction so SSE clients see them live)."""

    def __init__(self, job_id: int):
        self.job_id = job_id

    async def __call__(self, message: str, level: str = "info") -> None:
        log.info("job %s: %s", self.job_id, message)
        async with session_scope() as s:
            job = await s.get(Job, self.job_id)
            if job is not None:
                job.events = [*job.events, {"at": now().isoformat(), "message": message, "level": level}][-500:]

    async def warn(self, message: str) -> None:
        await self(message, "warning")
