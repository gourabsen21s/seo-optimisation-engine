"""Keyword rank tracking: live SERP checks (when a provider is configured) or Search Console average positions."""

from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy import delete, func, select

from ..db import RankSnapshot, Site, TrackedKeyword, session_scope
from ..research.http import ResearchError
from ..research.serp import domain_of, position_of, search
from .common import JobReporter, NotFound, ServiceError, now
from .integrations import get_integrations
from .sites import gsc_for

MAX_KEYWORDS = 300
SERP_DEPTH = 50


async def add_keywords(site_id: int, items: list[dict[str, Any]], added_by: str = "human") -> list[TrackedKeyword]:
    cfg = await get_integrations()
    async with session_scope() as s:
        site = await s.get(Site, site_id)
        if site is None:
            raise NotFound(f"site {site_id} not found")
        existing = {(k.keyword, k.country) for k in await s.scalars(
            select(TrackedKeyword).where(TrackedKeyword.site_id == site_id))}
        if len(existing) + len(items) > MAX_KEYWORDS:
            raise ServiceError(f"At most {MAX_KEYWORDS} tracked keywords per site.")
        created = []
        for item in items:
            kw = " ".join(str(item.get("keyword", "")).lower().split())[:300]
            country = (item.get("country") or cfg.serp_country or "us").lower()[:5]
            if not kw or (kw, country) in existing:
                continue
            existing.add((kw, country))
            row = TrackedKeyword(site_id=site_id, keyword=kw, country=country, target_url=item.get("target_url") or None,
                                 added_by=added_by)
            s.add(row)
            created.append(row)
        await s.flush()
        return created


async def delete_keyword(site_id: int, keyword_id: int) -> None:
    async with session_scope() as s:
        await s.execute(delete(TrackedKeyword).where(TrackedKeyword.id == keyword_id, TrackedKeyword.site_id == site_id))


async def list_keywords(site_id: int) -> list[dict[str, Any]]:
    async with session_scope() as s:
        keywords = list(await s.scalars(select(TrackedKeyword).where(TrackedKeyword.site_id == site_id)
                                        .order_by(TrackedKeyword.keyword)))
        snaps = list(await s.scalars(select(RankSnapshot).where(RankSnapshot.site_id == site_id,
                                                                RankSnapshot.captured_at >= now() - timedelta(days=90))
                                     .order_by(RankSnapshot.captured_at)))
    by_kw: dict[int, list[RankSnapshot]] = {}
    for snap in snaps:
        by_kw.setdefault(snap.keyword_id, []).append(snap)
    out = []
    for k in keywords:
        history = by_kw.get(k.id, [])
        latest = history[-1] if history else None
        prev = history[-2] if len(history) > 1 else None
        positions = [h.position for h in history if h.position is not None]
        change = (prev.position - latest.position) if latest and prev and latest.position and prev.position else None
        out.append({"id": k.id, "keyword": k.keyword, "country": k.country, "target_url": k.target_url,
                    "added_by": k.added_by, "created_at": k.created_at,
                    "position": latest.position if latest else None, "url": latest.url if latest else None,
                    "source": latest.source if latest else None, "checked_at": latest.captured_at if latest else None,
                    "change": round(change, 1) if change is not None else None,
                    "best": min(positions) if positions else None,
                    "competitors": latest.competitors[:5] if latest else [],
                    "trend": [{"at": h.captured_at, "position": h.position} for h in history[-30:]]})
    return out


async def history(site_id: int, keyword_id: int, days: int = 90) -> list[dict[str, Any]]:
    async with session_scope() as s:
        rows = list(await s.scalars(select(RankSnapshot).where(RankSnapshot.site_id == site_id,
                                                               RankSnapshot.keyword_id == keyword_id,
                                                               RankSnapshot.captured_at >= now() - timedelta(days=days))
                                    .order_by(RankSnapshot.captured_at)))
    return [{"at": r.captured_at, "position": r.position, "url": r.url, "source": r.source,
             "competitors": r.competitors} for r in rows]


async def has_keywords(site_id: int) -> bool:
    async with session_scope() as s:
        return bool(await s.scalar(select(func.count()).select_from(TrackedKeyword)
                                   .where(TrackedKeyword.site_id == site_id)))


async def check_rankings(site_id: int, report: JobReporter | None = None) -> dict[str, Any]:
    async with session_scope() as s:
        site = await s.get(Site, site_id)
        keywords = list(await s.scalars(select(TrackedKeyword).where(TrackedKeyword.site_id == site_id)))
    if site is None:
        raise NotFound(f"site {site_id} not found")
    if not keywords:
        return {"checked": 0}
    cfg = await get_integrations()
    domain = domain_of(site.url)
    snapshots: list[RankSnapshot] = []
    errors = 0
    if cfg.serp_configured:
        from . import credits

        # Live results cost money per query, so they are metered; Search Console below is free.
        await credits.ensure(site.account_id, minimum_mc=credits.price_rank_keywords(1))
        if await credits.is_metered(site.account_id):
            afford = await credits.balance(site.account_id) // max(1, credits.price_rank_keywords(1))
            if afford < len(keywords) and report:
                await report.warn(f"Credits cover {afford} of {len(keywords)} keywords today")
            keywords = keywords[:max(0, afford)]
        if report:
            await report(f"Checking {len(keywords)} keyword rankings via {cfg.serp_provider}")
        for k in keywords:
            try:
                page = await search(k.keyword, cfg, num=SERP_DEPTH, country=k.country, use_cache=False)
            except ResearchError as exc:
                errors += 1
                if report:
                    await report.warn(f"“{k.keyword}”: {exc}")
                continue
            hit = position_of(page, domain)
            snapshots.append(RankSnapshot(
                keyword_id=k.id, site_id=site_id, position=float(hit.position) if hit else None,
                url=hit.url if hit else None, source=cfg.serp_provider,
                competitors=[{"position": r.position, "domain": r.domain, "url": r.url, "title": r.title[:120]}
                             for r in page.results[:10]]))
        if snapshots and await credits.is_metered(site.account_id):
            await credits.charge(site.account_id, credits.price_rank_keywords(len(snapshots)), "rank_check",
                                 site_id=site_id, note=f"{len(snapshots)} keywords")
    else:
        gsc = gsc_for(site)
        if gsc is None:
            raise ServiceError("Rank tracking needs a search results provider (Workspace settings → Integrations) "
                               "or Search Console connected for this site.")
        if report:
            await report(f"Reading average positions for {len(keywords)} keywords from Search Console")
        rows = await gsc.performance(days=7, dimensions=("query", "page"), row_limit=25000)
        by_query: dict[str, list[dict]] = {}
        for r in rows:
            by_query.setdefault(r["query"].lower(), []).append(r)
        for k in keywords:
            matches = by_query.get(k.keyword, [])
            if not matches:
                snapshots.append(RankSnapshot(keyword_id=k.id, site_id=site_id, position=None, source="gsc"))
                continue
            imps = sum(m["impressions"] for m in matches) or 1
            pos = sum(m["position"] * m["impressions"] for m in matches) / imps
            best = max(matches, key=lambda m: m["impressions"])
            snapshots.append(RankSnapshot(keyword_id=k.id, site_id=site_id, position=round(pos, 1),
                                          url=best["page"], source="gsc"))
    async with session_scope() as s:
        s.add_all(snapshots)
    ranked = [x for x in snapshots if x.position is not None]
    return {"checked": len(snapshots), "ranked": len(ranked), "top10": sum(1 for x in ranked if x.position <= 10),
            "errors": errors}
