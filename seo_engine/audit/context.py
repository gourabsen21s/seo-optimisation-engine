"""Shared, lazily computed view over a crawl used by every check."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, datetime
from functools import cached_property
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

from ..core.models import CrawlResult, PageData
from .signatures import ADSENSE_CLIENT, TRUST_PATTERNS


class AuditContext:
    def __init__(self, crawl: CrawlResult, pagespeed: list[dict] | None = None):
        self.crawl = crawl
        self.pagespeed = pagespeed or []
        self.now = datetime.now(UTC)

    @cached_property
    def pages(self) -> list[PageData]:
        return self.crawl.html_pages()

    @cached_property
    def home(self) -> PageData | None:
        for p in self.crawl.pages.values():
            if p.page_type == "home" or p.final_url.rstrip("/") == self.crawl.base_url.rstrip("/"):
                return p
        return self.pages[0] if self.pages else None

    @cached_property
    def articles(self) -> list[PageData]:
        return [p for p in self.pages if p.page_type == "article"]

    @cached_property
    def inbound(self) -> dict[str, set[str]]:
        inbound: dict[str, set[str]] = defaultdict(set)
        for p in self.pages:
            for link in p.links:
                if link.internal:
                    inbound[norm_url(link.url)].add(p.final_url)
        return inbound

    @cached_property
    def trust_pages(self) -> dict[str, tuple[str | None, PageData | None]]:
        """Find legal/trust pages by URL path or anchor text across all internal links."""
        found: dict[str, tuple[str | None, PageData | None]] = {}
        candidates = [(l.url, l.text) for p in self.pages for l in p.links if l.internal]
        candidates += [(p.final_url, p.title or "") for p in self.pages]
        by_norm = {norm_url(p.final_url): p for p in self.crawl.pages.values()}
        for key, pattern in TRUST_PATTERNS.items():
            best = None
            for url, text in candidates:
                path = urlsplit(url).path
                if key == "html_sitemap" and path.endswith(".xml"):
                    continue
                if key == "about" and "about" not in path.lower() and not re.fullmatch(r"\s*about( us| me)?\s*", text, re.I):
                    continue
                if pattern.search(path) or pattern.search(text):
                    page = by_norm.get(norm_url(url))
                    if page is not None and page.status == 200:
                        best = (url, page)
                        break
                    best = best or (url, page)
            found[key] = best or (None, None)
        return found

    @cached_property
    def adsense_clients(self) -> set[str]:
        ids = set()
        for p in self.pages:
            for s in p.scripts + [p.inline_script_sample]:
                ids.update(ADSENSE_CLIENT.findall(s))
        return ids

    @cached_property
    def robots(self) -> RobotFileParser | None:
        if not self.crawl.robots_txt:
            return None
        rp = RobotFileParser()
        rp.parse(self.crawl.robots_txt.splitlines())
        return rp

    def site_text_sample(self, limit: int = 40) -> str:
        return " ".join(p.text_excerpt[:3000] for p in self.articles[:limit] or self.pages[:limit])


def norm_url(url: str) -> str:
    parts = urlsplit(url)
    host = (parts.hostname or "").removeprefix("www.")
    return f"{host}{parts.path.rstrip('/') or '/'}{'?' + parts.query if parts.query else ''}"
