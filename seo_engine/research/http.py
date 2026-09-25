"""Shared HTTP plumbing for research integrations: client factory, polite retries and a small TTL cache."""

from __future__ import annotations

import asyncio
import time
from collections import OrderedDict
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

import httpx

from ..core.config import get_settings

T = TypeVar("T")
_transport: httpx.AsyncBaseTransport | None = None
_limits: dict[str, asyncio.Semaphore] = {}
_cache: OrderedDict[str, tuple[float, Any]] = OrderedDict()
CACHE_MAX = 512


class ResearchError(RuntimeError):
    """An external research API failed or is not configured. The message is safe to show to an agent."""


def set_transport(transport: httpx.AsyncBaseTransport | None) -> None:
    """Route every research request through `transport` (tests use a stub; None restores the network)."""
    global _transport
    _transport = transport


def client(timeout: float | None = None, **kw: Any) -> httpx.AsyncClient:
    settings = get_settings()
    headers = {"User-Agent": settings.user_agent, **kw.pop("headers", {})}
    return httpx.AsyncClient(timeout=timeout or settings.request_timeout, follow_redirects=True, headers=headers,
                             transport=_transport, **kw)


def _limit(name: str, concurrency: int) -> asyncio.Semaphore:
    if name not in _limits:
        _limits[name] = asyncio.Semaphore(concurrency)
    return _limits[name]


async def request(method: str, url: str, *, service: str, concurrency: int = 4, retries: int = 2,
                  time_limit: float | None = None, **kw: Any) -> httpx.Response:
    """Rate-limited request with exponential backoff on 429/5xx and network errors."""
    delay = 1.0
    async with _limit(service, concurrency):
        for attempt in range(retries + 1):
            try:
                async with client(timeout=time_limit) as c:
                    resp = await c.request(method, url, **kw)
            except httpx.HTTPError as exc:
                if attempt == retries:
                    raise ResearchError(f"{service}: network error ({type(exc).__name__})") from exc
            else:
                if resp.status_code not in (429, 500, 502, 503, 504) or attempt == retries:
                    return resp
            await asyncio.sleep(delay)
            delay *= 2
    raise ResearchError(f"{service}: unavailable")  # pragma: no cover


async def cached(key: str, loader: Callable[[], Awaitable[T]], ttl: float | None = None) -> T:
    ttl = get_settings().research_cache_ttl_seconds if ttl is None else ttl
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < ttl:
        _cache.move_to_end(key)
        return hit[1]
    value = await loader()
    _cache[key] = (time.monotonic(), value)
    while len(_cache) > CACHE_MAX:
        _cache.popitem(last=False)
    return value


def clear_cache() -> None:
    _cache.clear()
