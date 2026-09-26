"""Domain authority via Open PageRank (free API key; based on Common Crawl link data)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from .http import ResearchError, cached, request

if TYPE_CHECKING:
    from ..services.integrations import IntegrationsConfig

OPR_URL = "https://openpagerank.com/api/v1.0/getPageRank"


async def domain_authority(domains: list[str], cfg: IntegrationsConfig) -> list[dict]:
    if not cfg.openpagerank_api_key:
        raise ResearchError("Domain authority needs an Open PageRank key (free at openpagerank.com) — add it in "
                            "Platform settings → Integrations.")
    clean = sorted({d.lower().strip().removeprefix("https://").removeprefix("http://").split("/")[0].removeprefix("www.")
                    for d in domains if d.strip()})[:100]
    if not clean:
        return []

    async def load() -> list[dict]:
        resp = await request("GET", OPR_URL, service="openpagerank", headers={"API-OPR": cfg.openpagerank_api_key},
                             params=[("domains[]", d) for d in clean])
        if resp.status_code in (401, 403):
            raise ResearchError("openpagerank: API key rejected")
        if resp.status_code >= 400:
            raise ResearchError(f"openpagerank: HTTP {resp.status_code}")
        rows = resp.json().get("response", [])
        return [{"domain": r.get("domain"), "page_rank": r.get("page_rank_decimal"), "global_rank": r.get("rank"),
                 "found": r.get("status_code") == 200} for r in rows]

    return await cached("opr|" + ",".join(clean), load, ttl=7 * 24 * 3600)
