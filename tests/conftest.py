"""Test configuration: isolated env, a local fixture website, and an in-process API client."""

from __future__ import annotations

import os
import shutil
import tempfile
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import httpx
import pytest

FIXTURE_SITE = Path(__file__).parent / "fixtures" / "site"
SITE_PORT = 8765  # the fixture HTML hard-codes this port in canonicals and the sitemap
SITE_URL = f"http://127.0.0.1:{SITE_PORT}/"
_TMP = tempfile.mkdtemp(prefix="seo-engine-test-")

os.environ.update({
    "SEO_ENVIRONMENT": "test",
    "SEO_DATABASE_URL": f"sqlite+aiosqlite:///{_TMP}/test.db",
    "SEO_SECRET_KEY": "test-secret-passphrase",
    "SEO_API_KEYS": "test-key",
    "SEO_ALLOW_PRIVATE_NETWORKS": "true",
    "SEO_SCHEDULER_ENABLED": "false",
    "SEO_EXTERNAL_LINK_CHECK_LIMIT": "0",
    "SEO_REDIS_URL": "",
    "SEO_PAGESPEED_API_KEY": "",
    "SEO_LLM_MODEL": "test",  # PydanticAI's offline TestModel
    "SEO_JUDGE_MODEL": "typesafe:jev-latest",
    "SEO_JUDGE_API_KEY": "",
    "TYPESAFE_API_KEY": "",
    "PYDANTIC_AI_NO_BANNER": "1",
    "SEO_EMBEDDER": "hash",  # offline embeddings (no model download in tests)
    "SEO_DATA_DIR": f"{_TMP}/data",
    "SEO_QDRANT_URL": "",
    "MEM0_TELEMETRY": "False",
})


class OfflineTransport(httpx.AsyncBaseTransport):
    """Research HTTP stub: local fixture traffic passes through; everything external gets a canned 503.
    Tests that need specific API responses install their own httpx.MockTransport."""

    def __init__(self):
        self._local = httpx.AsyncHTTPTransport()

    async def handle_async_request(self, request):
        if request.url.host in ("127.0.0.1", "localhost"):
            return await self._local.handle_async_request(request)
        return httpx.Response(503, request=request, text="offline in tests")

    async def aclose(self):
        await self._local.aclose()


@pytest.fixture(autouse=True, scope="session")
def _offline_research():
    from seo_engine.research import http as research_http

    research_http.set_transport(OfflineTransport())
    yield
    research_http.set_transport(None)


class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@pytest.fixture(scope="session")
def fixture_site():
    handler = partial(_QuietHandler, directory=str(FIXTURE_SITE))
    server = ThreadingHTTPServer(("127.0.0.1", SITE_PORT), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield SITE_URL
    server.shutdown()


@pytest.fixture
def site_copy(tmp_path) -> Path:
    dest = tmp_path / "site"
    shutil.copytree(FIXTURE_SITE, dest)
    return dest


@pytest.fixture(scope="session")
async def audited(fixture_site):
    from seo_engine.audit.runner import run_audit

    report, crawl = await run_audit(fixture_site, obey_robots=False)
    return report, crawl


@pytest.fixture
async def client(fixture_site):
    import httpx
    from asgi_lifespan import LifespanManager

    from seo_engine.api.app import create_app

    app = create_app()
    async with LifespanManager(app):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test",
                                     headers={"X-API-Key": "test-key"}, timeout=120) as c:
            yield c

@pytest.fixture
async def site_with_audit(client, fixture_site):
    r = await client.post("/api/sites", json={"url": fixture_site + "?team=1", "start_audit": False})
    sid = r.json()["site"]["id"]
    await client.patch(f"/api/sites/{sid}", json={"obey_robots": False, "max_pages": 10})
    from tests.test_api import wait_job

    job = await wait_job(client, (await client.post(f"/api/sites/{sid}/audits")).json()["job_id"])
    assert job["status"] == "done", job
    yield sid
    await client.delete(f"/api/sites/{sid}")
