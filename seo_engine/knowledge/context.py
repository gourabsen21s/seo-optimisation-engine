"""The context engine: assembles a focused, size-budgeted briefing for an employee starting a task.

A real employee starting a task knows their role, the state of the site, the task and its discussion, what the
team has learned before, and what colleagues have been doing. This module builds exactly that — retrieving
only the relevant memories and site knowledge instead of dumping everything into the prompt.
"""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from sqlalchemy import select

from ..db import Audit, Site, Task, TaskComment, session_scope
from ..services.common import now
from .index import get_index
from .memory import TEAM, get_memory

log = logging.getLogger(__name__)

BUDGET = {"site": 1500, "task": 3000, "team_memory": 2500, "own_memory": 1500, "knowledge": 4000, "activity": 1500}


def _clip(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[: limit - 1].rsplit(" ", 1)[0] + "…"


def _section(title: str, body: str, key: str) -> str:
    return f"## {title}\n{_clip(body.strip(), BUDGET[key])}\n" if body.strip() else ""


async def _site_state(site_id: int) -> str:
    async with session_scope() as s:
        site = await s.get(Site, site_id)
        audits = list(await s.scalars(select(Audit).where(Audit.site_id == site_id, Audit.status == "done")
                                      .order_by(Audit.id.desc()).limit(2)))
    if site is None:
        return ""
    p = site.profile or {}
    lines = [f"Site: {site.name} — {site.url} (platform: {p.get('platform', '?')}, niche: {p.get('niche', 'general')})",
             f"Autopilot: {site.autopilot}; auto-publish content: {site.auto_publish_content}"]
    if p.get("target_keywords"):
        lines.append("Target keywords: " + ", ".join(p["target_keywords"][:15]))
    if audits:
        a = audits[0]
        trend = ""
        if len(audits) > 1 and audits[1].overall_score is not None:
            trend = f" (previous audit {audits[1].overall_score})"
        lines.append(f"Latest audit: overall {a.overall_score}{trend}, SEO {a.seo_score}, AdSense readiness "
                     f"{a.adsense_score}")
        failing = [f"R{r['id']} {r['title']}" for r in (a.report or {}).get("requirements", []) if r["status"] == "fail"]
        if failing:
            lines.append("Failing AdSense requirements: " + "; ".join(failing[:12]))
    return "\n".join(lines)


async def _task_thread(task: Task) -> str:
    async with session_scope() as s:
        comments = list(await s.scalars(select(TaskComment).where(TaskComment.task_id == task.id)
                                        .order_by(TaskComment.id)))
    lines = [f"**{task.title}** (priority {task.priority}, assigned by {task.created_by})"]
    if task.description:
        lines.append(task.description)
    if task.input:
        lines.append(f"Input: {task.input}")
    for c in comments[-12:]:
        lines.append(f"- {c.author} ({c.kind}): {c.body}")
    return "\n".join(lines)


async def _recent_activity(site_id: int, exclude_task: int) -> str:
    async with session_scope() as s:
        tasks = list(await s.scalars(select(Task).where(Task.site_id == site_id, Task.id != exclude_task,
                                                         Task.completed_at >= now() - timedelta(days=14))
                                     .order_by(Task.completed_at.desc()).limit(10)))
    return "\n".join(f"- {t.assignee}: {t.title} → {t.status}: {((t.output or {}).get('summary') or '')[:200]}"
                     for t in tasks)


async def build_briefing(site_id: int, employee_id: str, task: Task) -> str:
    query = f"{task.title}\n{task.description}"[:1000]
    memory, index = get_memory(), get_index()
    team_mem: list[dict[str, Any]] = []
    own_mem: list[dict[str, Any]] = []
    knowledge: list[dict[str, Any]] = []
    try:
        team_mem = await memory.recall(site_id, query, TEAM, limit=8)
        # Standing team rules apply to every task, relevant or not: top up with the most recent team notes.
        seen = {m["id"] for m in team_mem}
        team_mem += [m for m in await memory.list(site_id, TEAM, limit=20) if m["id"] not in seen][: 8 - len(team_mem)]
        own_mem = await memory.recall(site_id, query, employee_id, limit=6)
    except Exception:
        log.exception("memory recall failed")
    try:
        knowledge = await index.search(site_id, query, limit=8)
    except Exception:
        log.exception("knowledge search failed")

    parts = [
        _section("Site", await _site_state(site_id), "site"),
        _section("Your task", await _task_thread(task), "task"),
        _section("What the team knows", "\n".join(f"- {m['text']}" for m in team_mem), "team_memory"),
        _section("Your notes from past work", "\n".join(f"- {m['text']}" for m in own_mem), "own_memory"),
        _section("Relevant site knowledge", "\n".join(
            f"- [{k.get('kind')}] {k.get('text', '')[:600]}" for k in knowledge), "knowledge"),
        _section("Recent team activity", await _recent_activity(site_id, task.id), "activity"),
    ]
    return "# Briefing\n" + "\n".join(p for p in parts if p)
