"""FastAPI application factory."""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .. import __version__
from ..connectors import ConnectorError
from ..core.config import get_settings
from ..core.logging import configure_logging
from ..core.security import UnsafeURLError
from ..db import create_all
from ..db.session import get_engine
from ..services.common import NotFound, ServiceError
from ..workers import queue, scheduler
from .deps import require_api_key
from .routers import agent, audits, fixes, integrations, jobs, rankings, settings, sites, team

log = logging.getLogger(__name__)


def _frontend_dist() -> Path:
    configured = get_settings().frontend_dist
    for candidate in ([Path(configured)] if configured else []) + [Path.cwd() / "frontend" / "dist",
                                                                  Path(__file__).resolve().parents[2] / "frontend" / "dist"]:
        if (candidate / "index.html").is_file():
            return candidate.resolve()
    return Path(configured or "frontend/dist").resolve()


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    cfg = get_settings()
    if cfg.environment != "production":
        await create_all()  # production runs `seo-engine migrate` (Alembic) before start
    if not cfg.secret_key:
        log.warning("SEO_SECRET_KEY is not set — saving credentials will fail")
    stop = asyncio.Event()
    sched_task = None
    if cfg.scheduler_enabled and not cfg.redis_url:
        sched_task = asyncio.create_task(scheduler.run_forever(stop))  # arq worker runs it otherwise
    yield
    stop.set()
    if sched_task:
        await sched_task
    await queue.shutdown()
    await get_engine().dispose()


def create_app() -> FastAPI:
    cfg = get_settings()
    app = FastAPI(title="Rankcrew API", description="Rankcrew — your autonomous SEO team.", version=__version__, lifespan=lifespan,
                  docs_url="/api/docs", openapi_url="/api/openapi.json")
    app.add_middleware(GZipMiddleware, minimum_size=1024)
    if cfg.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=cfg.cors_origins, allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(NotFound)
    async def not_found(_: Request, exc: NotFound):
        return JSONResponse({"detail": str(exc)}, status_code=404)

    @app.exception_handler(ServiceError)
    @app.exception_handler(ConnectorError)
    @app.exception_handler(UnsafeURLError)
    async def bad_request(_: Request, exc: Exception):
        return JSONResponse({"detail": str(exc)}, status_code=400)

    protected = [Depends(require_api_key)]
    for r in (sites.router, audits.router, fixes.router, agent.router, jobs.router, settings.router, team.router,
              integrations.router, rankings.router):
        app.include_router(r, prefix="/api", dependencies=protected)

    @app.get("/healthz", include_in_schema=False)
    async def healthz():
        return {"status": "ok", "version": __version__}

    @app.get("/readyz", include_in_schema=False)
    async def readyz():
        async with get_engine().connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ready"}

    FRONTEND_DIST = _frontend_dist()
    if (FRONTEND_DIST / "index.html").is_file():
        app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        async def spa(path: str):
            if path.startswith("api/"):
                return JSONResponse({"detail": "Not Found"}, status_code=404)
            candidate = (FRONTEND_DIST / path).resolve()
            if path and candidate.is_file() and FRONTEND_DIST in candidate.parents:
                return FileResponse(candidate)
            # Always revalidate the shell so browsers never run a stale build whose hashed chunks are gone.
            return FileResponse(FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-cache"})

    return app


app = create_app()
