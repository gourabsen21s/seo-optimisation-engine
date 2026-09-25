"""Technical SEO actions: live Core Web Vitals (PageSpeed Insights) and instant indexing (IndexNow)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ..audit.pagespeed import PSI_URL
from .http import ResearchError, request

if TYPE_CHECKING:
    from ..services.integrations import IntegrationsConfig

INDEXNOW_URL = "https://api.indexnow.org/indexnow"


async def pagespeed(url: str, cfg: IntegrationsConfig, strategy: str = "mobile") -> dict:
    """Lighthouse lab scores + CrUX field data. Works without a key at low volume; a key raises the quota."""
    from ..audit import pagespeed as psi

    params = [("url", url), ("strategy", strategy)]
    params += [("category", c) for c in ("performance", "accessibility", "best-practices", "seo")]
    if cfg.pagespeed_api_key:
        params.append(("key", cfg.pagespeed_api_key))
    resp = await request("GET", PSI_URL, service="pagespeed", concurrency=2, retries=1, time_limit=150, params=params)
    if resp.status_code == 429:
        raise ResearchError("PageSpeed quota exceeded — add a PageSpeed API key in Workspace settings → Integrations.")
    if resp.status_code >= 400:
        raise ResearchError(f"PageSpeed: HTTP {resp.status_code}: {resp.text[:200]}")

    class _Stub:  # reuse the audit's response parser without a second request
        async def get(self, *a, **kw):
            return resp

    return await psi.run_pagespeed(url, _Stub(), cfg.pagespeed_api_key, strategy)  # type: ignore[arg-type]


async def indexnow_submit(host: str, key: str, urls: list[str]) -> dict:
    if not key:
        raise ResearchError("IndexNow needs a key — set one in Workspace settings → Integrations.")
    urls = [u for u in urls if u.startswith(("http://", "https://"))][:10_000]
    if not urls:
        raise ResearchError("no valid URLs")
    resp = await request("POST", INDEXNOW_URL, service="indexnow", retries=1,
                         json={"host": host, "key": key, "keyLocation": f"https://{host}/{key}.txt", "urlList": urls})
    meaning = {200: "accepted", 202: "accepted (key validation pending)", 400: "bad request",
               403: "key not valid — /<key>.txt is not reachable on the site yet", 422: "URLs don't match the host",
               429: "too many requests"}
    return {"status": resp.status_code, "result": meaning.get(resp.status_code, "unexpected"), "submitted": len(urls)}
