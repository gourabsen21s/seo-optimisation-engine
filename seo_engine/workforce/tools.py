"""Collaboration tools shared by every AI employee: delegate, check the board, comment, ask the human owner,
remember and recall, search site knowledge."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pydantic_ai import FunctionToolset, RunContext

from ..agent.team import TeamDeps
from ..knowledge.index import get_index
from ..knowledge.memory import TEAM, get_memory
from ..services.common import ServiceError
from . import board
from .roster import ASSIGNABLE, ROSTER


@dataclass
class EmployeeDeps(TeamDeps):
    site_id: int = 0
    employee_id: str = ""
    task_id: int | None = None
    run_id: int | None = None
    question_for_human: str | None = None
    created_tasks: list[int] | None = None
    workspace: Any = None  # code.workspace.Workspace, created lazily by the Web Engineer's tools


collab_tools: FunctionToolset[EmployeeDeps] = FunctionToolset()


@collab_tools.tool
async def create_task(ctx: RunContext[EmployeeDeps], assignee: str, title: str, description: str,
                      priority: int = 2, input: dict[str, Any] | None = None) -> str:
    """Assign a task to a colleague (by employee id). Be specific: what, which URLs/queries, and why.
    priority: 1 urgent, 2 high, 3 normal, 4 low. `input` can carry structured data such as
    {"urls": [...], "target_queries": {"<url>": "<query>"}} for the On-page Optimizer."""
    if assignee not in ASSIGNABLE:
        return f"Unknown assignee {assignee!r}. Valid ids: {', '.join(sorted(ASSIGNABLE))}."
    try:
        task = await board.create_task(ctx.deps.site_id, assignee, title, description, created_by=ctx.deps.employee_id,
                                       priority=priority, input=input or {}, run_id=ctx.deps.run_id,
                                       parent_id=ctx.deps.task_id)
    except ServiceError as exc:
        return f"Not created: {exc}"
    if ctx.deps.created_tasks is not None:
        ctx.deps.created_tasks.append(task.id)
    await ctx.deps.log(f"{ROSTER[ctx.deps.employee_id].name} assigned “{title}” to {ROSTER[assignee].name}")
    return f"Task #{task.id} assigned to {ROSTER[assignee].name}."


@collab_tools.tool
async def list_team_tasks(ctx: RunContext[EmployeeDeps], status: Literal["open", "done", "all"] = "open",
                          limit: int = 25) -> list[dict[str, Any]]:
    """See the team board for this site: who is working on what, and results of finished work."""
    status_filter = {"open": "todo,in_progress,blocked", "done": "done,failed", "all": None}[status]
    tasks = await board.list_tasks(ctx.deps.site_id, status=status_filter, limit=limit)
    return [{"id": t.id, "assignee": t.assignee, "title": t.title, "status": t.status, "priority": t.priority,
             "summary": ((t.output or {}).get("summary") or "")[:300]} for t in tasks]


@collab_tools.tool
async def read_task_output(ctx: RunContext[EmployeeDeps], task_id: int) -> dict[str, Any]:
    """Read the full result of a colleague's task."""
    try:
        task, comments = await board.get_task(task_id)
    except Exception:
        return {"error": f"task {task_id} not found"}
    if task.site_id != ctx.deps.site_id:
        return {"error": "task belongs to another site"}
    return {"title": task.title, "assignee": task.assignee, "status": task.status, "output": task.output,
            "comments": [f"{c.author}: {c.body}" for c in comments[-10:]]}


@collab_tools.tool
async def comment(ctx: RunContext[EmployeeDeps], body: str, task_id: int | None = None) -> str:
    """Post a comment on a task (your current task by default) — e.g. a handoff note for a colleague."""
    target = task_id or ctx.deps.task_id
    if not target:
        return "No task to comment on."
    await board.add_comment(target, ctx.deps.employee_id, body)
    return "Comment posted."


@collab_tools.tool
async def ask_human(ctx: RunContext[EmployeeDeps], question: str) -> str:
    """Ask the site owner a question you cannot answer yourself (access, business decisions, facts about them).
    Your task will pause as 'blocked' until they reply. Use sparingly."""
    ctx.deps.question_for_human = question
    if ctx.deps.task_id:
        await board.add_comment(ctx.deps.task_id, ctx.deps.employee_id, question, kind="question")
    return "Question sent to the owner. Finish now: summarise progress so far; the task will resume after they reply."


@collab_tools.tool
async def remember(ctx: RunContext[EmployeeDeps], fact: str, scope: Literal["team", "me"] = "me") -> str:
    """Save a durable lesson or fact to long-term memory. 'team' = everyone should know it (brand voice,
    decisions, what worked); 'me' = your own working notes."""
    agent = TEAM if scope == "team" else ctx.deps.employee_id
    await get_memory().remember(ctx.deps.site_id, fact, agent, kind="note",
                                metadata={"task_id": ctx.deps.task_id, "author": ctx.deps.employee_id})
    return "Saved."


@collab_tools.tool
async def recall(ctx: RunContext[EmployeeDeps], query: str, scope: Literal["team", "me", "all"] = "all") -> list[str]:
    """Search long-term memory (team knowledge and/or your own notes)."""
    agent = {"team": TEAM, "me": ctx.deps.employee_id, "all": None}[scope]
    return [m["text"] for m in await get_memory().recall(ctx.deps.site_id, query, agent, limit=10)]


@collab_tools.tool
async def search_knowledge(ctx: RunContext[EmployeeDeps], query: str,
                           kinds: list[Literal["page", "finding", "query"]] | None = None) -> list[dict[str, Any]]:
    """Semantic search over the site's pages, audit findings and Search Console queries."""
    hits = await get_index().search(ctx.deps.site_id, query, limit=10, kinds=list(kinds) if kinds else None)
    return [{"kind": h.get("kind"), "url": h.get("url"), "text": h.get("text", "")[:700], "score": h.get("score")}
            for h in hits]
