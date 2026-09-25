"""Crawl orchestration: advertools crawl + probes → CrawlResult."""

from __future__ import annotations

import asyncio
import os
import re
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import advertools as adv
import httpx
import pandas as pd

from ..core.config import Settings, get_settings
from ..core.models import CrawlResult
from ..core.security import assert_public_url
from .parser import CSS_SELECTORS, XPATH_SELECTORS, normalize_start_url, row_to_page
from .probes import check_external_links, probe_site

TRUST_LINK = re.compile(r"privacy|terms|conditions|disclaimer|about|contact|editorial|standards|corrections|"
                        r"sitemap", re.I)
MAX_TRUST_FETCH = 20


def _run_advertools(start_url: str | list[str], extra_urls: list[str], settings: Settings, obey_robots: bool,
                    output: Path, follow_links: bool = True) -> None:
    # advertools shells out to the `scrapy` CLI, so make sure our interpreter's bin dir is on PATH.
    bin_dir = str(Path(sys.executable).parent)
    if bin_dir not in os.environ.get("PATH", "").split(os.pathsep):
        os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
    starts = start_url if isinstance(start_url, list) else [start_url]
    host = urlsplit(starts[0]).hostname or ""
    domains = sorted({host, host.removeprefix("www."), "www." + host.removeprefix("www.")})
    adv.crawl(
        [*starts, *extra_urls],
        str(output),
        follow_links=follow_links,
        allowed_domains=domains,
        exclude_url_params=["replytocom", "add-to-cart", "share", "utm_source", "utm_medium", "utm_campaign"],
        css_selectors=CSS_SELECTORS,
        xpath_selectors=XPATH_SELECTORS,
        custom_settings={
            "LOG_LEVEL": "ERROR",
            "USER_AGENT": settings.user_agent,
            "ROBOTSTXT_OBEY": obey_robots,
            "HTTPERROR_ALLOW_ALL": True,
            "CLOSESPIDER_PAGECOUNT": settings.max_pages,
            "CONCURRENT_REQUESTS_PER_DOMAIN": settings.crawl_concurrency,
            "DOWNLOAD_TIMEOUT": int(settings.request_timeout),
            "AUTOTHROTTLE_ENABLED": True,
            "DEPTH_LIMIT": 8,
        },
    )


async def crawl_site(start_url: str, settings: Settings | None = None, obey_robots: bool = True,
                     check_external: bool = True) -> CrawlResult:
    settings = settings or get_settings()
    start_url = normalize_start_url(start_url)
    await assert_public_url(start_url, settings.allow_private_networks)
    parts = urlsplit(start_url)
    base = f"{parts.scheme}://{parts.netloc}/"
    result = CrawlResult(start_url=start_url, base_url=base)

    async with httpx.AsyncClient(timeout=settings.request_timeout, headers={"User-Agent": settings.user_agent},
                                 follow_redirects=False) as client:
        sitemap_urls = await probe_site(result, client, settings)

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "crawl.jl"
            extra = [u for u in sitemap_urls if urlsplit(u).hostname == parts.hostname][: settings.max_pages]
            await asyncio.to_thread(_run_advertools, start_url, extra, settings, obey_robots, out)
            rows = pd.read_json(out, lines=True).to_dict("records") if out.exists() and out.stat().st_size else []
            if obey_robots and result.robots_txt:
                rp = RobotFileParser()
                rp.parse(result.robots_txt.splitlines())
                result.blocked_by_robots = [u for u in extra if not rp.can_fetch(settings.user_agent, u)][:200]

        for row in rows:
            page = row_to_page(row, base)
            result.pages[page.final_url] = page
        result.truncated = len(rows) >= settings.max_pages
        await _fetch_missing_trust_pages(result, settings, obey_robots)
        if check_external and settings.external_link_check_limit:
            await check_external_links(result, client, settings.external_link_check_limit)
    return result


async def _fetch_missing_trust_pages(result: CrawlResult, settings: Settings, obey_robots: bool) -> None:
    """Legal/trust pages decide several AdSense requirements, so never let the crawl limit hide them."""
    crawled = {p.final_url.rstrip("/") for p in result.pages.values()} | {p.url.rstrip("/") for p in result.pages.values()}
    wanted: list[str] = []
    for page in result.html_pages():
        for link in page.links:
            if (link.internal and link.url.rstrip("/") not in crawled and link.url not in wanted
                    and not link.url.endswith(".xml")
                    and (TRUST_LINK.search(urlsplit(link.url).path) or TRUST_LINK.search(link.text))):
                wanted.append(link.url)
    if not wanted:
        return
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "trust.jl"
        await asyncio.to_thread(_run_advertools, wanted[:MAX_TRUST_FETCH], [], settings, obey_robots, out, False)
        rows = pd.read_json(out, lines=True).to_dict("records") if out.exists() and out.stat().st_size else []
    for row in rows:
        page = row_to_page(row, result.base_url)
        result.pages.setdefault(page.final_url, page)
