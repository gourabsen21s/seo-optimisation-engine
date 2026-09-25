"""Connector interface: how fixes reach a live website."""

from __future__ import annotations

import abc
import posixpath
from typing import Any, ClassVar
from urllib.parse import urlsplit

from ..fixes.models import FixAction, FixKind, FixResult


class ConnectorError(RuntimeError):
    pass


class Connector(abc.ABC):
    name: ClassVar[str]
    supported: ClassVar[set[FixKind]]

    @abc.abstractmethod
    async def test(self) -> dict[str, Any]:
        """Verify credentials/access. Returns details; raises ConnectorError on failure."""

    @abc.abstractmethod
    async def apply(self, fixes: list[FixAction], dry_run: bool = True) -> list[FixResult]:
        """Apply fixes (or preview them when dry_run). Never raises for a single fix — reports it instead."""

    def unsupported(self, fix: FixAction) -> FixResult:
        instructions = fix.payload.get("instructions") or f"{fix.kind} cannot be applied through {self.name}."
        return FixResult(fix_id=fix.id, ok=False, manual=True, message=instructions)


def url_to_file_candidates(url: str, site_dir: str = "") -> list[str]:
    """Map a URL path to likely source files in a static site: /a/b/ → a/b/index.html, /a/b → a/b.html, ..."""
    path = urlsplit(url).path or "/"
    base = site_dir.strip("/")
    join = (lambda p: posixpath.join(base, p)) if base else (lambda p: p)
    if path.endswith("/"):
        return [join(posixpath.join(path.lstrip("/"), "index.html"))]
    stem = path.lstrip("/")
    if stem.endswith((".html", ".htm")):
        return [join(stem)]
    return [join(stem + ".html"), join(posixpath.join(stem, "index.html")), join(stem)]


PAGE_FIX_KINDS = {FixKind.SET_TITLE, FixKind.SET_META_DESCRIPTION, FixKind.SET_CANONICAL, FixKind.SET_LANG,
                  FixKind.ADD_VIEWPORT, FixKind.SET_IMAGE_ALT, FixKind.ADD_JSON_LD, FixKind.SET_OPEN_GRAPH,
                  FixKind.ADD_INTERNAL_LINK, FixKind.REMOVE_INTERNAL_LINK}
