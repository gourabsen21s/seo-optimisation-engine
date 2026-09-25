from __future__ import annotations

from fastapi import APIRouter

from ...db import Fix, session_scope
from ...fixes.models import FixStatus
from ...services import fixes as fix_service
from ...services import sites as site_service
from ...services.common import NotFound
from ...workers.queue import enqueue
from ..schemas import Ids

router = APIRouter(tags=["fixes"])


@router.get("/sites/{site_id}/fixes")
async def list_fixes(site_id: int, status: str | None = None):
    return [fix_service.serialize(f) for f in await fix_service.list_fixes(site_id, status)]


@router.post("/fixes/approve")
async def approve(body: Ids):
    return {"updated": await fix_service.set_status(body.ids, FixStatus.APPROVED)}


@router.post("/fixes/reject")
async def reject(body: Ids):
    return {"updated": await fix_service.set_status(body.ids, FixStatus.REJECTED)}


@router.post("/sites/{site_id}/fixes/preview")
async def preview(site_id: int, body: Ids):
    results = await fix_service.preview(site_id, body.ids)
    return {"results": [r.model_dump() for r in results]}


@router.post("/sites/{site_id}/fixes/apply", status_code=202)
async def apply(site_id: int, body: Ids):
    site_service.connector_for(await site_service.get_site(site_id))  # fail fast if no connector
    await fix_service.set_status(body.ids, FixStatus.APPROVED)
    return {"job_id": await enqueue("apply", site_id, {"ids": body.ids}, dedupe=False)}


@router.post("/fixes/{fix_id}/rollback", status_code=202)
async def rollback(fix_id: str):
    async with session_scope() as s:
        fix = await s.get(Fix, fix_id)
    if fix is None:
        raise NotFound(f"fix {fix_id} not found")
    return {"job_id": await enqueue("rollback", fix.site_id, {"fix_id": fix_id}, dedupe=False)}
