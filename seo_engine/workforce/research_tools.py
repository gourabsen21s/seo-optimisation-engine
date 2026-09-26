"""Live research, link-building, technical and rank-tracking tools for the AI employees.

Every tool returns plain data. When an integration is missing or an external API fails, tools return
{"error": ..., "hint": ...} instead of raising, so the employee can adapt (skip, ask the owner, use another tool).
"""

from __future__ import annotations

import asyncio
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, Field
from pydantic_ai import FunctionToolset, ModelRetry, RunContext

from ..audit.context import norm_url
from ..fixes.models import FixAction, FixKind, Risk
from ..integrations.notify import notify_event
from ..knowledge.index import get_index
from ..research import authority, keywords, pages, serp, tech
from ..research.http import ResearchError
from ..services import rankings
from ..services.integrations import get_integrations
from .roster import ROSTER
from .tools import EmployeeDeps

research_tools: FunctionToolset[EmployeeDeps] = FunctionToolset()


def _err(exc: Exception, hint: str = "") -> dict[str, Any]:
    return {"error": str(exc)[:400], **({"hint": hint} if hint else {})}


async def _search(ctx: RunContext[EmployeeDeps], query: str, **kw: Any) -> serp.SerpPage:
    """serp.search, billed to the site's workspace per query (the platform pays the search provider)."""
    from ..services import credits

    account_id = await credits.account_of_site(ctx.deps.site_id)
    try:
        await credits.ensure(account_id)
    except credits.ServiceError as exc:
        raise ResearchError(str(exc)) from exc
    page = await serp.search(query, await get_integrations(), **kw)
    await credits.charge(account_id, credits.price_rank_keywords(1), "research", site_id=ctx.deps.site_id,
                         note=f"Web search: {query[:80]}")
    return page


def _site_domain(ctx: RunContext[EmployeeDeps]) -> str:
    return serp.domain_of(ctx.deps.crawl.base_url)


# ----------------------------------------------------------------------------- search & keywords

@research_tools.tool
async def web_search(ctx: RunContext[EmployeeDeps], query: str, num: int = 10,
                     country: str | None = None) -> dict[str, Any]:
    """Live search results for a query: ranked organic results (title, URL, domain, snippet), People Also Ask
    questions and related searches. Use it to see who ranks, what searchers want and how snippets are written."""
    await ctx.deps.log(f"Searching “{query}”")
    try:
        page = await _search(ctx, query, num=num, country=country)
    except ResearchError as exc:
        return _err(exc, "Continue with Search Console data and the crawl, or ask the owner to add a search key.")
    ours = serp.position_of(page, _site_domain(ctx))
    return {"query": page.query, "provider": page.provider, "our_position": ours.position if ours else None,
            "our_url": ours.url if ours else None, "results": [r.model_dump() for r in page.results[:num]],
            "people_also_ask": page.people_also_ask[:8], "related_searches": page.related_searches[:10]}


@research_tools.tool
async def check_serp_position(ctx: RunContext[EmployeeDeps], keyword: str, country: str | None = None) -> dict[str, Any]:
    """Where this site ranks right now for a keyword (top 50), plus the pages ranking above it."""
    try:
        page = await _search(ctx, keyword, num=50, country=country)
    except ResearchError as exc:
        return _err(exc, "Use get_query_rows / get_rankings (Search Console) for average positions instead.")
    ours = serp.position_of(page, _site_domain(ctx))
    above = [r.model_dump() for r in page.results if not ours or r.position < ours.position][:10]
    return {"keyword": keyword, "position": ours.position if ours else None, "url": ours.url if ours else None,
            "ranking_above": above, "checked_depth": len(page.results)}


@research_tools.tool
async def keyword_ideas(ctx: RunContext[EmployeeDeps], seed: str, include_questions: bool = True,
                        deep: bool = False, limit: int = 60) -> dict[str, Any]:
    """Real search queries related to a seed keyword (Google Autocomplete), tagged question/modifier. Where Search
    Console is connected, each idea includes the impressions and position this site already has for it."""
    cfg = await get_integrations()
    await ctx.deps.log(f"Researching keywords for “{seed}”")
    try:
        ideas = await keywords.keyword_ideas(seed, questions=include_questions, alphabet=deep,
                                             country=cfg.serp_country, language=cfg.serp_language,
                                             limit=max(5, min(limit, 150)))
    except ResearchError as exc:
        return _err(exc)
    gsc: dict[str, dict] = {}
    for r in ctx.deps.gsc_rows:
        q = r.get("query", "").lower()
        if q:
            agg = gsc.setdefault(q, {"impressions": 0, "clicks": 0, "position": r["position"]})
            agg["impressions"] += r["impressions"]
            agg["clicks"] += r["clicks"]
            agg["position"] = min(agg["position"], r["position"])
    for idea in ideas:
        if idea["keyword"] in gsc:
            idea.update(gsc[idea["keyword"]])
    return {"seed": seed, "ideas": ideas, "note": "Autocomplete has no volumes; GSC impressions show real demand "
                                                  "where the site already appears."}


# ----------------------------------------------------------------------------- competitor & content research

@research_tools.tool
async def analyze_page(ctx: RunContext[EmployeeDeps], url: str) -> dict[str, Any]:
    """Fetch any public page (a competitor, a SERP result, a link prospect) and return its SEO anatomy: title,
    meta description, H1–H3 outline, word count, schema types, questions answered, links and a text excerpt."""
    await ctx.deps.log(f"Analysing {url}")
    try:
        return await pages.fetch_page(url)
    except ResearchError as exc:
        return _err(exc)


@research_tools.tool
async def content_gap(ctx: RunContext[EmployeeDeps], keyword: str, our_url: str | None = None,
                      competitors: int = 5) -> dict[str, Any]:
    """Compare our page with the top-ranking pages for a keyword: topics/sections they cover that we don't,
    questions they answer, schema they use, terms we lack, and word-count benchmarks."""
    domain = _site_domain(ctx)
    try:
        page = await _search(ctx, keyword, num=10)
    except ResearchError as exc:
        return _err(exc, "Without a search provider, pass competitor URLs to analyze_page instead.")
    urls = [r.url for r in page.results if r.domain != domain and not r.domain.endswith("." + domain)][:max(1, min(competitors, 8))]
    await ctx.deps.log(f"Comparing against {len(urls)} top results for “{keyword}”")
    fetched = await asyncio.gather(*(pages.fetch_page(u, text_chars=20000) for u in urls), return_exceptions=True)
    comps = [dict(f, text=f.get("text_excerpt", "")) for f in fetched if isinstance(f, dict) and not f.get("error")]
    ours = None
    target = our_url or (serp.position_of(page, domain).url if serp.position_of(page, domain) else None)
    if target:
        try:
            p = await pages.fetch_page(target, text_chars=20000)
            ours = dict(p, text=p.get("text_excerpt", "")) if not p.get("error") else None
        except ResearchError:
            ours = None
    gap = pages.gap_analysis(ours, comps)
    return {"keyword": keyword, "our_url": target, "competitors": [{"url": c["url"], "title": c.get("title"),
                                                                   "words": c.get("words")} for c in comps], **gap}


# ----------------------------------------------------------------------------- authority & links

@research_tools.tool
async def domain_authority(ctx: RunContext[EmployeeDeps], domains: list[str]) -> dict[str, Any]:
    """Open PageRank authority (0–10) for up to 100 domains — ours, competitors or link prospects."""
    cfg = await get_integrations()
    try:
        return {"domains": await authority.domain_authority(domains or [_site_domain(ctx)], cfg)}
    except ResearchError as exc:
        return _err(exc)


@research_tools.tool
async def find_link_prospects(ctx: RunContext[EmployeeDeps], topic: str,
                              kind: Literal["resource_pages", "guest_posts", "unlinked_mentions", "roundups"]
                              = "resource_pages", limit: int = 20) -> dict[str, Any]:
    """Find real backlink opportunities via search: resource pages, sites accepting guest posts, recent
    roundups, or pages that mention the brand without linking to it."""
    domain = _site_domain(ctx)
    brand = ctx.deps.profile.name or domain
    queries = {
        "resource_pages": [f'{topic} "useful resources"', f"{topic} inurl:resources", f'{topic} "helpful links"'],
        "guest_posts": [f'{topic} "write for us"', f'{topic} "guest post guidelines"', f'{topic} "contribute"'],
        "unlinked_mentions": [f'"{brand}" -site:{domain}'],
        "roundups": [f"{topic} roundup", f'{topic} "best blogs"', f"{topic} weekly links"],
    }[kind]
    seen: dict[str, dict] = {}
    for q in queries:
        try:
            page = await _search(ctx, q, num=20)
        except ResearchError as exc:
            return _err(exc)
        for r in page.results:
            if r.domain == domain or r.domain.endswith("." + domain) or r.domain in seen:
                continue
            seen[r.domain] = {"domain": r.domain, "url": r.url, "title": r.title, "snippet": r.snippet, "query": q}
    return {"kind": kind, "prospects": list(seen.values())[:limit],
            "next": "Check authority with domain_authority, then record outreach as propose_manual_action with a "
                    "personalised pitch. Never send email yourself."}


class InternalLink(BaseModel):
    target_url: str
    title: str | None = None
    relevance: float = Field(description="Semantic similarity 0–1")


@research_tools.tool
async def suggest_internal_links(ctx: RunContext[EmployeeDeps], url: str, limit: int = 8) -> dict[str, Any]:
    """Pages on this site that are topically related to `url` but not yet linked from it (semantic search over
    the site's knowledge index). Choose anchor text that already appears verbatim in the source page's copy."""
    page = ctx.deps.page(url)
    linked = {norm_url(l.url) for l in page.links if l.internal}
    query = " ".join(filter(None, [page.title, " ".join(page.h1), page.text_excerpt[:600]]))
    hits = await get_index().search(ctx.deps.site_id, query, limit=limit * 4, kinds=["page"])
    known = {norm_url(p.final_url): p for p in ctx.deps.crawl.html_pages()}
    out, seen = [], set()
    for h in hits:
        target = norm_url(h.get("url") or "")
        if not target or target == norm_url(page.final_url) or target in linked or target in seen or target not in known:
            continue
        seen.add(target)
        tp = known[target]
        out.append({"target_url": tp.final_url, "title": tp.title, "h1": tp.h1[:1], "relevance": round(h.get("score") or 0, 3)})
        if len(out) >= limit:
            break
    return {"source_url": page.final_url, "existing_internal_links": len(linked), "suggestions": out,
            "source_excerpt": page.text_excerpt[:1500]}


@research_tools.tool
async def propose_internal_link(ctx: RunContext[EmployeeDeps], source_url: str, target_url: str, anchor_text: str,
                                rationale: str) -> str:
    """Propose adding a contextual internal link: wrap the first body-copy occurrence of `anchor_text` on
    `source_url` in a link to `target_url`. The anchor must already appear in the page's text (2–8 words)."""
    src = ctx.deps.page(source_url)
    tgt = ctx.deps.page(target_url)
    if norm_url(src.final_url) == norm_url(tgt.final_url):
        raise ModelRetry("Source and target are the same page.")
    if not tgt.indexable:
        raise ModelRetry("The target page is not indexable; link to an indexable page.")
    words = anchor_text.split()
    if not 1 <= len(words) <= 10:
        raise ModelRetry("Anchor text should be 1–10 words.")
    if any(norm_url(l.url) == norm_url(tgt.final_url) for l in src.links if l.internal):
        return "The source page already links to that target — pick another target."
    text = src.text_excerpt
    if anchor_text.lower() not in text.lower():
        try:
            live = await pages.fetch_page(src.final_url, text_chars=50000)
            text = live.get("text_excerpt", "")
        except ResearchError:
            text = ""
        if anchor_text.lower() not in text.lower():
            raise ModelRetry(f"“{anchor_text}” does not appear in the body copy of {src.final_url}. Choose a phrase "
                             "that already exists in the text.")
    fix = FixAction(kind=FixKind.ADD_INTERNAL_LINK, title=f"Link “{anchor_text}” → {urlsplit(tgt.final_url).path}",
                    target_url=src.final_url, rationale=rationale, risk=Risk.SAFE, finding_code="internal_linking",
                    payload={"href": tgt.final_url, "anchor_text": anchor_text, "target_title": tgt.title})
    fix_id = ctx.deps.propose(fix)
    await ctx.deps.log(f"Proposed internal link on {src.final_url}")
    return f"Proposed internal link fix {fix_id}."


# ----------------------------------------------------------------------------- technical SEO

@research_tools.tool
async def run_pagespeed(ctx: RunContext[EmployeeDeps], url: str,
                        strategy: Literal["mobile", "desktop"] = "mobile") -> dict[str, Any]:
    """Live Lighthouse + Chrome UX Report data for a page on this site: performance/SEO scores, LCP, CLS, INP,
    TBT and the biggest savings opportunities."""
    if serp.domain_of(url) != _site_domain(ctx):
        raise ModelRetry("Only pages on this site can be tested.")
    await ctx.deps.log(f"Running PageSpeed ({strategy}) on {url}")
    try:
        return await tech.pagespeed(url, await get_integrations(), strategy)
    except ResearchError as exc:
        return _err(exc)


@research_tools.tool
async def submit_for_indexing(ctx: RunContext[EmployeeDeps], urls: list[str]) -> dict[str, Any]:
    """Tell search engines about new or changed URLs: IndexNow (Bing, Yandex, Seznam…) and a Search Console
    sitemap resubmission (Google). Only URLs on this site are accepted."""
    domain = _site_domain(ctx)
    urls = [u for u in urls if serp.domain_of(u) == domain][:500]
    if not urls:
        raise ModelRetry("Provide absolute URLs on this site.")
    cfg = await get_integrations()
    out: dict[str, Any] = {"urls": len(urls)}
    host = urlsplit(ctx.deps.crawl.base_url).hostname or domain
    if cfg.indexnow_key:
        key_file = next((p for p in ctx.deps.crawl.html_pages() if urlsplit(p.final_url).path == f"/{cfg.indexnow_key}.txt"), None)
        try:
            out["indexnow"] = await tech.indexnow_submit(host, cfg.indexnow_key, urls)
        except ResearchError as exc:
            out["indexnow"] = _err(exc)
        if out["indexnow"].get("status") == 403 and key_file is None:
            ctx.deps.propose(FixAction(kind=FixKind.WRITE_FILE, title="Host the IndexNow key file",
                                       payload={"path": f"{cfg.indexnow_key}.txt", "content": cfg.indexnow_key},
                                       rationale="IndexNow verifies site ownership through this file.", risk=Risk.SAFE))
            out["indexnow"]["fix"] = "Proposed a fix to host the key file; resubmit after it is applied."
    else:
        out["indexnow"] = {"skipped": "no IndexNow key configured"}
    if ctx.deps.gsc is not None:
        sitemaps = ctx.deps.crawl.sitemap_urls_found[:3] or [f"{ctx.deps.crawl.base_url.rstrip('/')}/sitemap.xml"]
        results = []
        for sm in sitemaps:
            try:
                await ctx.deps.gsc.submit_sitemap(sm)
                results.append({"sitemap": sm, "submitted": True})
            except Exception as exc:
                results.append({"sitemap": sm, "error": str(exc)[:200]})
        out["search_console"] = results
    else:
        out["search_console"] = {"skipped": "Search Console not connected"}
    return out


@research_tools.tool
async def propose_technical_fix(ctx: RunContext[EmployeeDeps], url: str,
                                fix: Literal["canonical", "lang", "viewport"], value: str, rationale: str) -> str:
    """Propose a head-level technical fix for a page: canonical URL, <html lang>, or the viewport meta tag."""
    page = ctx.deps.page(url)
    if fix == "canonical":
        if not value.startswith(("http://", "https://")):
            raise ModelRetry("Canonical must be an absolute URL.")
        action = FixAction(kind=FixKind.SET_CANONICAL, title="Set canonical URL", target_url=page.final_url,
                           payload={"canonical": value, "previous": page.canonical}, rationale=rationale,
                           risk=Risk.REVIEW, finding_code="canonical")
    elif fix == "lang":
        action = FixAction(kind=FixKind.SET_LANG, title=f"Set html lang={value}", target_url=page.final_url,
                           payload={"lang": value}, rationale=rationale, risk=Risk.SAFE, finding_code="missing_lang")
    else:
        action = FixAction(kind=FixKind.ADD_VIEWPORT, title="Add viewport meta", target_url=page.final_url,
                           payload={"viewport": value or "width=device-width, initial-scale=1"}, rationale=rationale,
                           risk=Risk.SAFE, finding_code="missing_viewport")
    return f"Proposed {fix} fix {ctx.deps.propose(action)}."


# ----------------------------------------------------------------------------- rank tracking

@research_tools.tool
async def track_keywords(ctx: RunContext[EmployeeDeps], keywords_to_track: list[str],
                         target_url: str | None = None) -> str:
    """Add keywords to daily rank tracking (optionally with the page meant to rank). Track only keywords that
    matter to the business — at most 20 per call."""
    items = [{"keyword": k, "target_url": target_url} for k in keywords_to_track[:20]]
    try:
        created = await rankings.add_keywords(ctx.deps.site_id, items, added_by=ctx.deps.employee_id)
    except Exception as exc:
        return f"Not added: {exc}"
    return f"Now tracking {len(created)} new keyword(s)."


@research_tools.tool
async def get_rankings(ctx: RunContext[EmployeeDeps], limit: int = 50) -> dict[str, Any]:
    """Tracked keywords with current position, change since the previous check, best position and ranking URL."""
    rows = await rankings.list_keywords(ctx.deps.site_id)
    return {"tracked": len(rows), "keywords": [
        {k: r[k] for k in ("keyword", "position", "change", "best", "url", "target_url", "source")} for r in rows[:limit]]}


# ----------------------------------------------------------------------------- manager only

manager_tools: FunctionToolset[EmployeeDeps] = FunctionToolset()


@manager_tools.tool
async def notify_owner(ctx: RunContext[EmployeeDeps], title: str, message: str,
                       level: Literal["info", "warning"] = "info") -> str:
    """Send the site owner a notification (Slack / email / webhook, as configured). Use for important news only:
    a big win, a risk that needs attention, or a decision you need soon."""
    channels = await notify_event("agent_message", title[:120], f"{ROSTER[ctx.deps.employee_id].name}: {message}",
                                  site_id=ctx.deps.site_id, level=level)
    return f"Delivered via {', '.join(channels)}." if channels else "No notification channel is configured; noted."


# Named subsets for role toolsets
RESEARCH = {"web_search", "check_serp_position", "keyword_ideas", "analyze_page", "content_gap"}
LINKS = {"suggest_internal_links", "propose_internal_link", "domain_authority", "find_link_prospects"}
TECH = {"run_pagespeed", "submit_for_indexing", "propose_technical_fix"}
RANKS = {"track_keywords", "get_rankings"}


def subset(*groups: set[str]):
    names = set().union(*groups)
    return research_tools.filtered(lambda ctx, tool_def: tool_def.name in names)
