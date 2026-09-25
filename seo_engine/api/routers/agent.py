from __future__ import annotations

from fastapi import APIRouter, Response

from ...services import chat as chat_service
from ...services import cycles as cycle_service
from ...services import sites as site_service
from ...workers.queue import enqueue
from ..schemas import ChatIn, CycleIn

router = APIRouter(tags=["agent"])


@router.post("/sites/{site_id}/cycles", status_code=202)
async def start_cycle(site_id: int, body: CycleIn | None = None):
    await site_service.get_site(site_id)
    return {"job_id": await enqueue("cycle", site_id, {"fresh_audit": (body or CycleIn()).fresh_audit})}


@router.get("/sites/{site_id}/cycles")
async def list_cycles(site_id: int):
    return [cycle_service.run_summary(r) for r in await cycle_service.list_runs(site_id)]


@router.get("/sites/{site_id}/chat")
async def get_chat(site_id: int):
    return {"transcript": await chat_service.transcript(site_id)}


@router.post("/sites/{site_id}/chat")
async def send_chat(site_id: int, body: ChatIn):
    return await chat_service.send(site_id, body.message)


@router.delete("/sites/{site_id}/chat", status_code=204)
async def clear_chat(site_id: int):
    await chat_service.clear(site_id)
    return Response(status_code=204)
