"""Read-only code navigation for the Web Engineer: find files, grep (ripgrep when installed), read with line
numbers, tree-sitter outlines of large files, framework detection and URL → source-file mapping."""

from __future__ import annotations

import asyncio
import fnmatch
import json
import re
import shutil
from pathlib import Path
from urllib.parse import urlsplit

from ..connectors.static_site import SKIP_DIRS, is_text_path
from .workspace import Workspace, WorkspaceError

READ_LIMIT = 400
LINE_CHARS = 2000
LANG_BY_EXT = {".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript", ".ts": "typescript",
               ".tsx": "tsx", ".html": "html", ".htm": "html", ".css": "css", ".scss": "scss", ".json": "json",
               ".yml": "yaml", ".yaml": "yaml", ".toml": "toml", ".md": "markdown", ".mdx": "markdown",
               ".astro": "astro", ".vue": "vue", ".svelte": "svelte", ".php": "php", ".py": "python", ".rb": "ruby",
               ".go": "go", ".liquid": "liquid", ".twig": "twig"}
SYMBOL_NODES = {"function_declaration", "class_declaration", "method_definition", "function_definition",
                "class_definition", "interface_declaration", "type_alias_declaration", "enum_declaration",
                "export_statement", "lexical_declaration", "variable_declaration", "method_declaration",
                "function_item", "section", "atx_heading", "element", "script_element", "style_element",
                "frontmatter", "component"}


def all_files(ws: Workspace) -> list[str]:
    out = []
    for p in ws.path.rglob("*"):
        rel = p.relative_to(ws.path).as_posix()
        if p.is_file() and not rel.startswith((".git/", ".rankcrew/", ".aider")) and not any(
                part in SKIP_DIRS for part in rel.split("/")[:-1]):
            out.append(rel)
    return sorted(out)


def find_files(ws: Workspace, pattern: str, limit: int = 200) -> list[str]:
    pattern = pattern.strip() or "*"
    files = all_files(ws)
    hits = [f for f in files if fnmatch.fnmatch(f, pattern) or fnmatch.fnmatch(f.rsplit("/", 1)[-1], pattern)]
    return hits[:limit]


async def grep(ws: Workspace, pattern: str, glob: str = "", regex: bool = True, ignore_case: bool = True,
               limit: int = 60) -> list[dict]:
    if shutil.which("rg"):
        args = ["rg", "--json", "--max-count", "20", "--max-columns", "300", "-g", "!.git", "-g", "!.rankcrew",
                "-g", "!.aider*"]
        if ignore_case:
            args.append("-i")
        if not regex:
            args.append("-F")
        if glob:
            args += ["-g", glob]
        args += ["--", pattern, "."]
        proc = await asyncio.create_subprocess_exec(*args, cwd=str(ws.path), stdout=asyncio.subprocess.PIPE,
                                                    stderr=asyncio.subprocess.PIPE)
        out, err = await asyncio.wait_for(proc.communicate(), 60)
        if proc.returncode not in (0, 1):
            raise WorkspaceError(f"search failed: {err.decode(errors='replace')[:200]}")
        hits = []
        for line in out.splitlines():
            ev = json.loads(line)
            if ev.get("type") == "match":
                d = ev["data"]
                hits.append({"path": d["path"]["text"].removeprefix("./"), "line": d["line_number"],
                             "text": d["lines"].get("text", "").rstrip()[:300]})
                if len(hits) >= limit:
                    break
        return hits
    try:
        rx = re.compile(pattern if regex else re.escape(pattern), re.I if ignore_case else 0)
    except re.error as exc:
        raise WorkspaceError(f"invalid regex: {exc}") from exc
    hits = []
    for rel in all_files(ws):
        if glob and not (fnmatch.fnmatch(rel, glob) or fnmatch.fnmatch(rel.rsplit("/", 1)[-1], glob)):
            continue
        if not is_text_path(rel):
            continue
        try:
            text = (ws.path / rel).read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for i, line in enumerate(text.splitlines(), 1):
            if rx.search(line):
                hits.append({"path": rel, "line": i, "text": line.strip()[:300]})
                if len(hits) >= limit:
                    return hits
    return hits


def read_numbered(ws: Workspace, rel: str, offset: int = 1, limit: int = READ_LIMIT) -> dict:
    text = ws.read_text(rel)
    lines = text.splitlines()
    start = max(1, offset)
    chunk = lines[start - 1:start - 1 + max(1, min(limit, 2000))]
    body = "\n".join(f"{start + i:>6}\t{ln[:LINE_CHARS]}" for i, ln in enumerate(chunk))
    return {"path": rel, "total_lines": len(lines), "from": start, "to": start + len(chunk) - 1, "content": body,
            "truncated": start - 1 + len(chunk) < len(lines)}


def _parser(rel: str):
    lang = LANG_BY_EXT.get(Path(rel).suffix.lower())
    if not lang:
        return None
    try:
        from tree_sitter_language_pack import get_parser

        return get_parser(lang)
    except Exception:
        return None


def outline(ws: Workspace, rel: str, max_items: int = 150) -> dict:
    """Symbols of a file (functions, components, classes, exports, headings, elements) with line ranges."""
    text = ws.read_text(rel)
    parser = _parser(rel)
    if parser is None:
        return {"path": rel, "lines": len(text.splitlines()), "symbols": [], "note": "no parser for this file type"}
    src = text.encode("utf-8")
    tree = parser.parse(src)
    items: list[dict] = []

    def name_of(node) -> str:
        for field in ("name", "declarator", "tag_name"):
            child = node.child_by_field_name(field)
            if child is not None:
                return src[child.start_byte:child.end_byte].decode("utf-8", "replace").split("\n")[0][:80]
        first = src[node.start_byte:min(node.end_byte, node.start_byte + 90)].decode("utf-8", "replace")
        return first.split("\n")[0].strip()

    def walk(node, depth: int) -> None:
        for child in node.children:
            if len(items) >= max_items:
                return
            if child.type in SYMBOL_NODES:
                items.append({"type": child.type, "name": name_of(child), "lines": [child.start_point[0] + 1,
                                                                                      child.end_point[0] + 1],
                              "depth": depth})
                if depth < 2:
                    walk(child, depth + 1)
            elif depth < 3:
                walk(child, depth)

    walk(tree.root_node, 0)
    return {"path": rel, "lines": len(text.splitlines()), "symbols": items, "syntax_ok": not tree.root_node.has_error}


def syntax_errors(ws: Workspace, rel: str) -> list[int]:
    """Lines with tree-sitter ERROR/MISSING nodes (empty list = parses cleanly or unknown language)."""
    p = ws.path / rel
    if not p.is_file():
        return []
    parser = _parser(rel)
    if parser is None:
        return []
    if rel.endswith(".json"):
        try:
            json.loads(p.read_text(encoding="utf-8"))
            return []
        except ValueError as exc:
            return [getattr(exc, "lineno", 1)]
    tree = parser.parse(p.read_bytes())
    if not tree.root_node.has_error:
        return []
    lines: list[int] = []
    stack = [tree.root_node]
    while stack and len(lines) < 5:
        node = stack.pop()
        if node.type == "ERROR" or node.is_missing:
            lines.append(node.start_point[0] + 1)
        elif node.has_error:
            stack.extend(reversed(node.children))
    return sorted(set(lines))


def detect(ws: Workspace) -> dict:
    files = all_files(ws)
    names = set(files)
    info: dict = {"files": len(files), "framework": "static HTML", "package_manager": None, "scripts": {}}
    pkg = {}
    if "package.json" in names:
        try:
            pkg = json.loads((ws.path / "package.json").read_text(encoding="utf-8"))
        except (ValueError, OSError):
            pkg = {}
        deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
        for dep, label in (("next", "Next.js"), ("astro", "Astro"), ("gatsby", "Gatsby"), ("nuxt", "Nuxt"),
                           ("@sveltejs/kit", "SvelteKit"), ("@remix-run/react", "Remix"), ("vitepress", "VitePress"),
                           ("@docusaurus/core", "Docusaurus"), ("@11ty/eleventy", "Eleventy"),
                           ("react-scripts", "Create React App"), ("vite", "Vite"), ("vue", "Vue"), ("react", "React")):
            if dep in deps:
                info["framework"] = label
                break
        info["scripts"] = {k: v for k, v in pkg.get("scripts", {}).items()}
        info["package_manager"] = ("pnpm" if "pnpm-lock.yaml" in names else "yarn" if "yarn.lock" in names
                                   else "bun" if "bun.lockb" in names or "bun.lock" in names else "npm")
    elif any(n in names for n in ("hugo.toml", "hugo.yaml", "hugo.json")) or (
            "config.toml" in names and any(f.startswith("content/") for f in files)):
        info["framework"] = "Hugo"
    elif "_config.yml" in names:
        info["framework"] = "Jekyll"
    elif "wp-config.php" in names or any(f.startswith("wp-content/") for f in files):
        info["framework"] = "WordPress (files)"
    info["top_level"] = sorted({f.split("/", 1)[0] + ("/" if "/" in f else "") for f in files})[:80]
    hints = {
        "Next.js": "Metadata: `export const metadata`/`generateMetadata` in app/**/page.tsx or layout.tsx; "
                   "pages router uses next/head. Sitemap: app/sitemap.ts; robots: app/robots.ts.",
        "Astro": "Pages in src/pages; head tags usually in a layout (src/layouts/*.astro); content in src/content.",
        "Gatsby": "Head API (`export const Head`) or react-helmet SEO component; gatsby-config.js siteMetadata.",
        "Nuxt": "useHead/useSeoMeta in pages or app.vue; nuxt.config app.head defaults.",
        "Hugo": "Content front matter in content/**; templates in layouts/ (baseof.html, partials/head.html).",
        "Jekyll": "Front matter in _posts/ and pages; head in _includes/head.html; site config _config.yml.",
        "SvelteKit": "<svelte:head> in +page.svelte / +layout.svelte.",
        "Docusaurus": "Front matter in docs/blog markdown; docusaurus.config.js metadata.",
    }
    info["seo_hint"] = hints.get(info["framework"], "")
    return info


def route_candidates(ws: Workspace, url: str) -> list[str]:
    """Source files that likely render `url`, from common framework routing conventions."""
    path = urlsplit(url).path.strip("/")
    slug = path.rsplit("/", 1)[-1] if path else ""
    files = all_files(ws)
    patterns = []
    if not path:
        patterns += ["app/page.*", "src/app/page.*", "pages/index.*", "src/pages/index.*", "index.html",
                     "content/_index.md", "index.md", "app/layout.*", "src/app/layout.*", "src/layouts/*"]
    else:
        patterns += [f"app/{path}/page.*", f"src/app/{path}/page.*", f"pages/{path}.*", f"pages/{path}/index.*",
                     f"src/pages/{path}.*", f"src/pages/{path}/index.*", f"{path}.html", f"{path}/index.html",
                     f"content/{path}.md", f"content/{path}/index.md", f"content/{path}/_index.md",
                     f"src/content/**/{slug}.md*", f"content/**/{slug}.md*", f"_posts/*-{slug}.md*",
                     f"**/{slug}.md*", f"**/{slug}/index.md*", "app/**/[[]slug[]]/page.*", "src/pages/**/[[]*[]].*",
                     "pages/**/[[]*[]].*"]
    out: list[str] = []
    for pat in patterns:
        for f in files:
            if fnmatch.fnmatch(f, pat) and f not in out:
                out.append(f)
    return out[:15]
