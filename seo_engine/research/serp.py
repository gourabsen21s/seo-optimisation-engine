"""Live search engine results pages (SERPs) through a pluggable provider.

- serper  — Google results via serper.dev (cheap, fast)
- serpapi — Google results via serpapi.com
- brave   — Brave Search API (independent index; a useful approximation when Google APIs are unavailable)

We never scrape Google directly: it violates Google's terms and breaks constantly.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from pydantic import BaseModel, Field

from .http import ResearchError, cached, request

if TYPE_CHECKING:
    from ..services.integrations import IntegrationsConfig

PROVIDERS = {"serper": "Google (serper.dev)", "serpapi": "Google (SerpAPI)", "brave": "Brave Search"}


class SerpResult(BaseModel):
    position: int
    title: str
    url: str
    domain: str
    snippet: str = ""


class SerpPage(BaseModel):
    query: str
    provider: str
    country: str
    results: list[SerpResult] = Field(default_factory=list)
    people_also_ask: list[str] = Field(default_factory=list)
    related_searches: list[str] = Field(default_factory=list)


def domain_of(url: str) -> str:
    return (urlsplit(url).hostname or "").lower().removeprefix("www.")


def _results(items: list[dict], url_key: str, snippet_key: str) -> list[SerpResult]:
    out = []
    for i, item in enumerate(items, 1):
        url = item.get(url_key) or ""
        if not url:
            continue
        out.append(SerpResult(position=int(item.get("position") or i), title=item.get("title") or "", url=url,
                              domain=domain_of(url), snippet=(item.get(snippet_key) or "")[:300]))
    return out


async def _serper(q: str, key: str, gl: str, hl: str, num: int) -> SerpPage:
    resp = await request("POST", "https://google.serper.dev/search", service="serper",
                         headers={"X-API-KEY": key, "Content-Type": "application/json"},
                         json={"q": q, "gl": gl, "hl": hl, "num": num})
    if resp.status_code in (401, 403):
        raise ResearchError("serper: API key rejected")
    if resp.status_code >= 400:
        raise ResearchError(f"serper: HTTP {resp.status_code}")
    d = resp.json()
    return SerpPage(query=q, provider="serper", country=gl, results=_results(d.get("organic", []), "link", "snippet"),
                    people_also_ask=[x.get("question", "") for x in d.get("peopleAlsoAsk", []) if x.get("question")],
                    related_searches=[x.get("query", "") for x in d.get("relatedSearches", []) if x.get("query")])


async def _serpapi(q: str, key: str, gl: str, hl: str, num: int) -> SerpPage:
    resp = await request("GET", "https://serpapi.com/search.json", service="serpapi",
                         params={"engine": "google", "q": q, "gl": gl, "hl": hl, "num": num, "api_key": key})
    if resp.status_code in (401, 403):
        raise ResearchError("serpapi: API key rejected")
    if resp.status_code >= 400:
        raise ResearchError(f"serpapi: HTTP {resp.status_code}")
    d = resp.json()
    if d.get("error") and not d.get("organic_results"):
        raise ResearchError(f"serpapi: {d['error'][:200]}")
    return SerpPage(query=q, provider="serpapi", country=gl,
                    results=_results(d.get("organic_results", []), "link", "snippet"),
                    people_also_ask=[x.get("question", "") for x in d.get("related_questions", []) if x.get("question")],
                    related_searches=[x.get("query", "") for x in d.get("related_searches", []) if x.get("query")])


async def _brave(q: str, key: str, gl: str, hl: str, num: int) -> SerpPage:
    resp = await request("GET", "https://api.search.brave.com/res/v1/web/search", service="brave",
                         headers={"X-Subscription-Token": key, "Accept": "application/json"},
                         params={"q": q, "country": gl.upper(), "search_lang": hl, "count": min(num, 20)})
    if resp.status_code in (401, 403, 422):
        raise ResearchError("brave: API key rejected")
    if resp.status_code >= 400:
        raise ResearchError(f"brave: HTTP {resp.status_code}")
    d = resp.json()
    return SerpPage(query=q, provider="brave", country=gl,
                    results=_results(d.get("web", {}).get("results", []), "url", "description"),
                    people_also_ask=[x.get("question", "") for x in d.get("faq", {}).get("results", [])
                                     if x.get("question")])


async def search(query: str, cfg: IntegrationsConfig, num: int = 10, country: str | None = None,
                 language: str | None = None, use_cache: bool = True) -> SerpPage:
    if not cfg.serp_configured:
        raise ResearchError("No search results provider is configured. Add a Serper, SerpAPI or Brave key in "
                            "Workspace settings → Integrations.")
    query = query.strip()[:300]
    if not query:
        raise ResearchError("empty query")
    gl, hl = (country or cfg.serp_country or "us").lower(), (language or cfg.serp_language or "en").lower()
    num = max(1, min(num, 100))
    fn = {"serper": _serper, "serpapi": _serpapi, "brave": _brave}[cfg.serp_provider]

    async def load() -> SerpPage:
        return await fn(query, cfg.serp_api_key, gl, hl, num)

    if not use_cache:
        return await load()
    return await cached(f"serp|{cfg.serp_provider}|{gl}|{hl}|{num}|{query.lower()}", load)


def position_of(page: SerpPage, domain: str) -> SerpResult | None:
    """The best-ranking result for a domain (subdomains count)."""
    domain = domain.lower().removeprefix("www.")
    for r in page.results:
        if r.domain == domain or r.domain.endswith("." + domain):
            return r
    return None
