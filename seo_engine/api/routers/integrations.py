from __future__ import annotations

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from ...code.aider import aider_binary
from ...services import budget
from ...services import integrations as integration_service

router = APIRouter(tags=["integrations"])


class IntegrationTestIn(BaseModel):
    target: Literal["serp", "openpagerank", "pagespeed", "notify"]


@router.get("/settings/integrations")
async def get_integrations():
    return await integration_service.public()


@router.put("/settings/integrations")
async def put_integrations(body: integration_service.IntegrationsUpdate):
    await integration_service.update(body)
    return await integration_service.public()


@router.post("/settings/integrations/test")
async def test_integration(body: IntegrationTestIn):
    return await integration_service.test(body.target)


@router.get("/settings/usage")
async def usage(days: int = 30):
    return await budget.usage_summary(max(1, min(days, 90)))


@router.get("/capabilities")
async def capabilities():
    """What the team can do right now, so the UI can explain missing integrations."""
    import shutil

    cfg = await integration_service.get_integrations()
    return {
        "serp": cfg.serp_configured, "serp_provider": cfg.serp_provider or None,
        "domain_authority": bool(cfg.openpagerank_api_key), "pagespeed_key": bool(cfg.pagespeed_api_key),
        "indexnow": bool(cfg.indexnow_key), "notifications": cfg.notifications_configured,
        "code_edits": aider_binary() is not None, "code_execution": cfg.code_execution_enabled,
        "ripgrep": shutil.which("rg") is not None, "git": shutil.which("git") is not None,
        "budget": cfg.llm_daily_token_budget,
    }
