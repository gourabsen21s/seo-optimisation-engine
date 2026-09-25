"""IndexNow: notify Bing, Yandex, Seznam and others the moment URLs change (Google does not use IndexNow)."""

from __future__ import annotations

import httpx

ENDPOINT = "https://api.indexnow.org/indexnow"


async def ping(host: str, key: str, urls: list[str], key_location: str | None = None) -> int:
    if not urls:
        return 0
    body = {"host": host, "key": key, "urlList": urls[:10_000]}
    if key_location:
        body["keyLocation"] = key_location
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(ENDPOINT, json=body)
    return resp.status_code
