"""Core Web Vitals via Google's PageSpeed Insights API (Lighthouse + CrUX field data)."""

from __future__ import annotations

import asyncio
import logging

import httpx

from ..core.config import Settings, get_settings

log = logging.getLogger(__name__)
PSI_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


async def run_pagespeed(url: str, client: httpx.AsyncClient, api_key: str, strategy: str = "mobile") -> dict:
    params = [("url", url), ("strategy", strategy), ("key", api_key)]
    params += [("category", c) for c in ("performance", "accessibility", "best-practices", "seo")]
    try:
        resp = await client.get(PSI_URL, params=params, timeout=120)
        resp.raise_for_status()
    except httpx.HTTPError as exc:
        return {"url": url, "strategy": strategy, "error": str(exc)}
    data = resp.json()
    lh = data.get("lighthouseResult", {})
    cats = lh.get("categories", {})
    audits = lh.get("audits", {})
    field = data.get("loadingExperience", {}).get("metrics", {})

    def score(name):
        s = cats.get(name, {}).get("score")
        return round(s * 100) if s is not None else None

    def num(audit):
        return audits.get(audit, {}).get("numericValue")

    inp = field.get("INTERACTION_TO_NEXT_PAINT", {}).get("percentile")
    opportunities = sorted(
        ({"id": k, "title": v.get("title"), "savings_ms": v.get("details", {}).get("overallSavingsMs", 0)}
         for k, v in audits.items() if v.get("details", {}).get("type") == "opportunity"
         and v.get("details", {}).get("overallSavingsMs", 0) > 100),
        key=lambda o: -o["savings_ms"],
    )[:8]
    return {
        "url": url,
        "strategy": strategy,
        "performance": score("performance"),
        "accessibility": score("accessibility"),
        "best_practices": score("best-practices"),
        "seo": score("seo"),
        "lcp_ms": field.get("LARGEST_CONTENTFUL_PAINT_MS", {}).get("percentile") or num("largest-contentful-paint"),
        "cls": (field.get("CUMULATIVE_LAYOUT_SHIFT_SCORE", {}).get("percentile", 0) / 100
                if field.get("CUMULATIVE_LAYOUT_SHIFT_SCORE") else num("cumulative-layout-shift")),
        "inp_ms": inp,
        "tbt_ms": num("total-blocking-time"),
        "field_data": bool(field),
        "opportunities": opportunities,
    }


async def pagespeed_sample(urls: list[str], settings: Settings | None = None) -> list[dict]:
    settings = settings or get_settings()
    if not settings.pagespeed_api_key or not urls:
        return []
    async with httpx.AsyncClient() as client:
        return list(await asyncio.gather(
            *(run_pagespeed(u, client, settings.pagespeed_api_key) for u in urls[: settings.pagespeed_sample])
        ))
