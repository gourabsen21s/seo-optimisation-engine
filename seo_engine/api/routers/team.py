from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from ...knowledge.index import get_index
from ...knowledge.memory import TEAM, get_memory
from ...services import sites as site_service
from ...workers.queue import enqueue
from ...workforce import board, rituals
from ...workforce.roster import ROSTER
from ..deps import require_credits

router = APIRouter(tags=["team"])


class TaskIn(BaseModel):
    assignee: str
    title: str = Field(min_length=3, max_length=300)
    description: str = Field(default="", max_length=8000)
    priority: int = Field(default=2, ge=1, le=4)


class TaskPatch(BaseModel):
    assignee: str | None = None
    priority: int | None = Field(default=None, ge=1, le=4)
    status: Literal["todo", "cancelled", "done"] | None = None


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=8000)


class MemoryIn(BaseModel):
    text: str = Field(min_length=3, max_length=2000)
    employee: str = TEAM


@router.get("/team/roster")
async def roster():
    return [e.public() for e in ROSTER.values()]


@router.get("/sites/{site_id}/team")
async def team(site_id: int):
    await site_service.get_site(site_id)
    status = await board.team_status(site_id)
    memories = await get_memory().list(site_id, limit=2000)
    per = {}
    for m in memories:
        per[m["employee"]] = per.get(m["employee"], 0) + 1
    return {"employees": [{**e, "memories": per.get(e["id"], 0)} for e in status],
            "team_memories": per.get(TEAM, 0)}


@router.get("/sites/{site_id}/tasks")
async def list_tasks(site_id: int, status: str | None = None, assignee: str | None = None, run_id: int | None = None):
    return [board.serialize(t) for t in await board.list_tasks(site_id, status, assignee, run_id)]


@router.post("/sites/{site_id}/tasks", status_code=201, dependencies=[Depends(require_credits)])
async def create_task(site_id: int, body: TaskIn):
    await site_service.get_site(site_id)
    task = await board.create_task(site_id, body.assignee, body.title, body.description, created_by="human",
                                   priority=body.priority)
    return board.serialize(task)


@router.get("/tasks/{task_id}")
async def get_task(task_id: int):
    task, comments = await board.get_task(task_id)
    return board.serialize(task, comments)


@router.patch("/tasks/{task_id}")
async def patch_task(task_id: int, body: TaskPatch):
    await board.update_task(task_id, body.model_dump(exclude_unset=True))
    task, comments = await board.get_task(task_id)
    return board.serialize(task, comments)


@router.post("/tasks/{task_id}/comments", status_code=201)
async def comment(task_id: int, body: CommentIn):
    await board.add_comment(task_id, "human", body.body, kind="answer")
    task, comments = await board.get_task(task_id)
    return board.serialize(task, comments)


@router.get("/sites/{site_id}/activity")
async def activity(site_id: int, limit: int = 100):
    return await board.activity(site_id, min(limit, 500))


@router.get("/sites/{site_id}/memories")
async def memories(site_id: int, employee: str | None = None, q: str | None = None):
    if q:
        return await get_memory().recall(site_id, q, employee, limit=30)
    return await get_memory().list(site_id, employee, limit=500)


@router.post("/sites/{site_id}/memories", status_code=201)
async def add_memory(site_id: int, body: MemoryIn):
    await site_service.get_site(site_id)
    memory_id = await get_memory().remember(site_id, body.text, body.employee, kind="owner_note",
                                            metadata={"author": "human"})
    return {"id": memory_id}


@router.delete("/sites/{site_id}/memories/{memory_id}", status_code=204)
async def forget(site_id: int, memory_id: str):
    await get_memory().forget(memory_id, site_id=site_id)
    return Response(status_code=204)


@router.get("/sites/{site_id}/knowledge")
async def knowledge(site_id: int, q: str, kind: str | None = None):
    return await get_index().search(site_id, q, limit=15, kinds=kind.split(",") if kind else None)


@router.get("/sites/{site_id}/reports")
async def reports(site_id: int, kind: str | None = None):
    return await rituals.list_reports(site_id, kind)


@router.post("/sites/{site_id}/reports/{kind}", status_code=202, dependencies=[Depends(require_credits)])
async def generate_report(site_id: int, kind: Literal["standup", "weekly"]):
    await site_service.get_site(site_id)
    return {"job_id": await enqueue("standup" if kind == "standup" else "weekly_report", site_id, dedupe=False)}
