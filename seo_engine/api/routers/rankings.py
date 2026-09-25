from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from ...services import rankings
from ...services import sites as site_service
from ...workers.queue import enqueue
from ..deps import require_credits

router = APIRouter(tags=["rankings"])


class KeywordIn(BaseModel):
    keyword: str = Field(min_length=1, max_length=300)
    target_url: str | None = Field(default=None, max_length=1000)
    country: str | None = Field(default=None, max_length=5)


class KeywordsIn(BaseModel):
    keywords: list[KeywordIn] = Field(min_length=1, max_length=200)


@router.get("/sites/{site_id}/keywords")
async def list_keywords(site_id: int):
    await site_service.get_site(site_id)
    return await rankings.list_keywords(site_id)


@router.post("/sites/{site_id}/keywords", status_code=201)
async def add_keywords(site_id: int, body: KeywordsIn):
    created = await rankings.add_keywords(site_id, [k.model_dump() for k in body.keywords])
    return {"added": len(created)}


@router.delete("/sites/{site_id}/keywords/{keyword_id}", status_code=204)
async def delete_keyword(site_id: int, keyword_id: int):
    await rankings.delete_keyword(site_id, keyword_id)
    return Response(status_code=204)


@router.get("/sites/{site_id}/keywords/{keyword_id}/history")
async def keyword_history(site_id: int, keyword_id: int, days: int = 90):
    return await rankings.history(site_id, keyword_id, max(1, min(days, 365)))


@router.post("/sites/{site_id}/keywords/check", status_code=202, dependencies=[Depends(require_credits)])
async def check_now(site_id: int):
    await site_service.get_site(site_id)
    return {"job_id": await enqueue("rank_check", site_id, dedupe=False)}
