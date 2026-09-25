"""Turn findings into requirement statuses and 0–100 scores."""

from __future__ import annotations

from collections import defaultdict

from ..core.models import (
    SEVERITY_RANK,
    AuditReport,
    CrawlResult,
    Finding,
    RequirementResult,
    RequirementStatus,
    Severity,
)
from ..core.requirements import LEVEL_WEIGHT, REQUIREMENTS, SECTIONS

STATUS_VALUE = {RequirementStatus.PASS: 1.0, RequirementStatus.WARN: 0.5, RequirementStatus.FAIL: 0.0}
SEO_PENALTY = {Severity.CRITICAL: 15, Severity.HIGH: 8, Severity.MEDIUM: 4, Severity.LOW: 1.5, Severity.INFO: 0}


def requirement_results(findings: list[Finding]) -> list[RequirementResult]:
    by_req: dict[int, list[Finding]] = defaultdict(list)
    for f in findings:
        if f.requirement:
            by_req[f.requirement].append(f)
    results = []
    for req in REQUIREMENTS.values():
        related = [f for f in by_req.get(req.id, []) if f.severity != Severity.INFO]
        if not req.automated:
            status = RequirementStatus.MANUAL
        elif any(SEVERITY_RANK[f.severity] >= SEVERITY_RANK[Severity.HIGH] for f in related):
            status = RequirementStatus.FAIL
        elif related:
            status = RequirementStatus.WARN
        else:
            status = RequirementStatus.PASS
        results.append(RequirementResult(
            id=req.id, section=req.section, title=req.title, level=req.level.value, status=status,
            verify=req.verify, findings=[f.code for f in by_req.get(req.id, [])],
        ))
    return results


def _weighted(results: list[RequirementResult]) -> int:
    num = den = 0.0
    for r in results:
        if r.status == RequirementStatus.MANUAL:
            continue
        w = LEVEL_WEIGHT[REQUIREMENTS[r.id].level]
        num += w * STATUS_VALUE[r.status]
        den += w
    return round(100 * num / den) if den else 100


def seo_score(findings: list[Finding], page_count: int) -> int:
    penalty = 0.0
    for f in findings:
        if f.category not in ("seo", "performance", "content") and f.requirement not in (13, 14, 15, 17, 20, 22, 23, 30, 36):
            continue
        base = SEO_PENALTY[f.severity]
        spread = min(1.0, len(f.urls) / max(1, page_count)) if f.urls else 1.0
        penalty += base * (0.4 + 0.6 * spread)
    return max(0, min(100, round(100 - penalty)))


def build_report(crawl: CrawlResult, findings: list[Finding], pagespeed: list[dict] | None = None) -> AuditReport:
    findings = sorted(findings, key=lambda f: (-SEVERITY_RANK[f.severity], f.requirement or 99, f.code))
    reqs = requirement_results(findings)
    pages = crawl.html_pages()
    adsense = _weighted(reqs)
    seo = seo_score(findings, len(pages))
    sections = {key: _weighted([r for r in reqs if r.section == key]) for key in SECTIONS}
    articles = [p for p in pages if p.page_type == "article"]
    return AuditReport(
        site_url=crawl.base_url,
        seo_score=seo,
        adsense_score=adsense,
        overall_score=round((seo + adsense) / 2),
        section_scores=sections,
        pages_crawled=len(crawl.pages),
        findings=findings,
        requirements=reqs,
        pages=[{
            "url": p.final_url, "status": p.status, "type": p.page_type, "title": p.title,
            "meta_description": p.meta_description, "words": p.word_count, "h1": p.h1[:1],
            "indexable": p.indexable, "response_ms": p.response_ms,
            "images_missing_alt": sum(1 for i in p.images if not (i.alt or "").strip()),
            "schema": sorted(p.schema_types()),
        } for p in crawl.pages.values()],
        stats={
            "html_pages": len(pages),
            "articles": len(articles),
            "avg_words": round(sum(p.word_count for p in articles) / len(articles)) if articles else 0,
            "sitemap_urls": len(crawl.sitemap_entries),
            "broken": sum(1 for p in crawl.pages.values() if p.status >= 400),
            "truncated": crawl.truncated,
            "by_severity": {s.value: sum(1 for f in findings if f.severity == s) for s in Severity},
        },
        pagespeed=pagespeed or [],
    )
