"""The team board: tasks, comments, activity feed — with guardrails against runaway delegation."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select

from ..core.config import get_settings
from ..db import Activity, Task, TaskComment, session_scope
from ..services.common import NotFound, ServiceError, now
from .roster import ASSIGNABLE, ROSTER

OPEN = ("todo", "in_progress", "blocked")


def serialize(t: Task, comments: list[TaskComment] | None = None) -> dict[str, Any]:
    out = {c: getattr(t, c) for c in ("id", "site_id", "run_id", "parent_id", "depth", "kind", "title", "description",
                                       "assignee", "created_by", "status", "priority", "input", "output", "usage",
                                       "error", "created_at", "started_at", "completed_at")}
    if comments is not None:
        out["comments"] = [{"id": c.id, "author": c.author, "body": c.body, "kind": c.kind, "created_at": c.created_at}
                           for c in comments]
    return out


async def log_activity(site_id: int, actor: str, verb: str, message: str, task_id: int | None = None) -> None:
    async with session_scope() as s:
        s.add(Activity(site_id=site_id, actor=actor, verb=verb, message=message[:2000], task_id=task_id))


async def create_task(site_id: int, assignee: str, title: str, description: str = "", *, created_by: str = "human",
                      kind: str = "custom", priority: int = 2, input: dict | None = None, run_id: int | None = None,
                      parent_id: int | None = None, enqueue: bool = True) -> Task:
    settings = get_settings()
    if assignee not in ASSIGNABLE:
        raise ServiceError(f"unknown assignee {assignee!r}")
    creator = ROSTER.get(created_by)
    if creator and assignee not in creator.can_assign_to and assignee != created_by:
        raise ServiceError(f"{creator.name} cannot assign work to {ROSTER[assignee].name}")
    async with session_scope() as s:
        depth = 0
        if parent_id:
            parent = await s.get(Task, parent_id)
            depth = (parent.depth + 1) if parent else 0
            run_id = run_id or (parent.run_id if parent else None)
        if depth > settings.max_task_depth:
            raise ServiceError("delegation chain too deep — finish the work yourself or report back")
        if run_id:
            count = await s.scalar(select(func.count()).select_from(Task).where(Task.run_id == run_id))
            if (count or 0) >= settings.max_tasks_per_cycle:
                raise ServiceError("task budget for this cycle is used up — prioritise within existing tasks")
        dup = await s.scalar(select(Task).where(Task.site_id == site_id, Task.assignee == assignee,
                                                Task.title == title[:300], Task.status.in_(OPEN)))
        if dup:
            return dup
        task = Task(site_id=site_id, assignee=assignee, title=title[:300], description=description,
                    created_by=created_by, kind=kind, priority=max(1, min(4, priority)), input=input or {},
                    run_id=run_id, parent_id=parent_id, depth=depth, status="todo")
        s.add(task)
        await s.flush()
        task_id = task.id
    who = "You" if created_by == "human" else ROSTER[created_by].name if created_by in ROSTER else created_by
    await log_activity(site_id, created_by, "created_task", f"{who} assigned “{title}” to {ROSTER[assignee].name}",
                       task_id)
    if enqueue:
        from ..workers.queue import enqueue as enqueue_job

        await enqueue_job("task", site_id, {"task_id": task_id}, dedupe=False)
    return task


async def get_task(task_id: int) -> tuple[Task, list[TaskComment]]:
    async with session_scope() as s:
        task = await s.get(Task, task_id)
        if task is None:
            raise NotFound(f"task {task_id} not found")
        comments = list(await s.scalars(select(TaskComment).where(TaskComment.task_id == task_id)
                                        .order_by(TaskComment.id)))
    return task, comments


async def list_tasks(site_id: int, status: str | None = None, assignee: str | None = None,
                     run_id: int | None = None, limit: int = 300) -> list[Task]:
    q = select(Task).where(Task.site_id == site_id)
    if status:
        q = q.where(Task.status.in_(status.split(",")))
    if assignee:
        q = q.where(Task.assignee == assignee)
    if run_id:
        q = q.where(Task.run_id == run_id)
    async with session_scope() as s:
        return list(await s.scalars(q.order_by(Task.priority, Task.id.desc()).limit(limit)))


async def add_comment(task_id: int, author: str, body: str, kind: str = "comment") -> TaskComment:
    async with session_scope() as s:
        task = await s.get(Task, task_id)
        if task is None:
            raise NotFound(f"task {task_id} not found")
        c = TaskComment(task_id=task_id, author=author, body=body, kind=kind)
        s.add(c)
        requeue = author == "human" and task.status in ("blocked", "failed")
        if requeue:
            task.status, task.error = "todo", None
        site_id = task.site_id
    who = "You" if author == "human" else ROSTER.get(author).name if author in ROSTER else author
    await log_activity(site_id, author, "commented", f"{who}: {body[:200]}", task_id)
    if requeue:
        from ..workers.queue import enqueue as enqueue_job

        await enqueue_job("task", site_id, {"task_id": task_id}, dedupe=False)
    return c


async def update_task(task_id: int, data: dict[str, Any]) -> Task:
    requeue = False
    async with session_scope() as s:
        task = await s.get(Task, task_id)
        if task is None:
            raise NotFound(f"task {task_id} not found")
        if "assignee" in data and data["assignee"]:
            if data["assignee"] not in ASSIGNABLE:
                raise ServiceError("unknown assignee")
            requeue = task.assignee != data["assignee"] and task.status in ("todo", "blocked", "failed")
            task.assignee = data["assignee"]
        if data.get("priority"):
            task.priority = max(1, min(4, int(data["priority"])))
        if data.get("status") in ("todo", "cancelled", "done"):
            requeue = requeue or (data["status"] == "todo" and task.status in ("blocked", "failed", "cancelled"))
            task.status = data["status"]
            if data["status"] == "todo":
                task.error = None
        if requeue and task.status != "todo":
            task.status = "todo"
        site_id = task.site_id
    if requeue:
        from ..workers.queue import enqueue as enqueue_job

        await enqueue_job("task", site_id, {"task_id": task_id}, dedupe=False)
    return task


async def activity(site_id: int, limit: int = 100) -> list[dict[str, Any]]:
    async with session_scope() as s:
        rows = list(await s.scalars(select(Activity).where(Activity.site_id == site_id)
                                    .order_by(Activity.id.desc()).limit(limit)))
    return [{"id": a.id, "actor": a.actor, "verb": a.verb, "message": a.message, "task_id": a.task_id,
             "created_at": a.created_at} for a in rows]


async def team_status(site_id: int) -> list[dict[str, Any]]:
    async with session_scope() as s:
        rows = (await s.execute(select(Task.assignee, Task.status, func.count()).where(Task.site_id == site_id)
                                .group_by(Task.assignee, Task.status))).all()
        current = {t.assignee: t for t in await s.scalars(select(Task).where(Task.site_id == site_id,
                                                                            Task.status == "in_progress"))}
    counts: dict[str, dict[str, int]] = {}
    for assignee, status, n in rows:
        counts.setdefault(assignee, {})[status] = n
    out = []
    for e in ROSTER.values():
        c = counts.get(e.id, {})
        cur = current.get(e.id)
        out.append({**e.public(), "status": "working" if cur else ("blocked" if c.get("blocked") else "idle"),
                    "current_task": {"id": cur.id, "title": cur.title} if cur else None,
                    "counts": {"todo": c.get("todo", 0), "in_progress": c.get("in_progress", 0),
                               "blocked": c.get("blocked", 0), "done": c.get("done", 0), "failed": c.get("failed", 0)}})
    return out


async def mark(task_id: int, status: str, *, output: dict | None = None, error: str | None = None,
               usage: dict | None = None) -> None:
    async with session_scope() as s:
        t = await s.get(Task, task_id)
        t.status = status
        if status == "in_progress":
            t.started_at = now()
        if status in ("done", "failed", "blocked"):
            t.completed_at = now() if status != "blocked" else None
        if output is not None:
            t.output = output
        if error is not None:
            t.error = error[:4000]
        if usage is not None:
            t.usage = usage
