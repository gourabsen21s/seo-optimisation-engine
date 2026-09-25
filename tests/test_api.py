"""End-to-end API flow with in-process jobs and the offline TestModel LLM."""

import asyncio


async def wait_job(client, job_id, max_wait=240):
    for _ in range(max_wait * 2):
        job = (await client.get(f"/api/jobs/{job_id}")).json()
        if job["status"] in ("done", "failed"):
            return job
        await asyncio.sleep(0.5)
    raise AssertionError(f"job {job_id} did not finish")


async def test_auth_required(client):
    r = await client.get("/api/sites", headers={"X-API-Key": "wrong"})
    assert r.status_code == 401
    assert (await client.get("/api/auth/check")).json()["ok"] is True
    assert (await client.get("/healthz")).status_code == 200
    assert (await client.get("/readyz")).status_code == 200


async def test_full_flow(client, fixture_site, site_copy, monkeypatch):
    from pydantic_ai.models.test import TestModel

    # A well-behaved offline model for the agents (the default "test" model calls every tool with junk args).
    monkeypatch.setattr("seo_engine.workforce.runner.build_model",
                        lambda cfg: TestModel(call_tools=["get_audit_overview", "list_findings"]))
    monkeypatch.setattr("seo_engine.services.chat.build_model", lambda cfg: TestModel(call_tools=["list_pages"]))

    # create + first audit
    r = await client.post("/api/sites", json={"url": fixture_site, "name": "Fixture", "start_audit": False})
    assert r.status_code == 201, r.text
    site = r.json()["site"]
    # the fixture's robots.txt disallows everything (deliberately), so crawl it with robots ignored
    await client.patch(f"/api/sites/{site['id']}", json={"obey_robots": False})
    job = await wait_job(client, (await client.post(f"/api/sites/{site['id']}/audits")).json()["job_id"])
    assert job["status"] == "done", job
    assert any("Crawled" in e["message"] for e in job["events"])

    sid = site["id"]
    audits = (await client.get(f"/api/sites/{sid}/audits")).json()
    audit = (await client.get(f"/api/audits/{audits[0]['id']}")).json()
    assert audit["status"] == "done"
    assert (await client.get(f"/api/audits/{audits[0]['id']}/export?format=html")).status_code == 200

    # rule fixes were proposed
    fixes = (await client.get(f"/api/sites/{sid}/fixes")).json()
    assert fixes and all(f["status"] == "proposed" for f in fixes)

    # connector + preview + apply
    r = await client.put(f"/api/sites/{sid}/connector", json={"type": "local", "config": {"root": str(site_copy)}})
    assert r.status_code == 200 and r.json()["connector_configured"]
    assert (await client.post(f"/api/sites/{sid}/connector/test")).json()["ok"]
    ids = [f["id"] for f in fixes if f["kind"] in ("write_file", "add_json_ld", "create_page")]
    preview = (await client.post(f"/api/sites/{sid}/fixes/preview", json={"ids": ids})).json()["results"]
    assert preview and any(p["ok"] for p in preview)
    job = await wait_job(client, (await client.post(f"/api/sites/{sid}/fixes/apply", json={"ids": ids})).json()["job_id"])
    assert job["status"] == "done", job
    applied = (await client.get(f"/api/sites/{sid}/fixes?status=applied")).json()
    assert applied
    assert (site_copy / "seo-drafts").is_dir()

    # autopilot settings + agent cycle (TestModel LLM, no fresh audit)
    r = await client.patch(f"/api/sites/{sid}", json={"autopilot": "safe", "profile": {"niche": "general"}})
    assert r.json()["autopilot"] == "safe"
    job = await wait_job(client, (await client.post(f"/api/sites/{sid}/cycles", json={"fresh_audit": False})).json()["job_id"])
    assert job["status"] == "done", job
    for _ in range(120):  # team tasks and the wrap-up finish asynchronously
        runs = (await client.get(f"/api/sites/{sid}/cycles")).json()
        if runs[0]["status"] == "done":
            break
        await asyncio.sleep(0.5)
    assert runs[0]["status"] == "done" and runs[0]["output"]["cycle"]

    # chat
    r = await client.post(f"/api/sites/{sid}/chat", json={"message": "What should I fix first?"})
    assert r.status_code == 200, r.text
    assert len(r.json()["transcript"]) == 2

    # settings
    s = (await client.get("/api/settings/llm")).json()
    assert s["llm"]["model"] == "test" and s["providers"]
    r = await client.put("/api/settings/llm", json={"llm": {"model": "test", "api_key": "abc"}})
    assert r.json()["llm"]["api_key_set"] is True
    assert (await client.post("/api/settings/llm/test", json={"target": "llm"})).json()["ok"]

    # site listing + delete
    assert (await client.get("/api/sites")).json()[0]["latest_scores"] is not None
    assert (await client.delete(f"/api/sites/{sid}")).status_code == 204


async def test_cycle_degrades_gracefully_with_misbehaving_model(client, fixture_site):
    # The default "test" model calls every tool with junk args; the cycle must still finish.
    r = await client.post("/api/sites", json={"url": fixture_site + "?v=2", "start_audit": False})
    sid = r.json()["site"]["id"]
    await client.patch(f"/api/sites/{sid}", json={"obey_robots": False, "max_pages": 10})
    job = await wait_job(client, (await client.post(f"/api/sites/{sid}/cycles", json={"fresh_audit": True})).json()["job_id"])
    assert job["status"] == "done", job
    for _ in range(120):
        run = (await client.get(f"/api/sites/{sid}/cycles")).json()[0]
        if run["status"] == "done":
            break
        await asyncio.sleep(0.5)
    assert run["status"] == "done" and run["output"]["cycle"]["summary"]


async def test_rejects_private_urls_when_not_allowed():
    from seo_engine.core.security import UnsafeURLError, assert_public_url

    try:
        await assert_public_url("http://127.0.0.1/", allow_private=False)
        raise AssertionError("expected UnsafeURLError")
    except UnsafeURLError:
        pass


async def test_scheduler_tick_handles_stored_timestamps(client):
    from datetime import timedelta

    from seo_engine.db import Site, session_scope
    from seo_engine.services.common import now
    from seo_engine.workers.scheduler import tick

    r = await client.post("/api/sites", json={"url": "https://scheduler.example/", "start_audit": False})
    sid = r.json()["site"]["id"]
    async with session_scope() as s:
        site = await s.get(Site, sid)
        site.last_audit_at = now() - timedelta(hours=2)  # audited recently → not due
    async with session_scope() as s:
        assert (await s.get(Site, sid)).last_audit_at.tzinfo is not None  # UTC-aware even on SQLite
    assert sid not in [j for j in await tick()]  # no crash comparing aware/naive datetimes
    await client.delete(f"/api/sites/{sid}")
