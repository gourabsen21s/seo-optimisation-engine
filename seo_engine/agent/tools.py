"""Tools the strategist and chat agents can call. All reads come from the stored audit; live fetches are
restricted to the audited site and guarded against SSRF."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import urlsplit

import httpx
import trafilatura
from pydantic_ai import FunctionToolset, ModelRetry, RunContext

from ..audit.context import norm_url
from ..core.config import Settings
from ..core.models import SEVERITY_RANK, AuditReport, CrawlResult, PageData, Severity
from ..core.security import UnsafeURLError, assert_public_url
from ..fixes.models import FixAction, FixKind, Risk
from ..generators import schema as schema_gen
from ..generators.profile import SiteProfile
from .schemas import ImageAlt

LIVE_FETCH_CHARS = 12_000


@dataclass
class AgentDeps:
    profile: SiteProfile
    report: AuditReport
    crawl: CrawlResult
    settings: Settings
    proposals: list[FixAction] = field(default_factory=list)
    emit: Callable[[str], Awaitable[None]] | None = None

    async def log(self, message: str) -> None:
        if self.emit:
            await self.emit(message)

    def page(self, url: str) -> PageData:
        target = norm_url(url)
        for p in self.crawl.pages.values():
            if norm_url(p.final_url) == target or norm_url(p.url) == target:
                return p
        raise ModelRetry(f"{url} is not in the crawl. Use list_pages to find valid URLs.")

    def propose(self, fix: FixAction) -> str:
        fix.source = "agent"
        key = fix.dedupe_key()
        self.proposals = [p for p in self.proposals if p.dedupe_key() != key] + [fix]
        return fix.id


seo_tools: FunctionToolset[AgentDeps] = FunctionToolset()


@seo_tools.tool
async def get_audit_overview(ctx: RunContext[AgentDeps]) -> dict[str, Any]:
    """Scores, section scores, crawl stats, failing AdSense requirements and site profile."""
    r = ctx.deps.report
    await ctx.deps.log("Reading audit overview")
    return {
        "site": r.site_url,
        "scores": {"overall": r.overall_score, "seo": r.seo_score, "adsense_readiness": r.adsense_score},
        "section_scores": r.section_scores,
        "stats": r.stats,
        "failing_requirements": [f"R{q.id} {q.title} ({q.level})" for q in r.requirements if q.status == "fail"],
        "warning_requirements": [f"R{q.id} {q.title}" for q in r.requirements if q.status == "warn"],
        "manual_requirements": [f"R{q.id} {q.title}" for q in r.requirements if q.status == "manual"],
        "profile": ctx.deps.profile.model_dump(exclude={"author_bio"}),
        "pagespeed": r.pagespeed[:3],
    }


@seo_tools.tool
async def list_findings(ctx: RunContext[AgentDeps], min_severity: Literal["critical", "high", "medium", "low", "info"] = "low",
                        requirement: int | None = None, limit: int = 40) -> list[dict[str, Any]]:
    """List audit findings, most severe first. Optionally filter by minimum severity or manual requirement number."""
    floor = SEVERITY_RANK[Severity(min_severity)]
    out = []
    for f in ctx.deps.report.findings:
        if SEVERITY_RANK[f.severity] < floor or (requirement and f.requirement != requirement):
            continue
        out.append({"code": f.code, "title": f.title, "severity": f.severity, "requirement": f.requirement,
                    "detail": f.detail[:300], "affected": len(f.urls), "sample_urls": f.urls[:5],
                    "fixable": f.fixable})
    return out[:limit]


@seo_tools.tool
async def list_pages(ctx: RunContext[AgentDeps], page_type: Literal["any", "home", "article", "page", "category", "tag", "author"] = "any",
                     sort_by: Literal["words", "url"] = "words", limit: int = 30) -> list[dict[str, Any]]:
    """List crawled HTML pages with key SEO fields."""
    pages = [p for p in ctx.deps.crawl.html_pages() if page_type == "any" or p.page_type == page_type]
    pages.sort(key=(lambda p: -p.word_count) if sort_by == "words" else (lambda p: p.final_url))
    return [{"url": p.final_url, "type": p.page_type, "title": p.title, "words": p.word_count,
             "indexable": p.indexable, "has_meta_description": bool(p.meta_description)} for p in pages[:limit]]


@seo_tools.tool
async def get_page(ctx: RunContext[AgentDeps], url: str) -> dict[str, Any]:
    """Detailed crawl data for one page: head tags, headings, images, links, schema and a text excerpt."""
    p = ctx.deps.page(url)
    await ctx.deps.log(f"Inspecting {p.final_url}")
    internal = [l for l in p.links if l.internal]
    return {
        "url": p.final_url, "status": p.status, "type": p.page_type, "title": p.title,
        "meta_description": p.meta_description, "canonical": p.canonical, "robots": p.meta_robots, "lang": p.lang,
        "h1": p.h1, "headings": p.headings[:30], "words": p.word_count,
        "images": [i.model_dump() for i in p.images[:25]],
        "internal_links": len(internal), "body_internal_links": len([l for l in internal if l.region == "body"]),
        "external_links": len(p.links) - len(internal), "schema_types": sorted(p.schema_types()),
        "published": p.published_time, "modified": p.modified_time, "og": p.og,
        "excerpt": p.text_excerpt[:2500],
    }


@seo_tools.tool
async def fetch_live_page(ctx: RunContext[AgentDeps], url: str) -> dict[str, Any]:
    """Fetch the current live version of a page on the audited site and extract its main article text."""
    site_host = (urlsplit(ctx.deps.crawl.base_url).hostname or "").removeprefix("www.")
    if (urlsplit(url).hostname or "").removeprefix("www.") != site_host:
        raise ModelRetry("Only pages on the audited site can be fetched.")
    try:
        await assert_public_url(url, ctx.deps.settings.allow_private_networks)
    except UnsafeURLError as exc:
        raise ModelRetry(str(exc)) from exc
    await ctx.deps.log(f"Fetching live page {url}")
    async with httpx.AsyncClient(timeout=ctx.deps.settings.request_timeout, follow_redirects=True,
                                 headers={"User-Agent": ctx.deps.settings.user_agent}) as client:
        resp = await client.get(url)
    text = trafilatura.extract(resp.text, include_comments=False, include_tables=True, favor_precision=True) or ""
    return {"url": str(resp.url), "status": resp.status_code, "words": len(text.split()),
            "text": text[:LIVE_FETCH_CHARS], "truncated": len(text) > LIVE_FETCH_CHARS}


@seo_tools.tool
async def propose_page_copy(ctx: RunContext[AgentDeps], url: str, rationale: str, title: str | None = None,
                            meta_description: str | None = None) -> str:
    """Propose a new SEO title and/or meta description for a page. Titles 30–60 chars, descriptions 120–155."""
    p = ctx.deps.page(url)
    ids = []
    if title:
        if not 20 <= len(title) <= 65:
            raise ModelRetry(f"Title is {len(title)} characters; keep it within 30–60.")
        ids.append(ctx.deps.propose(FixAction(
            kind=FixKind.SET_TITLE, title="Rewrite title", target_url=p.final_url, rationale=rationale,
            payload={"title": title, "previous": p.title}, risk=Risk.REVIEW if p.title else Risk.SAFE,
            finding_code="title_length")))
    if meta_description:
        if not 70 <= len(meta_description) <= 170:
            raise ModelRetry(f"Description is {len(meta_description)} characters; keep it within 120–155.")
        ids.append(ctx.deps.propose(FixAction(
            kind=FixKind.SET_META_DESCRIPTION, title="Write meta description", target_url=p.final_url,
            rationale=rationale, payload={"meta_description": meta_description, "previous": p.meta_description},
            risk=Risk.REVIEW if p.meta_description else Risk.SAFE, finding_code="missing_meta_description")))
    await ctx.deps.log(f"Proposed copy for {p.final_url}")
    return f"Proposed {len(ids)} fix(es): {', '.join(ids)}"


@seo_tools.tool
async def propose_image_alts(ctx: RunContext[AgentDeps], url: str, alts: list[ImageAlt]) -> str:
    """Propose alt text for images on a page that currently lack it."""
    p = ctx.deps.page(url)
    known = {i.src for i in p.images if not (i.alt or "").strip()}
    valid = [a.model_dump() for a in alts if a.src in known and a.alt.strip()]
    if not valid:
        raise ModelRetry("None of those src values match images without alt text on this page.")
    return ctx.deps.propose(FixAction(kind=FixKind.SET_IMAGE_ALT, title=f"Add alt text to {len(valid)} images",
                                      target_url=p.final_url, payload={"alts": valid}, requirement=30,
                                      finding_code="img_no_alt"))


@seo_tools.tool
async def propose_schema(ctx: RunContext[AgentDeps], url: str,
                         schema_type: Literal["BlogPosting", "BreadcrumbList", "Organization", "WebSite", "Person",
                                              "FAQPage", "HowTo"],
                         custom_schema: dict[str, Any] | None = None) -> str:
    """Propose JSON-LD for a page. BlogPosting/BreadcrumbList/Organization/WebSite/Person are generated from
    crawl data and the site profile. FAQPage/HowTo need `custom_schema` that mirrors content VISIBLE on the page."""
    p, prof = ctx.deps.page(url), ctx.deps.profile
    builders = {
        "BlogPosting": lambda: schema_gen.article_schema(p, prof),
        "BreadcrumbList": lambda: schema_gen.breadcrumb_schema(p, prof),
        "Organization": lambda: schema_gen.organization_schema(prof),
        "WebSite": lambda: schema_gen.website_schema(prof),
        "Person": lambda: schema_gen.person_schema(prof),
    }
    if schema_type in builders:
        data, risk = builders[schema_type](), Risk.SAFE
    else:
        if not custom_schema or custom_schema.get("@type") != schema_type:
            raise ModelRetry(f"Provide custom_schema with '@type': '{schema_type}' built from visible page content.")
        data, risk = {"@context": "https://schema.org", **custom_schema}, Risk.REVIEW
    return ctx.deps.propose(FixAction(kind=FixKind.ADD_JSON_LD, title=f"Add {schema_type} schema",
                                      target_url=p.final_url, payload={"schema_type": schema_type, "schema": data},
                                      risk=risk, requirement=23))


@seo_tools.tool
async def propose_manual_action(ctx: RunContext[AgentDeps], title: str, instructions: str,
                                requirement: int | None = None) -> str:
    """Record an action only a human can take (admin panels, Search Console, AdSense settings, writing)."""
    return ctx.deps.propose(FixAction(kind=FixKind.MANUAL, title=title, payload={"instructions": instructions},
                                      requirement=requirement, risk=Risk.REVIEW))
