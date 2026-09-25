"""Audit pipeline: crawl → checks → content judge (Jev) → report → rule-based fixes → autopilot."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select

from ..audit.context import AuditContext
from ..audit.pagespeed import pagespeed_sample
from ..audit.registry import run_checks
from ..audit.scoring import build_report
from ..core.config import get_settings
from ..crawler import crawl_site
from ..db import Audit, Site, session_scope
from ..fixes.planner import auto_profile, plan_rule_fixes
from ..judge import judge_pages, judgements_to_findings
from . import fixes as fix_service
from .common import JobReporter, NotFound, now, pack_crawl
from .settings import get_judge_config
from .sites import profile_of

log = logging.getLogger(__name__)


def audit_summary(a: Audit) -> dict[str, Any]:
    return {"id": a.id, "status": a.status, "overall_score": a.overall_score, "seo_score": a.seo_score,
            "adsense_score": a.adsense_score, "created_at": a.created_at, "finished_at": a.finished_at,
            "error": a.error}


async def list_audits(site_id: int, limit: int = 50) -> list[Audit]:
    async with session_scope() as s:
        return list(await s.scalars(select(Audit).where(Audit.site_id == site_id).order_by(Audit.id.desc())
                                    .limit(limit)))


async def get_audit(audit_id: int) -> Audit:
    async with session_scope() as s:
        audit = await s.get(Audit, audit_id)
    if audit is None:
        raise NotFound(f"audit {audit_id} not found")
    return audit


async def run_audit(site_id: int, report: JobReporter, autopilot: bool = True) -> dict[str, Any]:
    from . import credits

    settings = get_settings()
    async with session_scope() as s:
        site = await s.get(Site, site_id)
    if site is None:
        raise NotFound(f"site {site_id} not found")
    # Paid work: check the account first, and never crawl more pages than its credits cover.
    await credits.ensure(site.account_id)
    wanted = site.max_pages or settings.max_pages
    allowed = await credits.affordable_pages(site.account_id, wanted)
    if allowed < 1:
        raise credits.InsufficientCredits("Not enough credits to crawl this site. Add credits in Billing.")
    async with session_scope() as s:
        audit = Audit(site_id=site_id, status="running")
        s.add(audit)
        await s.flush()
        audit_id = audit.id
    try:
        crawl_settings = settings.model_copy(update={"max_pages": allowed})
        if allowed < wanted:
            await report.warn(f"Your credits cover {allowed} of {wanted} pages; crawling {allowed}")
        await report(f"Crawling {site.url} (up to {crawl_settings.max_pages} pages)")
        crawl = await crawl_site(site.url, crawl_settings, obey_robots=site.obey_robots)
        if await credits.is_metered(site.account_id):
            cost = credits.price_pages(len(crawl.pages))
            await credits.charge(site.account_id, cost, "audit", site_id=site_id,
                                 note=f"{len(crawl.pages)} pages crawled")
            await report(f"Used {credits.fmt(cost)} credits for {len(crawl.pages)} pages")
        await report(f"Crawled {len(crawl.pages)} URLs ({len(crawl.html_pages())} HTML); sitemap lists "
                     f"{len(crawl.sitemap_entries)} URLs")

        pagespeed = []
        if settings.pagespeed_api_key:
            await report("Measuring Core Web Vitals (PageSpeed Insights)")
            sample = [crawl.base_url] + [p.final_url for p in crawl.html_pages() if p.page_type == "article"][:2]
            pagespeed = await pagespeed_sample(sample, settings)

        await report("Running AdSense-manual and SEO checks")
        findings = run_checks(AuditContext(crawl, pagespeed))

        judgements: list[dict] = []
        judge_cfg = await get_judge_config()
        if judge_cfg:
            targets = [p for p in crawl.html_pages() if p.page_type in ("article", "page") and p.word_count > 150]
            await report(f"Content judge ({judge_cfg.model}) assessing {len(targets)} pages")
            judgements = await judge_pages(targets, judge_cfg)
            findings += judgements_to_findings(judgements, judge_cfg.min_confidence)

        audit_report = build_report(crawl, findings, pagespeed)
        profile = auto_profile(profile_of(site), crawl, audit_report)
        rule_fixes = plan_rule_fixes(audit_report, crawl, profile)

        async with session_scope() as s:
            a = await s.get(Audit, audit_id)
            a.status, a.finished_at = "done", now()
            a.overall_score, a.seo_score, a.adsense_score = (audit_report.overall_score, audit_report.seo_score,
                                                             audit_report.adsense_score)
            a.report = audit_report.model_dump(mode="json")
            a.crawl_gz = pack_crawl(crawl)
            a.judgements = judgements or None
            st = await s.get(Site, site_id)
            st.last_audit_at = now()
            st.profile = {**profile.model_dump(), **{k: v for k, v in (st.profile or {}).items() if v}}
        rows = await fix_service.persist(site_id, rule_fixes, audit_id=audit_id, replace_source="rules")
        await report(f"Score {audit_report.overall_score}/100 (SEO {audit_report.seo_score}, AdSense readiness "
                     f"{audit_report.adsense_score}); {len(findings)} findings; {len(rows)} rule-based fixes proposed")
        applied = await fix_service.autopilot_apply(site, rows, report) if autopilot else None
        return {"audit_id": audit_id, "overall_score": audit_report.overall_score, "fixes": len(rows),
                "autopilot": applied}
    except Exception as exc:
        async with session_scope() as s:
            a = await s.get(Audit, audit_id)
            a.status, a.error, a.finished_at = "failed", str(exc)[:2000], now()
        raise
