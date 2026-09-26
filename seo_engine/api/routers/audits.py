from __future__ import annotations

import json
from typing import Literal

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse, Response

from ...core.models import AuditReport
from ...core.requirements import SECTIONS
from ...reports import render_html
from ...services import audits as audit_service
from ...services import sites as site_service
from ...workers.queue import enqueue
from ..deps import require_credits

router = APIRouter(tags=["audits"])


@router.post("/sites/{site_id}/audits", status_code=202, dependencies=[Depends(require_credits)])
async def start_audit(site_id: int):
    await site_service.get_site(site_id)
    return {"job_id": await enqueue("audit", site_id)}


@router.get("/sites/{site_id}/audits")
async def list_audits(site_id: int):
    return [audit_service.audit_summary(a) for a in await audit_service.list_audits(site_id)]


@router.get("/audits/{audit_id}")
async def get_audit(audit_id: int):
    a = await audit_service.get_audit(audit_id)
    return {**audit_service.audit_summary(a), "report": a.report, "judgements": a.judgements}


@router.get("/audits/{audit_id}/export")
async def export_audit(audit_id: int, format: Literal["json", "html"] = "html"):
    a = await audit_service.get_audit(audit_id)
    if a.report is None:
        return Response(status_code=404)
    filename = f"seo-audit-{audit_id}"
    if format == "json":
        return Response(json.dumps({"report": a.report, "judgements": a.judgements}, default=str, indent=2),
                        media_type="application/json",
                        headers={"Content-Disposition": f'attachment; filename="{filename}.json"'})
    html = render_html(AuditReport.model_validate(a.report), a.judgements or [], SECTIONS)
    return HTMLResponse(html, headers={"Content-Disposition": f'inline; filename="{filename}.html"'})
