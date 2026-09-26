"""Executes one task on the board: briefing → employee agent → proposals/memory/handoffs → status."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from pydantic_ai import UsageLimits
from pydantic_ai.exceptions import AgentRunError, UnexpectedModelBehavior, UsageLimitExceeded
from sqlalchemy import func, select, update

from ..agent.llm import LLMNotConfigured, build_model
from ..agent.team import ArticleDraft
from ..core.config import get_settings
from ..db import AgentRun, Report, Site, Task, TaskComment, session_scope
from ..fixes.models import FixAction, FixKind, Risk
from ..fixes.planner import heuristic_copy, pages_needing_copy
from ..integrations.notify import notify_event
from ..knowledge.context import build_briefing
from ..knowledge.index import get_index
from ..knowledge.memory import TEAM, get_memory
from ..services import audits as audit_service
from ..services import budget
from ..services.common import JobReporter, ServiceError, latest_audit, now
from ..services.settings import get_llm_config
from ..services.sites import gsc_for, profile_of
from . import board
from .agents import REQUEST_LIMITS, TaskResult, WrapUpResult, make_employee
from .pipeline import process_proposals
from .roster import AUDITOR, MANAGER, ROSTER, WRITER
from .tools import EmployeeDeps

log = logging.getLogger(__name__)
_semaphore: asyncio.Semaphore | None = None


def _sem() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(get_settings().task_concurrency)
    return _semaphore


async def execute_task(task_id: int, report: JobReporter) -> dict[str, Any]:
    async with session_scope() as s:
        claimed = await s.execute(update(Task).where(Task.id == task_id, Task.status == "todo")
                                  .values(status="in_progress", started_at=now()))
        task = await s.get(Task, task_id)
    if not claimed.rowcount:
        return {"skipped": True, "status": task.status if task else "missing"}
    who = ROSTER[task.assignee].name
    await board.log_activity(task.site_id, task.assignee, "started", f"{who} started “{task.title}”", task.id)
    await report(f"{who} ({ROSTER[task.assignee].title}) started: {task.title}")
    async with _sem():
        try:
            if task.assignee == AUDITOR:
                result = await _run_auditor(task, report)
            else:
                result = await _run_llm_employee(task, report)
        except (UnexpectedModelBehavior, UsageLimitExceeded, AgentRunError, ServiceError, LLMNotConfigured) as exc:
            await board.mark(task.id, "failed", error=f"{type(exc).__name__}: {exc}")
            await board.log_activity(task.site_id, task.assignee, "failed", f"{who} could not finish “{task.title}”: "
                                     f"{str(exc)[:200]}", task.id)
            if task.kind == "wrap_up":  # never leave a cycle hanging
                await _finish_run(task, WrapUpResult(summary=f"Cycle finished, but the review step failed: "
                                                             f"{str(exc)[:300]}",
                                                     next_focus="Retry the review from the board."), None)
            else:
                await _maybe_wrap_up(task)
            raise
    status = result.pop("_status", "done")
    await board.mark(task.id, status, output=result, usage=result.pop("_usage", None))
    verb = "blocked" if status == "blocked" else "completed"
    await board.log_activity(task.site_id, task.assignee, verb,
                             f"{who} {'is waiting on you for' if status == 'blocked' else 'finished'} “{task.title}”"
                             f"{': ' + result.get('summary', '')[:200] if status == 'done' else ''}", task.id)
    if status == "done":
        await _maybe_wrap_up(task)
    elif status == "blocked":
        async with session_scope() as s:
            question = await s.scalar(select(TaskComment.body).where(TaskComment.task_id == task.id,
                                                                     TaskComment.kind == "question")
                                      .order_by(TaskComment.id.desc()).limit(1))
        await notify_event("task_blocked", f"{who} needs your input", f"“{task.title}”\n\n{question or ''}",
                           site_id=task.site_id, path=f"/sites/{task.site_id}/board?task={task.id}", level="warning")
    return {"task_id": task.id, "status": status}


# ----------------------------------------------------------------------------- system employee

async def _run_auditor(task: Task, report: JobReporter) -> dict[str, Any]:
    res = await audit_service.run_audit(task.site_id, report)
    audit, audit_report, crawl = await latest_audit(task.site_id)
    counts = await get_index().index_audit(task.site_id, crawl, audit_report)
    summary = (f"Audit #{audit.id}: overall {audit_report.overall_score}, SEO {audit_report.seo_score}, AdSense "
               f"readiness {audit_report.adsense_score}; {len(audit_report.findings)} findings, "
               f"{res.get('fixes', 0)} rule-based fixes proposed. Indexed {counts['pages']} page chunks.")
    return {"summary": summary, "details": "", "audit_id": audit.id}


# ----------------------------------------------------------------------------- LLM employees

async def _deps(task: Task, report: JobReporter) -> tuple[EmployeeDeps, Site, int]:
    async with session_scope() as s:
        site = await s.get(Site, task.site_id)
    try:
        audit, audit_report, crawl = await latest_audit(task.site_id)
    except ServiceError:
        await report("No audit yet — Theo runs one first")
        await audit_service.run_audit(task.site_id, report)
        audit, audit_report, crawl = await latest_audit(task.site_id)
        await get_index().index_audit(task.site_id, crawl, audit_report)
    gsc = gsc_for(site)
    gsc_rows: list[dict] = []
    if gsc and task.assignee in ("rank_analyst", "onpage", "manager", "researcher", "strategist"):
        try:
            gsc_rows = await gsc.performance(days=28)
        except Exception as exc:
            await report.warn(f"Search Console unavailable: {exc}")
    cfg = await get_llm_config()
    deps = EmployeeDeps(profile=profile_of(site), report=audit_report, crawl=crawl, settings=get_settings(),
                        emit=report, cfg=cfg, gsc_rows=gsc_rows, gsc=gsc, auto_publish_content=site.auto_publish_content,
                        site_id=site.id, employee_id=task.assignee, task_id=task.id, run_id=task.run_id,
                        created_tasks=[])
    return deps, site, audit.id


async def _run_llm_employee(task: Task, report: JobReporter) -> dict[str, Any]:
    deps, site, audit_id = await _deps(task, report)
    try:
        model = build_model(deps.cfg)
    except LLMNotConfigured:
        return await _deterministic_fallback(task, deps, site, audit_id, report)
    deps.model = model
    briefing = await build_briefing(site.id, task.assignee, task)
    output_type = WrapUpResult if task.kind == "wrap_up" else None
    agent = make_employee(task.assignee, model, deps.cfg, briefing, output_type)
    prompt = {"plan": "Plan this optimisation cycle: assign tasks to the right colleagues, then report.",
              "wrap_up": "All tasks of this cycle are finished. Review their outputs (list_team_tasks, "
                         "read_task_output), record team lessons and write the cycle report."}.get(task.kind,
                                                                                                 "Do your task.")
    remaining = await budget.ensure_budget(site.id, task.assignee)
    limits = UsageLimits(request_limit=REQUEST_LIMITS.get(task.assignee, get_settings().task_request_limit),
                         total_tokens_limit=remaining or None)
    code_note: dict[str, Any] = {}
    try:
        result = await agent.run(prompt, deps=deps, usage_limits=limits,
                                 capabilities=[budget.meter(site.id, task.assignee, deps.cfg.model)])
        out: TaskResult = result.output
        proposals = list(deps.proposals)
        if deps.workspace is not None:
            fix, code_note = await _code_change_fix(deps.workspace, task, out)
            if fix:
                proposals.append(fix)
    finally:
        if deps.workspace is not None:
            await deps.workspace.cleanup()
    usage = {"requests": result.usage.requests, "input_tokens": result.usage.input_tokens,
             "output_tokens": result.usage.output_tokens}

    if task.assignee == WRITER and getattr(out, "draft", None):
        proposals.append(_draft_fix(out.draft, task, site.auto_publish_content))
    fixes = await process_proposals(site, proposals, deps.crawl, audit_id=audit_id, run_id=task.run_id,
                                    report=report, author=task.assignee)

    memory = get_memory()
    for lesson in out.learnings[:8]:
        await memory.remember(site.id, lesson, task.assignee, metadata={"task_id": task.id})
    for note in out.team_notes[:8]:
        await memory.remember(site.id, note, TEAM, metadata={"task_id": task.id, "author": task.assignee})

    data = out.model_dump(mode="json")
    data.update(fixes=fixes, created_tasks=deps.created_tasks or [], _usage=usage, **code_note)
    if task.kind == "wrap_up":
        await _finish_run(task, out, usage)
    blocked = out.outcome == "blocked" or deps.question_for_human is not None
    data["_status"] = "blocked" if blocked else "done"
    return data


async def _code_change_fix(ws, task: Task, out: TaskResult) -> tuple[FixAction | None, dict[str, Any]]:
    """Turn the engineer's workspace edits into one reviewable, reversible `code_change` fix."""
    from ..code.workspace import WorkspaceError

    try:
        changes = await ws.changes()
        if not changes:
            return None, {}
        diff = await ws.diff(max_chars=250_000)
        stat = await ws.diffstat()
    except WorkspaceError as exc:
        return None, {"code_change_error": str(exc)}
    fix = FixAction(kind=FixKind.CODE_CHANGE, title=f"Code change: {task.title}"[:300], source="agent",
                    rationale=out.summary, risk=Risk.REVIEW,
                    payload={"files": [{"path": c.path, "before": c.before, "after": c.after} for c in changes],
                             "diff": diff, "diffstat": stat, "summary": out.summary, "details": out.details[:6000],
                             "source": ws.source, "task_id": task.id})
    return fix, {"code_change": {"files": [c.path for c in changes], "diffstat": stat}}


def _draft_fix(d: ArticleDraft, task: Task, publish: bool) -> FixAction:
    body = d.html_body + ("\n<!-- facts to verify:\n" + "\n".join(f"- {f}" for f in d.facts_to_verify) + "\n-->"
                          if d.facts_to_verify else "")
    return FixAction(kind=FixKind.CREATE_PAGE, title=f"Article draft: {d.title}", source="agent",
                     rationale=f"Drafted by Iris for task #{task.id}",
                     payload={"slug": d.slug, "title": d.title, "html": body, "meta_description": d.meta_description,
                              "post_type": "post", "content_draft": True, "publish": publish},
                     risk=Risk.SAFE if publish else Risk.REVIEW, requirement=27)


async def _deterministic_fallback(task: Task, deps: EmployeeDeps, site: Site, audit_id: int,
                                  report: JobReporter) -> dict[str, Any]:
    await report.warn("No LLM configured — using deterministic heuristics")
    if task.assignee in (MANAGER, "onpage"):
        for page in pages_needing_copy(deps.report, deps.crawl, deps.settings.ai_max_pages):
            for fix in heuristic_copy(page, deps.profile):
                deps.propose(fix)
        fixes = await process_proposals(site, deps.proposals, deps.crawl, audit_id=audit_id, run_id=task.run_id,
                                        report=report, author=task.assignee)
        summary = f"Heuristic snippet fixes proposed for {fixes['proposed']} items (no LLM configured)."
        if task.kind == "wrap_up":
            await _finish_run(task, WrapUpResult(summary="Deterministic cycle (no LLM configured).",
                                                 next_focus="Configure an LLM in Settings."), None)
        return {"summary": summary, "fixes": fixes}
    return {"summary": "Skipped: this role needs an LLM. Configure one in Settings.", "_status": "done"}


# ----------------------------------------------------------------------------- cycle wrap-up

async def _maybe_wrap_up(task: Task) -> None:
    if not task.run_id or task.kind == "wrap_up":
        return
    async with session_scope() as s:
        open_count = await s.scalar(select(func.count()).select_from(Task).where(
            Task.run_id == task.run_id, Task.status.in_(("todo", "in_progress"))))
        has_wrap = await s.scalar(select(func.count()).select_from(Task).where(
            Task.run_id == task.run_id, Task.kind == "wrap_up"))
    if open_count or has_wrap:
        return
    await board.create_task(task.site_id, MANAGER, "Review the cycle and report", created_by=MANAGER,
                            kind="wrap_up", priority=2, run_id=task.run_id)


async def _finish_run(task: Task, out: WrapUpResult, usage: dict | None) -> None:
    async with session_scope() as s:
        run = await s.get(AgentRun, task.run_id) if task.run_id else None
        strategy_task = await s.scalar(select(Task).where(Task.run_id == task.run_id, Task.assignee == "strategist",
                                                          Task.status == "done").order_by(Task.id.desc()).limit(1))
        output: dict[str, Any] = dict(run.output or {}) if run else {}
        output["cycle"] = {"summary": out.summary, "actions": out.actions, "next_focus": out.next_focus,
                           "expected_impact": out.expected_impact}
        if strategy_task and (strategy_task.output or {}).get("strategy"):
            output["strategy"] = strategy_task.output["strategy"]
        if run:
            run.output, run.status, run.finished_at = output, "done", now()
            if usage:
                run.usage = usage
        s.add(Report(site_id=task.site_id, kind="cycle", author=MANAGER, title="Optimisation cycle report",
                     content=f"{out.summary}\n\n**Actions**\n" + "\n".join(f"- {a}" for a in out.actions)
                             + f"\n\n**Next focus:** {out.next_focus}\n\n**Expected impact:** {out.expected_impact}",
                     data={"run_id": task.run_id}))
        site = await s.get(Site, task.site_id)
        site.last_cycle_at = now()
    await notify_event("cycle_finished", "Optimisation cycle finished",
                       f"{out.summary}\n\nNext focus: {out.next_focus}", site_id=task.site_id,
                       path=f"/sites/{task.site_id}/cycles")
