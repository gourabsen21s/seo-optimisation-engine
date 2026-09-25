"""Surgical internal-link edits on raw HTML (static files or WordPress post content).

Operates with regexes on the original markup rather than re-serialising the document, so diffs stay minimal and
Gutenberg block markup is preserved. Links are only inserted into body copy (<p>/<li>), never inside an existing
link, heading, nav, header or footer.
"""

from __future__ import annotations

import html as htmllib
import re

from .htmlpatch import PatchError

MARK = 'data-seo-engine="internal-link"'
_BLOCK = re.compile(r"(<(p|li)\b[^>]*>)(.*?)(</\2\s*>)", re.I | re.S)
_TAG = re.compile(r"(<[^>]+>)")
_SKIP_REGIONS = re.compile(r"<(nav|header|footer|aside)\b.*?</\1\s*>", re.I | re.S)


def _content_span(doc: str) -> tuple[int, int]:
    for tag in ("article", "main"):
        m = re.search(rf"<{tag}\b[^>]*>(.*)</{tag}\s*>", doc, re.I | re.S)
        if m:
            return m.start(1), m.end(1)
    m = re.search(r"<body\b[^>]*>(.*)</body\s*>", doc, re.I | re.S)
    return (m.start(1), m.end(1)) if m else (0, len(doc))


def has_link(doc: str, href: str) -> bool:
    start, end = _content_span(doc)
    return re.search(rf"<a\b[^>]*href=[\"']{re.escape(href)}/?[\"']", doc[start:end], re.I) is not None


def insert_link(doc: str, href: str, anchor: str) -> str:
    """Wrap the first body-copy occurrence of `anchor` in a link to `href`."""
    anchor = anchor.strip()
    if not anchor:
        raise PatchError("empty anchor text")
    if has_link(doc, href):
        raise PatchError("the page already links to that URL")
    start, end = _content_span(doc)
    region = doc[start:end]
    skip = [(m.start(), m.end()) for m in _SKIP_REGIONS.finditer(region)]
    pattern = re.compile(rf"(?<![\w-]){re.escape(htmllib.escape(anchor, quote=False))}(?![\w-])", re.I)
    for block in _BLOCK.finditer(region):
        if any(a <= block.start() < b for a, b in skip):
            continue
        inner, depth, out, done = block.group(3), 0, [], False
        for part in _TAG.split(inner):
            if part.startswith("<"):
                if re.match(r"<a\b", part, re.I):
                    depth += 1
                elif re.match(r"</a\s*>", part, re.I):
                    depth = max(0, depth - 1)
                out.append(part)
                continue
            if not done and depth == 0:
                m = pattern.search(part)
                if m:
                    part = (f"{part[:m.start()]}<a href=\"{htmllib.escape(href)}\" {MARK}>{m.group(0)}</a>"
                            f"{part[m.end():]}")
                    done = True
            out.append(part)
        if done:
            new_block = block.group(1) + "".join(out) + block.group(4)
            region = region[:block.start()] + new_block + region[block.end():]
            return doc[:start] + region + doc[end:]
    raise PatchError(f"anchor text “{anchor}” was not found in the page's body copy")


def remove_link(doc: str, href: str, anchor: str | None = None) -> str:
    """Unwrap a link we inserted (or, failing that, a link to `href` whose text equals `anchor`)."""
    ours = re.compile(rf"<a\b[^>]*href=[\"']{re.escape(htmllib.escape(href))}[\"'][^>]*{re.escape(MARK)}[^>]*>(.*?)</a\s*>",
                      re.I | re.S)
    new, n = ours.subn(r"\1", doc, count=1)
    if n:
        return new
    if anchor:
        loose = re.compile(rf"<a\b[^>]*href=[\"']{re.escape(href)}[\"'][^>]*>\s*({re.escape(anchor)})\s*</a\s*>",
                           re.I | re.S)
        new, n = loose.subn(r"\1", doc, count=1)
        if n:
            return new
    raise PatchError("the link to remove was not found")

