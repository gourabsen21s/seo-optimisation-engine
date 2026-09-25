"""The AI workforce: roster, board guardrails, memory, knowledge index, briefings and task execution."""

import pytest
from pydantic_ai.models.test import TestModel

from seo_engine.knowledge.embeddings import HashEmbedder
from seo_engine.services.common import JobReporter, ServiceError
from seo_engine.workforce.roster import ASSIGNABLE, MANAGER, ROSTER


def test_roster():
    assert {"manager", "auditor", "rank_analyst", "onpage", "strategist", "writer", "compliance", "researcher",
            "link_builder", "tech_seo", "engineer"} == set(ROSTER)
    assert "compliance" not in ASSIGNABLE
    card = ROSTER[MANAGER].card()
    assert "Maya" in card and "create_task" in card and "Lena" in card and "Ezra" in card
    for e in ROSTER.values():  # every delegation target exists and is assignable
        assert set(e.can_assign_to) <= ASSIGNABLE


async def test_hash_embedder_ranks_related_text_higher():
    e = HashEmbedder()
    q, a, b = await e.embed(["yoga sutras title", "yoga sutras chapter one title", "ancient chola bronze art"])
    cos = lambda x, y: sum(i * j for i, j in zip(x, y, strict=True))  # noqa: E731
    assert cos(q, a) > cos(q, b)




async def test_board_guardrails(site_with_audit):
    from seo_engine.workforce import board

    sid = site_with_audit
    with pytest.raises(ServiceError):
        await board.create_task(sid, "compliance", "x", enqueue=False)
    with pytest.raises(ServiceError):  # the writer cannot assign work to the manager
        await board.create_task(sid, MANAGER, "Do my job", created_by="writer", enqueue=False)
    t1 = await board.create_task(sid, "onpage", "Fix homepage title", enqueue=False)
    t2 = await board.create_task(sid, "onpage", "Fix homepage title", enqueue=False)
    assert t1.id == t2.id  # duplicate open task is not created twice


async def test_memory_and_knowledge(client, site_with_audit):
    sid = site_with_audit
    r = await client.post(f"/api/sites/{sid}/memories", json={"text": "Brand voice is scholarly and calm"})
    assert r.status_code == 201
    mems = (await client.get(f"/api/sites/{sid}/memories")).json()
    assert any("scholarly" in m["text"] for m in mems)
    hits = (await client.get(f"/api/sites/{sid}/knowledge", params={"q": "privacy policy cookies"})).json()
    assert hits and any("privacy" in (h.get("url") or "") for h in hits[:5])
    team = (await client.get(f"/api/sites/{sid}/team")).json()
    assert team["team_memories"] >= 1 and len(team["employees"]) == len(ROSTER)
    await client.delete(f"/api/sites/{sid}/memories/{mems[0]['id']}")


async def test_briefing_contains_all_context(site_with_audit):
    from seo_engine.knowledge.context import build_briefing
    from seo_engine.knowledge.memory import get_memory
    from seo_engine.workforce import board

    sid = site_with_audit
    await get_memory().remember(sid, "Titles with the year performed better", "onpage")
    await get_memory().remember(sid, "Never promise health outcomes", "team")
    task = await board.create_task(sid, "onpage", "Improve the privacy policy page title",
                                   "Target query: privacy policy", enqueue=False)
    await board.add_comment(task.id, "human", "Keep the brand name at the end")
    briefing = await build_briefing(sid, "onpage", task)
    for expected in ("## Site", "## Your task", "Keep the brand name", "## What the team knows",
                     "Never promise health", "## Your notes from past work", "## Relevant site knowledge"):
        assert expected in briefing, expected


async def test_execute_task_with_offline_model(site_with_audit, monkeypatch):
    from seo_engine.db import Job, session_scope
    from seo_engine.workforce import board, runner

    monkeypatch.setattr(runner, "build_model", lambda cfg: TestModel(call_tools=["remember", "list_team_tasks"]))
    sid = site_with_audit
    task = await board.create_task(sid, "onpage", "Review snippets on key pages", enqueue=False)
    async with session_scope() as s:
        job = Job(type="task", site_id=sid, params={"task_id": task.id})
        s.add(job)
        await s.flush()
        job_id = job.id
    result = await runner.execute_task(task.id, JobReporter(job_id))
    assert result["status"] == "done"
    done, comments = await board.get_task(task.id)
    assert done.status == "done" and done.output["summary"] is not None and done.usage["requests"] >= 1
    feed = await board.activity(sid)
    assert any(a["verb"] == "completed" for a in feed)
    # running the same task again is a no-op (idempotent claim)
    assert (await runner.execute_task(task.id, JobReporter(job_id)))["skipped"]


async def test_human_answer_unblocks_task(site_with_audit, monkeypatch):
    from seo_engine.workforce import board

    sid = site_with_audit
    task = await board.create_task(sid, "strategist", "Plan content", enqueue=False)
    await board.mark(task.id, "blocked")
    enqueued = []

    async def fake_enqueue(job_type, site_id, params=None, dedupe=True):
        enqueued.append((job_type, params))
        return 1

    monkeypatch.setattr("seo_engine.workers.queue.enqueue", fake_enqueue)
    await board.add_comment(task.id, "human", "Focus on the Yoga Sutras series")
    t, comments = await board.get_task(task.id)
    assert t.status == "todo" and enqueued == [("task", {"task_id": task.id})]


async def test_team_cycle_end_to_end(client, site_with_audit, monkeypatch):
    """Maya plans → tasks run in parallel → wrap-up closes the cycle with a report."""
    from seo_engine.workforce import runner
    from tests.test_api import wait_job

    calls = {"n": 0}

    def model(cfg):
        calls["n"] += 1
        # The planner delegates; everyone else just reports.
        return TestModel(call_tools=["create_task"] if calls["n"] == 1 else ["list_team_tasks"])

    monkeypatch.setattr(runner, "build_model", model)
    sid = site_with_audit
    job = await wait_job(client, (await client.post(f"/api/sites/{sid}/cycles", json={"fresh_audit": False})).json()["job_id"])
    assert job["status"] == "done", job
    import asyncio

    for _ in range(120):  # tasks + wrap-up run asynchronously after the cycle job
        runs = (await client.get(f"/api/sites/{sid}/cycles")).json()
        if runs[0]["status"] == "done":
            break
        await asyncio.sleep(0.5)
    assert runs[0]["status"] == "done", runs[0]
    assert runs[0]["output"]["cycle"]["summary"] is not None
    tasks = (await client.get(f"/api/sites/{sid}/tasks")).json()
    kinds = {t["kind"] for t in tasks}
    assert {"plan", "wrap_up"} <= kinds
    reports = (await client.get(f"/api/sites/{sid}/reports", params={"kind": "cycle"})).json()
    assert reports
    job = await wait_job(client, (await client.post(f"/api/sites/{sid}/reports/standup")).json()["job_id"])
    assert job["status"] == "done"
    assert (await client.get(f"/api/sites/{sid}/reports", params={"kind": "standup"})).json()
