from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select

from ...connectors import CONNECTOR_FIELDS
from ...db import MetricSnapshot, session_scope
from ...services import credits
from ...services import sites as site_service
from ...services.accounts import Principal
from ...workers.queue import enqueue
from ..deps import current_principal
from ..schemas import ConnectorIn, GSCIn, SiteCreate, SiteUpdate

router = APIRouter(tags=["sites"])


@router.get("/sites")
async def list_sites(p: Principal = Depends(current_principal)):
    # Operator API keys see the whole platform; everyone else sees their own workspace.
    scope = None if p.via == "api_key" else p.account_id
    return [await site_service.serialize(s) for s in await site_service.list_sites(scope)]


@router.post("/sites", status_code=201)
async def create_site(body: SiteCreate, p: Principal = Depends(current_principal)):
    site = await site_service.create_site(body.url, body.name, body.autopilot, account_id=p.account_id)
    job_id, blocked = None, None
    if body.start_audit:
        try:
            await credits.ensure(p.account_id, user_verified=p.email_verified if p.via == "session" else None)
            job_id = await enqueue("audit", site.id)
        except credits.ServiceError as exc:  # the site is saved; the first audit waits for credits/verification
            blocked = str(exc)
    return {"site": await site_service.serialize(site), "job_id": job_id, "audit_blocked": blocked}


@router.get("/sites/{site_id}")
async def get_site(site_id: int):
    return await site_service.serialize(await site_service.get_site(site_id))


@router.patch("/sites/{site_id}")
async def update_site(site_id: int, body: SiteUpdate):
    site = await site_service.update_site(site_id, body.model_dump(exclude_unset=True))
    return await site_service.serialize(site)


@router.delete("/sites/{site_id}", status_code=204)
async def delete_site(site_id: int):
    await site_service.delete_site(site_id)
    return Response(status_code=204)


@router.get("/connectors/fields")
async def connector_fields():
    return CONNECTOR_FIELDS


@router.put("/sites/{site_id}/connector")
async def set_connector(site_id: int, body: ConnectorIn):
    return await site_service.serialize(await site_service.set_connector(site_id, body.type, body.config))


@router.post("/sites/{site_id}/connector/test")
async def test_connector(site_id: int):
    return await site_service.test_connector(site_id)


@router.put("/sites/{site_id}/gsc")
async def set_gsc(site_id: int, body: GSCIn):
    return await site_service.serialize(await site_service.set_gsc(site_id, body.property_url,
                                                                   body.service_account_json))


@router.post("/sites/{site_id}/gsc/test")
async def test_gsc(site_id: int):
    return await site_service.test_gsc(site_id)


@router.get("/sites/{site_id}/metrics")
async def metrics(site_id: int):
    async with session_scope() as s:
        rows = list(await s.scalars(select(MetricSnapshot).where(MetricSnapshot.site_id == site_id)
                                    .order_by(MetricSnapshot.captured_at).limit(365)))
    return [{"captured_at": r.captured_at, "clicks": r.clicks, "impressions": r.impressions, "ctr": r.ctr,
             "position": r.position, "top_queries": r.top_queries} for r in rows]
