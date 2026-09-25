"""Apply page-level fixes to raw HTML (static sites, GitHub repos, local builds)."""

from __future__ import annotations

import difflib
import json
from urllib.parse import urlsplit

from bs4 import BeautifulSoup

from .models import FixAction, FixKind


class PatchError(ValueError):
    pass


def _head(soup: BeautifulSoup):
    head = soup.head
    if head is None:
        head = soup.new_tag("head")
        (soup.html or soup).insert(0, head)
    return head


def _set_meta(soup, head, attr: str, key: str, content: str) -> None:
    tag = head.find("meta", attrs={attr: key})
    if tag is None:
        tag = soup.new_tag("meta")
        tag[attr] = key
        head.append(tag)
    tag["content"] = content


def _same_image(a: str, b: str) -> bool:
    return a == b or urlsplit(a).path == urlsplit(b).path


def apply_fix(html: str, fix: FixAction) -> str:
    if fix.kind in (FixKind.ADD_INTERNAL_LINK, FixKind.REMOVE_INTERNAL_LINK):
        from .links import insert_link, remove_link

        p = fix.payload
        if fix.kind == FixKind.ADD_INTERNAL_LINK:
            return insert_link(html, p["href"], p["anchor_text"])
        return remove_link(html, p["href"], p.get("anchor_text"))
    soup = BeautifulSoup(html, "html.parser")
    head = _head(soup)
    p = fix.payload
    if fix.kind == FixKind.SET_TITLE:
        if head.title is None:
            head.insert(0, soup.new_tag("title"))
        head.title.string = p["title"]
    elif fix.kind == FixKind.SET_META_DESCRIPTION:
        _set_meta(soup, head, "name", "description", p["meta_description"])
    elif fix.kind == FixKind.SET_CANONICAL:
        link = head.find("link", rel="canonical")
        if link is None:
            link = soup.new_tag("link", rel="canonical")
            head.append(link)
        link["href"] = p["canonical"]
    elif fix.kind == FixKind.SET_LANG:
        if soup.html is None:
            raise PatchError("document has no <html> element")
        soup.html["lang"] = p["lang"]
    elif fix.kind == FixKind.ADD_VIEWPORT:
        _set_meta(soup, head, "name", "viewport", p.get("viewport", "width=device-width, initial-scale=1"))
    elif fix.kind == FixKind.SET_IMAGE_ALT:
        changed = 0
        for item in p["alts"]:
            for img in soup.find_all("img"):
                if _same_image(img.get("src", ""), item["src"]) and not (img.get("alt") or "").strip():
                    img["alt"] = item["alt"]
                    changed += 1
        if not changed:
            raise PatchError("no matching images without alt text")
    elif fix.kind == FixKind.ADD_JSON_LD:
        schema = p["schema"]
        schema_type = schema.get("@type")
        for existing in head.find_all("script", type="application/ld+json"):
            try:
                if json.loads(existing.string or "{}").get("@type") == schema_type:
                    existing.decompose()
            except (json.JSONDecodeError, AttributeError):
                continue
        tag = soup.new_tag("script", type="application/ld+json")
        tag.string = json.dumps(schema, ensure_ascii=False, indent=2).replace("</", "<\\/")
        head.append(tag)
    elif fix.kind == FixKind.SET_OPEN_GRAPH:
        for key, value in p.items():
            if value:
                _set_meta(soup, head, "property", f"og:{key}", value)
    else:
        raise PatchError(f"{fix.kind} is not an HTML patch")
    return str(soup)


def unified_diff(before: str, after: str, path: str) -> str:
    return "".join(difflib.unified_diff(before.splitlines(keepends=True), after.splitlines(keepends=True),
                                        fromfile=f"a/{path}", tofile=f"b/{path}", n=2))
