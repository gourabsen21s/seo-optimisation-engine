"""Long-term memory for the AI workforce, built on Mem0.

Scopes (Mem0 user_id / agent_id):
  user_id  = "site:<id>"            one memory space per website
  agent_id = "<employee id>"        what that employee learned doing its job
  agent_id = "team"                 shared facts: brand voice, decisions, what worked / what failed

Employees report their own lessons as structured output, so memories are written without Mem0's LLM
extraction step (`infer=False`) — no extra LLM calls and no provider incompatibilities. Near-duplicates are
skipped by semantic similarity.
"""

from __future__ import annotations

import asyncio
import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..core.config import get_settings
from .embeddings import Embedder, get_embedder

os.environ.setdefault("MEM0_TELEMETRY", "False")
log = logging.getLogger(__name__)
TEAM = "team"
DUPLICATE_SCORE = 0.9


def _norm(text: str) -> str:
    return " ".join(text.lower().split()).rstrip(".")


def _scope(site_id: int) -> str:
    return f"site:{site_id}"


class _Mem0Embedder:
    """Adapter so Mem0 uses the engine's embedder (one shared FastEmbed model; offline hash embedder in tests)."""

    def __init__(self, embedder: Embedder):
        self._e = embedder

    def embed(self, text, memory_action=None):
        return self._e.embed_sync([text if isinstance(text, str) else str(text)])[0]

    def embed_batch(self, texts, memory_action=None):
        return self._e.embed_sync([str(t) for t in texts])


def _mem0_config(dims: int) -> dict[str, Any]:
    s = get_settings()
    data = Path(s.data_dir)
    data.mkdir(parents=True, exist_ok=True)
    # Mem0 requires a supported provider name here; the model is replaced by _Mem0Embedder right after init.
    embedder = {"provider": "openai", "config": {"api_key": "unused", "embedding_dims": dims}}
    vs: dict[str, Any] = {"collection_name": "agent_memories", "embedding_model_dims": dims}
    if s.qdrant_url:
        vs.update(url=s.qdrant_url, api_key=s.qdrant_api_key or None)
    else:
        vs.update(path=str(data / "qdrant-memory"), on_disk=True)
    return {
        "vector_store": {"provider": "qdrant", "config": vs},
        "embedder": embedder,
        # Required by Mem0's config schema; never called because every write uses infer=False.
        "llm": {"provider": "openai", "config": {"model": "unused", "api_key": "unused"}},
        "history_db_path": str(data / f"mem0-history-{os.getpid()}.db"),
    }


class TeamMemory:
    def __init__(self):
        from mem0 import AsyncMemory

        embedder = get_embedder()
        self._mem = AsyncMemory.from_config(_mem0_config(embedder.dims))
        self._mem.embedding_model = _Mem0Embedder(embedder)
        self._lock = asyncio.Lock()

    async def remember(self, site_id: int, text: str, employee: str = TEAM, kind: str = "learning",
                       metadata: dict[str, Any] | None = None) -> str | None:
        text = text.strip()
        if not text:
            return None
        async with self._lock:
            similar = await self._mem.search(text, filters={"user_id": _scope(site_id), "agent_id": employee}, top_k=3)
            for hit in similar.get("results", []):
                # Mem0 blends semantic + BM25 scores, so also compare normalised text for exact repeats.
                if _norm(hit.get("memory", "")) == _norm(text) or hit.get("score", 0) >= DUPLICATE_SCORE:
                    return hit["id"]
            res = await self._mem.add(text, user_id=_scope(site_id), agent_id=employee, infer=False,
                                      metadata={"kind": kind, **(metadata or {})})
        results = res.get("results", [])
        return results[0]["id"] if results else None

    async def recall(self, site_id: int, query: str, employee: str | None = None, limit: int = 8) -> list[dict[str, Any]]:
        filters: dict[str, Any] = {"user_id": _scope(site_id)}
        if employee:
            filters["agent_id"] = employee
        res = await self._mem.search(query, filters=filters, top_k=limit)
        return [_clean(m) for m in res.get("results", [])]

    async def list(self, site_id: int, employee: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        filters: dict[str, Any] = {"user_id": _scope(site_id)}
        if employee:
            filters["agent_id"] = employee
        res = await self._mem.get_all(filters=filters, top_k=limit)
        return sorted((_clean(m) for m in res.get("results", [])), key=lambda m: m.get("created_at") or "",
                      reverse=True)

    async def forget(self, memory_id: str) -> None:
        await self._mem.delete(memory_id)

    async def forget_site(self, site_id: int) -> None:
        for m in await self.list(site_id, limit=5000):
            await self._mem.delete(m["id"])


def _clean(m: dict[str, Any]) -> dict[str, Any]:
    return {"id": m.get("id"), "text": m.get("memory"), "employee": m.get("agent_id"),
            "kind": (m.get("metadata") or {}).get("kind", "learning"), "metadata": m.get("metadata") or {},
            "score": round(m["score"], 3) if m.get("score") is not None else None,
            "created_at": m.get("created_at"), "updated_at": m.get("updated_at")}


class NullMemory:
    """Used when memory is disabled; every call is a no-op."""

    async def remember(self, *a, **k):
        return None

    async def recall(self, *a, **k):
        return []

    async def list(self, *a, **k):
        return []

    async def forget(self, *a, **k):
        return None

    async def forget_site(self, *a, **k):
        return None


@lru_cache
def get_memory() -> TeamMemory | NullMemory:
    if not get_settings().memory_enabled:
        return NullMemory()
    try:
        return TeamMemory()
    except Exception:
        log.exception("memory backend unavailable — continuing without long-term memory")
        return NullMemory()
