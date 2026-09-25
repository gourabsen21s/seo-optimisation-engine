"""Site knowledge index (the retrieval half of the context engine), stored in Qdrant.

Documents: page chunks, audit findings and Search Console query rows — each tagged with site_id and kind so
an employee's briefing can pull just the relevant slice ("what do we know about /yoga-sutras/?").
"""

from __future__ import annotations

import logging
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any

from qdrant_client import AsyncQdrantClient, models

from ..core.config import get_settings
from ..core.models import AuditReport, CrawlResult
from .embeddings import get_embedder

log = logging.getLogger(__name__)
COLLECTION = "site_knowledge"
CHUNK_CHARS = 1200
MAX_CHUNKS_PER_PAGE = 3


@lru_cache
def _client() -> AsyncQdrantClient:
    s = get_settings()
    if s.qdrant_url:
        return AsyncQdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key or None)
    path = Path(s.data_dir) / "qdrant-knowledge"
    path.mkdir(parents=True, exist_ok=True)
    return AsyncQdrantClient(path=str(path))


def _id(site_id: int, kind: str, key: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"{site_id}|{kind}|{key}"))


class KnowledgeIndex:
    def __init__(self, client: AsyncQdrantClient | None = None):
        self.client = client or _client()
        self.embedder = get_embedder()
        self._ready = False

    async def _ensure(self) -> None:
        if self._ready:
            return
        if not await self.client.collection_exists(COLLECTION):
            await self.client.create_collection(
                COLLECTION, vectors_config=models.VectorParams(size=self.embedder.dims, distance=models.Distance.COSINE))
            if get_settings().qdrant_url:  # payload indexes only matter on a Qdrant server
                for field, schema in (("site_id", models.PayloadSchemaType.INTEGER),
                                      ("kind", models.PayloadSchemaType.KEYWORD)):
                    await self.client.create_payload_index(COLLECTION, field, field_schema=schema)
        self._ready = True

    async def _replace(self, site_id: int, kind: str, docs: list[dict[str, Any]]) -> int:
        await self._ensure()
        await self.client.delete(COLLECTION, points_selector=models.FilterSelector(filter=_filter(site_id, [kind])))
        if not docs:
            return 0
        vectors = await self.embedder.embed([d["text"] for d in docs])
        points = [models.PointStruct(id=_id(site_id, kind, d["key"]), vector=v,
                                     payload={"site_id": site_id, "kind": kind, **{k: v2 for k, v2 in d.items() if k != "key"}})
                  for d, v in zip(docs, vectors, strict=True)]
        for i in range(0, len(points), 256):
            await self.client.upsert(COLLECTION, points=points[i:i + 256])
        return len(points)

    async def index_audit(self, site_id: int, crawl: CrawlResult, report: AuditReport) -> dict[str, int]:
        pages = []
        for p in crawl.html_pages():
            header = f"{p.title or ''} — {p.final_url} ({p.page_type}, {p.word_count} words)"
            text = p.text_excerpt
            for i in range(min(MAX_CHUNKS_PER_PAGE, max(1, -(-len(text) // CHUNK_CHARS)))):
                chunk = text[i * CHUNK_CHARS:(i + 1) * CHUNK_CHARS]
                pages.append({"key": f"{p.final_url}#{i}", "url": p.final_url, "title": p.title or "",
                              "text": f"{header}\n{chunk}"})
        findings = [{"key": f.code, "url": (f.urls or [""])[0], "title": f.title,
                     "text": f"[{f.severity}] {f.title}. {f.detail} Recommendation: {f.recommendation} "
                             f"Affects {len(f.urls)} URLs: {', '.join(f.urls[:8])}"} for f in report.findings]
        return {"pages": await self._replace(site_id, "page", pages),
                "findings": await self._replace(site_id, "finding", findings)}

    async def index_queries(self, site_id: int, rows: list[dict[str, Any]], limit: int = 800) -> int:
        top = sorted(rows, key=lambda r: -r.get("impressions", 0))[:limit]
        docs = [{"key": f"{r.get('page')}|{r.get('query')}", "url": r.get("page", ""), "title": r.get("query", ""),
                 "text": f"Search query '{r.get('query')}' → {r.get('page')}: position {r['position']:.1f}, "
                         f"{r['impressions']} impressions, {r['clicks']} clicks, CTR {r['ctr']:.1%}"} for r in top]
        return await self._replace(site_id, "query", docs)

    async def search(self, site_id: int, query: str, limit: int = 8,
                     kinds: list[str] | None = None) -> list[dict[str, Any]]:
        await self._ensure()
        [vector] = await self.embedder.embed([query])
        res = await self.client.query_points(COLLECTION, query=vector, limit=limit, with_payload=True,
                                             query_filter=_filter(site_id, kinds))
        return [{**(p.payload or {}), "score": round(p.score, 3)} for p in res.points]

    async def delete_site(self, site_id: int) -> None:
        await self._ensure()
        await self.client.delete(COLLECTION, points_selector=models.FilterSelector(filter=_filter(site_id, None)))


def _filter(site_id: int, kinds: list[str] | None) -> models.Filter:
    must: list[Any] = [models.FieldCondition(key="site_id", match=models.MatchValue(value=site_id))]
    if kinds:
        must.append(models.FieldCondition(key="kind", match=models.MatchAny(any=kinds)))
    return models.Filter(must=must)


@lru_cache
def get_index() -> KnowledgeIndex:
    return KnowledgeIndex()
