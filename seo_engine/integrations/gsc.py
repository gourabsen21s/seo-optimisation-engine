"""Google Search Console: ranking data, URL inspection (index status) and sitemap submission.

Auth uses a Google Cloud service account. Add the service account's email as a user (Full) on the Search
Console property, then paste the JSON key into the site's integration settings.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import date, timedelta
from typing import Any
from urllib.parse import quote

import httpx
from google.auth.transport.requests import Request
from google.oauth2 import service_account
from pydantic import BaseModel

log = logging.getLogger(__name__)
SCOPES = ["https://www.googleapis.com/auth/webmasters"]
API = "https://searchconsole.googleapis.com"


class GSCConfig(BaseModel):
    property_url: str  # "sc-domain:example.com" or "https://example.com/"
    service_account_json: str


class GSCError(RuntimeError):
    pass


class SearchConsole:
    def __init__(self, cfg: GSCConfig):
        self.cfg = cfg
        try:
            info = json.loads(cfg.service_account_json)
        except json.JSONDecodeError as exc:
            raise GSCError("service_account_json is not valid JSON") from exc
        self._creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)

    async def _token(self) -> str:
        if not self._creds.valid:
            await asyncio.to_thread(self._creds.refresh, Request())
        return self._creds.token

    async def _call(self, method: str, url: str, **kw) -> dict[str, Any]:
        headers = {"Authorization": f"Bearer {await self._token()}"}
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.request(method, url, headers=headers, **kw)
        if resp.status_code >= 400:
            raise GSCError(f"Search Console API {resp.status_code}: {resp.text[:300]}")
        return resp.json() if resp.content else {}

    @property
    def _site(self) -> str:
        return quote(self.cfg.property_url, safe="")

    async def test(self) -> dict[str, Any]:
        data = await self._call("GET", f"{API}/webmasters/v3/sites/{self._site}")
        return {"ok": True, "permission": data.get("permissionLevel")}

    async def performance(self, days: int = 28, dimensions: tuple[str, ...] = ("page", "query"),
                          row_limit: int = 5000, end_offset_days: int = 3) -> list[dict[str, Any]]:
        """Clicks, impressions, CTR and average position. Data lags ~2–3 days."""
        end = date.today() - timedelta(days=end_offset_days)
        start = end - timedelta(days=days - 1)
        body = {"startDate": start.isoformat(), "endDate": end.isoformat(), "dimensions": list(dimensions),
                "rowLimit": row_limit, "dataState": "final"}
        data = await self._call("POST", f"{API}/webmasters/v3/sites/{self._site}/searchAnalytics/query", json=body)
        rows = []
        for r in data.get("rows", []):
            row = dict(zip(dimensions, r["keys"], strict=True))
            row.update(clicks=r["clicks"], impressions=r["impressions"], ctr=r["ctr"], position=r["position"])
            rows.append(row)
        return rows

    async def page_metrics(self, days: int = 28, end_offset_days: int = 3) -> dict[str, dict[str, float]]:
        rows = await self.performance(days, ("page",), end_offset_days=end_offset_days)
        return {r["page"]: {k: r[k] for k in ("clicks", "impressions", "ctr", "position")} for r in rows}

    async def inspect(self, url: str) -> dict[str, Any]:
        body = {"inspectionUrl": url, "siteUrl": self.cfg.property_url}
        data = await self._call("POST", f"{API}/v1/urlInspection/index:inspect", json=body)
        res = data.get("inspectionResult", {}).get("indexStatusResult", {})
        return {"url": url, "verdict": res.get("verdict"), "coverage": res.get("coverageState"),
                "last_crawl": res.get("lastCrawlTime"), "google_canonical": res.get("googleCanonical"),
                "robots": res.get("robotsTxtState"), "indexing": res.get("indexingState")}

    async def submit_sitemap(self, sitemap_url: str) -> None:
        await self._call("PUT", f"{API}/webmasters/v3/sites/{self._site}/sitemaps/{quote(sitemap_url, safe='')}")


def striking_distance(rows: list[dict[str, Any]], min_impressions: int = 30) -> list[dict[str, Any]]:
    """Queries ranking 4–20 with real demand — the cheapest ranking gains available."""
    picks = [r for r in rows if 4 <= r["position"] <= 20 and r["impressions"] >= min_impressions]
    return sorted(picks, key=lambda r: -r["impressions"] * (21 - r["position"]))


def low_ctr(rows: list[dict[str, Any]], min_impressions: int = 100) -> list[dict[str, Any]]:
    """Pages in the top 5 whose CTR lags the typical curve — snippet (title/description) problems."""
    expected = {1: 0.25, 2: 0.13, 3: 0.09, 4: 0.06, 5: 0.045}
    out = []
    for r in rows:
        pos = round(r["position"])
        if pos in expected and r["impressions"] >= min_impressions and r["ctr"] < expected[pos] * 0.6:
            out.append({**r, "expected_ctr": expected[pos]})
    return sorted(out, key=lambda r: -r["impressions"])
