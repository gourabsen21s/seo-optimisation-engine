"""What happens to an employee's proposals: Compliance Judge → persist → autopilot."""

from __future__ import annotations

import asyncio
from collections import defaultdict

from ..audit.context import norm_url
from ..core.models import CrawlResult
from ..db import Site
from ..fixes.models import FixAction
from ..judge import verify_copy_fixes
from ..services import budget
from ..services import fixes as fix_service
from ..services.common import JobReporter
from ..services.settings import get_judge_config
from .board import log_activity
from .roster import COMPLIANCE

_site_locks: dict[int, asyncio.Lock] = defaultdict(asyncio.Lock)


async def process_proposals(site: Site, proposals: list[FixAction], crawl: CrawlResult, *, audit_id: int | None,
                            run_id: int | None, report: JobReporter, author: str) -> dict:
    if not proposals:
        return {"proposed": 0, "applied": 0, "held_back": 0}
    held_back = 0
    judge_cfg = await get_judge_config()
    if judge_cfg:
        pages = {p.final_url: p for p in crawl.html_pages()}
        pages.update({norm_url(k): v for k, v in list(pages.items())})
        await verify_copy_fixes(proposals, pages, judge_cfg,
                                capabilities=[budget.meter(site.id, COMPLIANCE, judge_cfg.model)])
        held_back = sum(1 for p in proposals if p.payload.get("verification", {}).get("passed") is False)
        if held_back:
            await log_activity(site.id, COMPLIANCE, "reviewed",
                               f"Jev held back {held_back} of {len(proposals)} changes for human review")
    rows = await fix_service.persist(site.id, proposals, audit_id=audit_id, run_id=run_id)
    async with _site_locks[site.id]:  # one writer per site at a time (connectors touch the same files/branches)
        applied = await fix_service.autopilot_apply(site, rows, report)
    n_applied = (applied or {}).get("applied", 0)
    await log_activity(site.id, author, "proposed_fixes",
                       f"Proposed {len(rows)} changes" + (f"; autopilot applied {n_applied}" if applied else ""))
    return {"proposed": len(rows), "applied": n_applied, "held_back": held_back}
