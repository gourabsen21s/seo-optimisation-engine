from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Request
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sse_starlette.sse import EventSourceResponse

from ...db import Job, session_scope
from ...services.common import NotFound

router = APIRouter(tags=["jobs"])


def serialize(j: Job) -> dict:
    return {c: getattr(j, c) for c in ("id", "type", "site_id", "status", "events", "result", "error", "created_at",
                                        "started_at", "finished_at")}


async def _get(job_id: int) -> Job:
    async with session_scope() as s:
        job = await s.get(Job, job_id)
    if job is None:
        raise NotFound(f"job {job_id} not found")
    return job


@router.get("/jobs/{job_id}")
async def get_job(job_id: int):
    return serialize(await _get(job_id))


@router.get("/sites/{site_id}/jobs")
async def site_jobs(site_id: int, limit: int = 20):
    async with session_scope() as s:
        jobs = list(await s.scalars(select(Job).where(Job.site_id == site_id).order_by(Job.id.desc())
                                    .limit(min(limit, 100))))
    return [serialize(j) for j in jobs]


@router.get("/jobs/{job_id}/stream")
async def stream_job(job_id: int, request: Request):
    await _get(job_id)

    async def events():
        sent = 0
        while True:
            if await request.is_disconnected():
                return
            job = await _get(job_id)
            for event in job.events[sent:]:
                yield {"event": "progress", "data": json.dumps(event)}
            sent = len(job.events)
            if job.status in ("done", "failed"):
                yield {"event": "done", "data": json.dumps(jsonable_encoder(serialize(job)))}
                return
            await asyncio.sleep(1)

    return EventSourceResponse(events(), ping=15)
