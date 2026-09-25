"""Text embeddings for the context engine: FastEmbed (local ONNX model, no API key) or an offline hash
embedder for tests and air-gapped development."""

from __future__ import annotations

import asyncio
import hashlib
import math
import re
from functools import lru_cache

from ..core.config import get_settings

HASH_DIMS = 384
_TOKEN = re.compile(r"[a-z0-9]+")


class Embedder:
    dims: int

    def embed_sync(self, texts: list[str]) -> list[list[float]]:
        raise NotImplementedError

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return await asyncio.to_thread(self.embed_sync, texts)


class FastEmbedder(Embedder):
    def __init__(self, model: str):
        from fastembed import TextEmbedding

        self._model = TextEmbedding(model)
        self.dims = len(next(iter(self._model.embed(["dimension probe"]))))

    def embed_sync(self, texts: list[str]) -> list[list[float]]:
        return [v.tolist() for v in self._model.embed(texts, batch_size=32)]


class HashEmbedder(Embedder):
    """Deterministic hashed bag-of-words + bigrams. Good enough for keyword-ish retrieval, zero downloads."""

    dims = HASH_DIMS

    def _one(self, text: str) -> list[float]:
        vec = [0.0] * self.dims
        tokens = _TOKEN.findall(text.lower())
        for tok in tokens + [f"{a}_{b}" for a, b in zip(tokens, tokens[1:], strict=False)]:
            h = int.from_bytes(hashlib.blake2b(tok.encode(), digest_size=8).digest(), "big")
            vec[h % self.dims] += 1.0 if (h >> 32) & 1 else -1.0
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed_sync(self, texts: list[str]) -> list[list[float]]:
        return [self._one(t) for t in texts]

    async def embed(self, texts: list[str]) -> list[list[float]]:
        return self.embed_sync(texts)


@lru_cache
def get_embedder() -> Embedder:
    settings = get_settings()
    if settings.embedder == "hash":
        return HashEmbedder()
    return FastEmbedder(settings.embed_model)
