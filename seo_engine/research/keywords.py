"""Keyword ideas from Google Autocomplete (free, no key) — real queries people type, expanded with question and
modifier prefixes. Autocomplete has no search volumes; pair it with Search Console impressions where available."""

from __future__ import annotations

import asyncio
import json

from .http import ResearchError, cached, request

SUGGEST_URL = "https://suggestqueries.google.com/complete/search"
QUESTIONS = ("how", "what", "why", "when", "where", "which", "who", "can", "is", "does")
MODIFIERS = ("best", "vs", "for", "without", "near me", "free", "cheap", "ideas", "examples", "guide")


async def suggest(query: str, country: str = "us", language: str = "en") -> list[str]:
    query = query.strip()[:200]
    if not query:
        return []

    async def load() -> list[str]:
        resp = await request("GET", SUGGEST_URL, service="autocomplete", concurrency=4, retries=1,
                             params={"client": "firefox", "q": query, "hl": language, "gl": country})
        if resp.status_code >= 400:
            raise ResearchError(f"autocomplete: HTTP {resp.status_code}")
        try:
            data = json.loads(resp.content.decode("utf-8", "replace"))
        except ValueError as exc:
            raise ResearchError("autocomplete: unexpected response") from exc
        return [s for s in (data[1] if len(data) > 1 else []) if isinstance(s, str)]

    return await cached(f"suggest|{country}|{language}|{query.lower()}", load, ttl=24 * 3600)


async def keyword_ideas(seed: str, *, questions: bool = True, modifiers: bool = True, alphabet: bool = False,
                        country: str = "us", language: str = "en", limit: int = 80) -> list[dict[str, str]]:
    """Expand a seed keyword into real autocomplete queries, tagged by how they were found."""
    probes: list[tuple[str, str]] = [(seed, "seed")]
    if questions:
        probes += [(f"{q} {seed}", "question") for q in QUESTIONS]
    if modifiers:
        probes += [(f"{seed} {m}", "modifier") for m in MODIFIERS]
    if alphabet:
        probes += [(f"{seed} {c}", "alphabet") for c in "abcdefghijklmnopqrstuvwxyz"]
    results = await asyncio.gather(*(suggest(q, country, language) for q, _ in probes), return_exceptions=True)
    if all(isinstance(r, Exception) for r in results):
        raise ResearchError(str(results[0]))
    seen: dict[str, str] = {}
    for (_, source), res in zip(probes, results, strict=True):
        if isinstance(res, Exception):
            continue
        for s in res:
            key = s.lower().strip()
            if key and key not in seen:
                seen[key] = "question" if key.split(" ", 1)[0] in QUESTIONS else source
    return [{"keyword": k, "type": t} for k, t in list(seen.items())[:limit]]
