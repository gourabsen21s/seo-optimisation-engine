"""Shared logic for file-based sites (local directory or Git repository)."""

from __future__ import annotations

import abc
import fnmatch
import posixpath
import re
from collections import defaultdict

from ..fixes.htmlpatch import PatchError, apply_fix, unified_diff
from ..fixes.models import FixAction, FixKind, FixResult
from ..generators.legal import standalone_html
from ..generators.profile import SiteProfile
from .base import PAGE_FIX_KINDS, Connector, url_to_file_candidates

TEXT_EXTS = {".html", ".htm", ".md", ".mdx", ".markdown", ".jsx", ".tsx", ".js", ".mjs", ".cjs", ".ts", ".astro",
             ".vue", ".svelte", ".njk", ".liquid", ".hbs", ".handlebars", ".ejs", ".erb", ".twig", ".php", ".json",
             ".yml", ".yaml", ".toml", ".xml", ".txt", ".css", ".scss", ".py", ".rb", ".go", ".html.erb"}
SKIP_DIRS = {"node_modules", ".git", "vendor", ".next", ".nuxt", ".svelte-kit", ".astro", ".cache", "coverage",
             "__pycache__", ".venv", "venv", ".turbo", ".vercel", ".netlify"}
MAX_FILE_BYTES = 400_000
PROTECTED = re.compile(r"(^|/)(\.git/|\.github/workflows/|\.env|.*\.(pem|key|p12|crt)$|package-lock\.json$|yarn\.lock$|"
                       r"pnpm-lock\.yaml$)", re.I)


def is_text_path(path: str) -> bool:
    parts = path.split("/")
    if any(p in SKIP_DIRS for p in parts[:-1]):
        return False
    name = parts[-1].lower()
    return any(name.endswith(ext) for ext in TEXT_EXTS) or name in ("dockerfile", "_redirects", "_headers", "robots.txt")


def check_editable(path: str) -> str:
    path = posixpath.normpath(path.strip().lstrip("/"))
    if path.startswith("..") or not path or path == ".":
        raise PatchError("invalid path")
    if PROTECTED.search(path):
        raise PatchError(f"{path} is protected (CI workflows, secrets and lock files are never edited)")
    return path


class StaticSiteConnector(Connector, abc.ABC):
    """File-based sites. Besides page patches it exposes the repository (list/search/read) so agents can edit
    framework sources — JSX components, templates, markdown front matter — through `code_change` fixes."""

    supported = PAGE_FIX_KINDS | {FixKind.WRITE_FILE, FixKind.CREATE_PAGE, FixKind.CODE_CHANGE}
    repository = True

    def __init__(self, site_dir: str = "", drafts_dir: str = "seo-drafts", profile: SiteProfile | None = None):
        self.site_dir = site_dir.strip("/")
        self.drafts_dir = drafts_dir.strip("/")
        self.profile = profile or SiteProfile()

    @abc.abstractmethod
    async def read(self, path: str) -> str | None: ...

    @abc.abstractmethod
    async def list_files(self) -> list[str]:
        """All text-like files in the repository (relative paths, excluding vendor/build folders)."""

    async def search_files(self, query: str, glob: str = "", limit: int = 30, regex: bool = False) -> list[dict]:
        """Grep across the repository. Returns [{path, line, text}] (first `limit` matches)."""
        try:
            pattern = re.compile(query if regex else re.escape(query), re.I)
        except re.error as exc:
            raise PatchError(f"invalid regex: {exc}") from exc
        out: list[dict] = []
        for path in await self.list_files():
            if glob and not fnmatch.fnmatch(path, glob) and not fnmatch.fnmatch(path.rsplit("/", 1)[-1], glob):
                continue
            content = await self.read(path)
            if not content:
                continue
            for i, line in enumerate(content.splitlines(), 1):
                if pattern.search(line):
                    out.append({"path": path, "line": i, "text": line.strip()[:240]})
                    if len(out) >= limit:
                        return out
        return out

    async def detect_framework(self) -> dict:
        files = await self.list_files()
        names = set(files)
        info: dict = {"files": len(files), "framework": "static html"}
        pkg = await self.read("package.json") if "package.json" in names else None
        if pkg:
            deps = pkg.lower()
            for key, label in (("\"next\"", "Next.js"), ("\"astro\"", "Astro"), ("\"gatsby\"", "Gatsby"),
                               ("\"nuxt\"", "Nuxt"), ("@sveltejs/kit", "SvelteKit"), ("\"@remix-run", "Remix"),
                               ("\"vitepress\"", "VitePress"), ("@docusaurus", "Docusaurus"), ("\"@11ty", "Eleventy"),
                               ("\"vite\"", "Vite SPA"), ("\"react-scripts\"", "Create React App")):
                if key in deps:
                    info["framework"] = label
                    break
        elif any(n in names for n in ("hugo.toml", "hugo.yaml", "config.toml")) and any(f.startswith("content/") for f in files):
            info["framework"] = "Hugo"
        elif "_config.yml" in names:
            info["framework"] = "Jekyll"
        top = sorted({f.split("/", 1)[0] + ("/" if "/" in f else "") for f in files})
        info["top_level"] = top[:60]
        return info

    async def plan_changes(self, fixes: list[FixAction]) -> tuple[dict[str, tuple[str | None, str | None]], list[FixResult]]:
        """Compute new file contents. Returns ({path: (before, after)}, results); after=None deletes the file."""
        results: list[FixResult] = []
        files: dict[str, tuple[str | None, str | None]] = {}
        by_file: dict[str, list[FixAction]] = defaultdict(list)
        code_changes: list[FixAction] = []

        for fix in fixes:
            if fix.kind in PAGE_FIX_KINDS:
                if not fix.target_url:
                    results.append(FixResult(fix_id=fix.id, ok=False, message="fix has no target URL"))
                    continue
                for candidate in url_to_file_candidates(fix.target_url, self.site_dir):
                    if candidate in by_file or await self.read(candidate) is not None:
                        by_file[candidate].append(fix)
                        break
                else:
                    results.append(FixResult(fix_id=fix.id, ok=False,
                                             message=f"no source file found for {fix.target_url}"))
            elif fix.kind == FixKind.WRITE_FILE:
                path = posixpath.join(self.site_dir, fix.payload["path"].lstrip("/")) if self.site_dir else fix.payload["path"].lstrip("/")
                before = await self.read(path)
                files[path] = (before, fix.payload["content"])
                results.append(FixResult(fix_id=fix.id, ok=True, message=f"write {path}",
                                         diff=unified_diff(before or "", fix.payload["content"], path)))
            elif fix.kind == FixKind.CODE_CHANGE:
                code_changes.append(fix)
            elif fix.kind == FixKind.CREATE_PAGE:
                path = posixpath.join(self.drafts_dir, f"{fix.payload['slug']}.html")
                content = standalone_html(fix.payload["title"], fix.payload["html"], self.profile)
                files[path] = (await self.read(path), content)
                results.append(FixResult(fix_id=fix.id, ok=True, message=f"draft created at {path} (noindex)",
                                         diff=unified_diff("", content, path)))
            else:
                results.append(self.unsupported(fix))

        for path, page_fixes in by_file.items():
            before = await self.read(path) or ""
            html = before
            for fix in page_fixes:
                try:
                    html = apply_fix(html, fix)
                    results.append(FixResult(fix_id=fix.id, ok=True, message=f"patched {path}"))
                except (PatchError, KeyError) as exc:
                    results.append(FixResult(fix_id=fix.id, ok=False, message=f"{path}: {exc}"))
            if html != before:
                files[path] = (before, html)
                diff = unified_diff(before, html, path)
                for r in results:
                    if r.ok and r.message == f"patched {path}":
                        r.diff = diff
        for fix in code_changes:
            planned: dict[str, tuple[str | None, str | None]] = {}
            try:
                for item in fix.payload["files"]:
                    path = check_editable(item["path"])
                    current = files[path][1] if path in files else await self.read(path)
                    if current != item.get("before"):
                        raise PatchError(f"{path} changed since the edit was prepared — ask the engineer to redo it")
                    planned[path] = (files[path][0] if path in files else current, item.get("after"))
            except (PatchError, KeyError) as exc:
                results.append(FixResult(fix_id=fix.id, ok=False, message=str(exc)))
                continue
            files.update(planned)
            results.append(FixResult(fix_id=fix.id, ok=True, message=f"changed {len(planned)} file(s)",
                                     diff=fix.payload.get("diff")))
        order = {f.id: i for i, f in enumerate(fixes)}
        results.sort(key=lambda r: order.get(r.fix_id, len(order)))
        return files, results
