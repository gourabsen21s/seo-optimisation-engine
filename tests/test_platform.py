"""Integrations settings, rank tracking, LLM budget, notifications and the new employees' tools."""

from __future__ import annotations

import json

import httpx
import pytest
from pydantic_ai.models.test import TestModel

from seo_engine.research import http as research_http
from seo_engine.services.common import JobReporter
from tests.conftest import OfflineTransport


@pytest.fixture
def mock_http():
    handlers: dict[str, object] = {}
    seen: list[httpx.Request] = []
    local = OfflineTransport()

    async def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        for host, fn in handlers.items():
            if request.url.host.endswith(host):
                return fn(request)
        return await local.handle_async_request(request)

    research_http.clear_cache()
    research_http.set_transport(httpx.MockTransport(handler))
    yield handlers, seen
    research_http.set_transport(OfflineTransport())
    research_http.clear_cache()


async def _reporter(site_id: int) -> JobReporter:
    from seo_engine.db import Job, session_scope

    async with session_scope() as s:
        job = Job(type="task", site_id=site_id, params={})
        s.add(job)
        await s.flush()
        return JobReporter(job.id)


async def _reset_integrations(client):
    await client.put("/api/settings/integrations", json={
        "serp_provider": "", "serp_api_key": "", "slack_webhook_url": "", "llm_daily_token_budget": 0})


async def test_integrations_settings_never_leak_secrets(client):
    r = await client.put("/api/settings/integrations", json={"serp_provider": "serper", "serp_api_key": "secret-123",
                                                             "llm_daily_token_budget": 500000,
                                                             "notify_events": ["task_blocked", "bogus"]})
    assert r.status_code == 200
    data = r.json()
    assert data["serp_api_key_set"] is True and "serp_api_key" not in data
    assert "secret-123" not in r.text
    assert data["notify_events"] == ["task_blocked"] and data["llm_daily_token_budget"] == 500000
    caps = (await client.get("/api/capabilities")).json()
    assert caps["serp"] is True and caps["serp_provider"] == "serper" and caps["budget"] == 500000
    # omitting a secret keeps it; "" clears it
    await client.put("/api/settings/integrations", json={"serp_country": "gb"})
    assert (await client.get("/api/settings/integrations")).json()["serp_api_key_set"] is True
    await _reset_integrations(client)
    assert (await client.get("/api/settings/integrations")).json()["serp_api_key_set"] is False
    await client.put("/api/settings/integrations", json={"notify_events": [
        "task_blocked", "cycle_finished", "rollback", "job_failed", "budget_reached", "agent_message"]})


async def test_rank_tracking_via_serp(client, site_with_audit, mock_http):
    from tests.test_api import wait_job

    handlers, _ = mock_http
    handlers["serper.dev"] = lambda r: httpx.Response(200, json={"organic": [
        {"title": "Rival", "link": "https://rival.com/a", "position": 1},
        {"title": "Other", "link": "https://other.com/b", "position": 2},
        {"title": "Us", "link": "http://127.0.0.1:8765/post/", "position": 3}]})
    await client.put("/api/settings/integrations", json={"serp_provider": "serper", "serp_api_key": "k"})
    sid = site_with_audit
    try:
        r = await client.post(f"/api/sites/{sid}/keywords", json={"keywords": [{"keyword": "  Sourdough Starter "},
                                                                              {"keyword": "sourdough starter"}]})
        assert r.status_code == 201 and r.json() == {"added": 1}
        job = await wait_job(client, (await client.post(f"/api/sites/{sid}/keywords/check")).json()["job_id"])
        assert job["status"] == "done" and job["result"]["ranked"] == 1, job
        [kw] = (await client.get(f"/api/sites/{sid}/keywords")).json()
        assert kw["keyword"] == "sourdough starter" and kw["position"] == 3 and kw["source"] == "serper"
        assert kw["competitors"][0]["domain"] == "rival.com"
        history = (await client.get(f"/api/sites/{sid}/keywords/{kw['id']}/history")).json()
        assert len(history) == 1
        assert (await client.delete(f"/api/sites/{sid}/keywords/{kw['id']}")).status_code == 204
    finally:
        await _reset_integrations(client)


async def test_daily_budget_stops_llm_work(client, site_with_audit, monkeypatch):
    from seo_engine.services import budget
    from seo_engine.workforce import board, runner

    monkeypatch.setattr(runner, "build_model", lambda cfg: TestModel(call_tools=[]))
    sid = site_with_audit
    await client.put("/api/settings/integrations", json={"llm_daily_token_budget": 1000})
    try:
        await budget.record(sid, "manager", "test", {"requests": 1, "input_tokens": 900, "output_tokens": 200})
        task = await board.create_task(sid, "onpage", "Budgeted task", enqueue=False)
        with pytest.raises(budget.BudgetExceeded):
            await runner.execute_task(task.id, await _reporter(sid))
        failed, _ = await board.get_task(task.id)
        assert failed.status == "failed" and "budget" in failed.error.lower()
        summary = (await client.get("/api/settings/usage")).json()
        assert summary["today"] >= 1100 and any(a["actor"] == "manager" for a in summary["by_actor"])
    finally:
        await _reset_integrations(client)


async def test_notifications_delivery(client, mock_http):
    from seo_engine.integrations.notify import notify_event

    handlers, seen = mock_http
    handlers["hooks.slack.test"] = lambda r: httpx.Response(200, text="ok")
    await client.put("/api/settings/integrations", json={"slack_webhook_url": "https://hooks.slack.test/T1",
                                                         "public_url": "https://rankcrew.example"})
    try:
        r = (await client.post("/api/settings/integrations/test", json={"target": "notify"})).json()
        assert r["ok"] is True and "slack" in r["message"]
        assert await notify_event("cycle_finished", "Done", "All good", path="/sites/1/cycles") == ["slack"]
        body = json.loads(seen[-1].content)["text"]
        assert "Done" in body and "https://rankcrew.example/sites/1/cycles" in body
        await client.put("/api/settings/integrations", json={"notify_events": ["task_blocked"]})
        assert await notify_event("cycle_finished", "Done", "x") == []  # event muted
    finally:
        await _reset_integrations(client)
        await client.put("/api/settings/integrations", json={"notify_events": [
            "task_blocked", "cycle_finished", "rollback", "job_failed", "budget_reached", "agent_message"]})


async def test_new_employees_work_with_real_tools_offline(site_with_audit, monkeypatch):
    """Tools degrade gracefully (error dicts) when integrations are missing; usage lands in the ledger."""
    from seo_engine.services.budget import usage_summary
    from seo_engine.workforce import board, runner

    sid = site_with_audit
    cases = {"researcher": ["keyword_ideas", "web_search", "get_rankings", "content_gap"],
             "link_builder": ["find_link_prospects", "domain_authority"],
             "tech_seo": ["list_pages", "get_audit_overview"]}
    for employee, tools in cases.items():
        monkeypatch.setattr(runner, "build_model", lambda cfg, t=tools: TestModel(call_tools=t))
        task = await board.create_task(sid, employee, f"Test task for {employee}", enqueue=False)
        result = await runner.execute_task(task.id, await _reporter(sid))
        assert result["status"] == "done", (employee, result)
    actors = {a["actor"] for a in (await usage_summary())["by_actor"]}
    assert {"researcher", "link_builder", "tech_seo"} <= actors
