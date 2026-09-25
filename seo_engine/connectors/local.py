"""Apply fixes to a static site on the local filesystem (e.g. a build output or a mounted volume)."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

from ..fixes.models import FixAction, FixResult
from ..generators.profile import SiteProfile
from .base import ConnectorError
from .static_site import MAX_FILE_BYTES, StaticSiteConnector, is_text_path


class LocalConnector(StaticSiteConnector):
    name = "local"

    def __init__(self, root: str, drafts_dir: str = "seo-drafts", profile: SiteProfile | None = None):
        super().__init__("", drafts_dir, profile)
        self.root = Path(root).expanduser().resolve()

    def _abs(self, path: str) -> Path:
        target = (self.root / path).resolve()
        if self.root not in target.parents and target != self.root:
            raise ConnectorError(f"path escapes site root: {path}")
        return target

    async def read(self, path: str) -> str | None:
        p = self._abs(path)
        return await asyncio.to_thread(p.read_text, encoding="utf-8") if p.is_file() else None

    async def list_files(self) -> list[str]:
        def walk() -> list[str]:
            out = []
            for p in self.root.rglob("*"):
                if p.is_file() and p.stat().st_size <= MAX_FILE_BYTES:
                    rel = p.relative_to(self.root).as_posix()
                    if is_text_path(rel):
                        out.append(rel)
                        if len(out) >= 20_000:
                            break
            return sorted(out)

        return await asyncio.to_thread(walk)

    async def test(self) -> dict[str, Any]:
        if not self.root.is_dir():
            raise ConnectorError(f"{self.root} is not a directory")
        return {"ok": True, "root": str(self.root), "html_files": sum(1 for _ in self.root.rglob("*.html"))}

    async def apply(self, fixes: list[FixAction], dry_run: bool = True) -> list[FixResult]:
        files, results = await self.plan_changes(fixes)
        if not dry_run:
            for path, (_, content) in files.items():
                target = self._abs(path)
                if content is None:
                    await asyncio.to_thread(target.unlink, missing_ok=True)
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                await asyncio.to_thread(target.write_text, content, encoding="utf-8")
        return results
