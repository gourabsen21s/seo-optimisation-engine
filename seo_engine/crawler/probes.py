"""Site-level probes: robots.txt, ads.txt, llms.txt, sitemaps, soft-404 and domain variants."""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from urllib.parse import urljoin, urlsplit

import advertools as adv
import httpx
import pandas as pd

from ..core.config import Settings
from ..core.models import CrawlResult, SitemapEntry

log = logging.getLogger(__name__)


async def _fetch(client: httpx.AsyncClient, url: str, **kw) -> httpx.Response | None:
    try:
        return await client.get(url, **kw)
    except httpx.HTTPError as exc:
        log.info("probe failed %s: %s", url, exc)
        return None


async def probe_site(result: CrawlResult, client: httpx.AsyncClient, settings: Settings) -> list[str]:
    base = result.base_url
    robots = await _fetch(client, urljoin(base, "/robots.txt"))
    sitemap_candidates = []
    if robots is not None:
        result.robots_status = robots.status_code
        if robots.status_code == 200 and "html" not in robots.headers.get("content-type", ""):
            result.robots_txt = robots.text[:100_000]
            sitemap_candidates += re.findall(r"(?im)^\s*sitemap:\s*(\S+)", result.robots_txt)

    ads = await _fetch(client, urljoin(base, "/ads.txt"))
    if ads is not None:
        result.ads_txt_status = ads.status_code
        result.ads_txt_content_type = ads.headers.get("content-type", "")
        if ads.status_code == 200:
            result.ads_txt = ads.text[:50_000]
    llms = await _fetch(client, urljoin(base, "/llms.txt"))
    result.llms_txt_status = llms.status_code if llms is not None else None

    probe = await _fetch(client, urljoin(base, f"/seo-engine-404-probe-{uuid.uuid4().hex[:10]}/"))
    result.not_found_probe_status = probe.status_code if probe is not None else None

    parts = urlsplit(base)
    bare = parts.netloc.removeprefix("www.")
    is_ip = re.fullmatch(r"[\d.:\[\]]+", bare) is not None or bare.startswith("localhost")
    variants = {f"http://{bare}/", f"https://{bare}/"}
    if not is_ip:
        variants |= {f"http://www.{bare}/", f"https://www.{bare}/"}
    for variant in variants:
        resp = await _fetch(client, variant, follow_redirects=True)
        result.variant_redirects[variant] = str(resp.url) if resp is not None and resp.status_code < 400 else None

    for path in ("/sitemap_index.xml", "/sitemap.xml", "/wp-sitemap.xml"):
        sitemap_candidates.append(urljoin(base, path))
    seen, entries = set(), []
    for sm in dict.fromkeys(sitemap_candidates):
        head = await _fetch(client, sm)
        if head is None or head.status_code != 200 or "<" not in head.text[:200]:
            continue
        result.sitemap_urls_found.append(sm)
        try:
            df = await asyncio.to_thread(adv.sitemap_to_df, sm, max_workers=4)
        except Exception as exc:  # advertools raises a variety of parser errors
            result.sitemap_errors.append(f"{sm}: {exc}")
            continue
        if "errors" in df.columns:
            result.sitemap_errors += [f"{sm}: {e}" for e in df["errors"].dropna().unique()[:5]]
        if "loc" in df.columns:
            for _, r in df.dropna(subset=["loc"]).iterrows():
                if r["loc"] not in seen:
                    seen.add(r["loc"])
                    lastmod = r.get("lastmod")
                    entries.append(SitemapEntry(url=r["loc"], lastmod=None if pd.isna(lastmod) else str(lastmod)))
        break  # the first working sitemap (usually the index) is authoritative
    result.sitemap_entries = entries
    return [e.url for e in entries]


async def check_external_links(result: CrawlResult, client: httpx.AsyncClient, limit: int) -> None:
    urls = sorted({l.url for p in result.html_pages() for l in p.links if not l.internal})[:limit]
    sem = asyncio.Semaphore(10)

    async def check(u: str):
        async with sem:
            try:
                r = await client.head(u, follow_redirects=True)
                if r.status_code in (405, 403):
                    r = await client.get(u, follow_redirects=True)
                result.external_link_status[u] = r.status_code
            except httpx.HTTPError:
                result.external_link_status[u] = 0

    await asyncio.gather(*(check(u) for u in urls))
