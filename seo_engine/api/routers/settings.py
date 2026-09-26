from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends

from ...core.config import get_settings
from ...core.requirements import REQUIREMENTS
from ...services import settings as settings_service
from ..deps import require_superuser
from ..schemas import SettingsIn, TestIn

router = APIRouter(tags=["settings"])


@router.get("/auth/check")
async def auth_check():
    return {"ok": True, "environment": get_settings().environment}


@router.get("/settings/llm", dependencies=[Depends(require_superuser)])
async def get_llm_settings():
    return await settings_service.public_settings()


@router.put("/settings/llm", dependencies=[Depends(require_superuser)])
async def put_llm_settings(body: SettingsIn):
    await settings_service.update(body.llm, body.judge)
    return await settings_service.public_settings()


@router.post("/settings/llm/test", dependencies=[Depends(require_superuser)])
async def test_llm(body: TestIn):
    return await settings_service.test(body.target)


@router.get("/requirements")
async def requirements():
    return [{**asdict(r), "level": r.level.value} for r in REQUIREMENTS.values()]
