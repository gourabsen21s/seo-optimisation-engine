"""Fetch and dissect any public web page (competitors, SERP results, link prospects) — SSRF-guarded."""

from __future__ import annotations

import json
import re
from collections import Counter
from urllib.parse import urljoin, urlsplit

import trafilatura
from bs4 import BeautifulSoup

from ..core.config import get_settings
from ..core.security import UnsafeURLError, assert_public_url
from .http import ResearchError, cached, request

MAX_BYTES = 3_000_000
STOP = set("""a an and are as at be by for from has have how i in is it its of on or that the this to was what when
where which who why will with you your can do does not no more most best vs our we they their them than then there
these those into about over under also just like get got use using used one two new""".split())


def terms(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-z0-9][a-z0-9'-]+", text.lower()) if len(w) > 2 and w not in STOP]


def _schema_types(soup: BeautifulSoup) -> list[str]:
    found: set[str] = set()

    def walk(node):
        if isinstance(node, dict):
            t = node.get("@type")
            for v in t if isinstance(t, list) else [t]:
                if isinstance(v, str):
                    found.add(v)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    for tag in soup.find_all("script", type="application/ld+json"):
        try:
            walk(json.loads(tag.string or ""))
        except (json.JSONDecodeError, TypeError):
            continue
    return sorted(found)


def dissect(url: str, html: str) -> dict:
    soup = BeautifulSoup(html, "lxml")
    host = (urlsplit(url).hostname or "").removeprefix("www.")
    meta = lambda **kw: (soup.find("meta", attrs=kw) or {}).get("content")  # noqa: E731
    headings = [{"level": int(h.name[1]), "text": h.get_text(" ", strip=True)[:200]}
                for h in soup.find_all(["h1", "h2", "h3"]) if h.get_text(strip=True)]
    text = trafilatura.extract(html, include_comments=False, include_tables=True, favor_precision=True) or ""
    internal = external = 0
    for a in soup.find_all("a", href=True):
        target = (urlsplit(urljoin(url, a["href"])).hostname or "").removeprefix("www.")
        if target == host:
            internal += 1
        elif target:
            external += 1
    imgs = soup.find_all("img")
    canonical = soup.find("link", rel="canonical")
    top_terms = [w for w, _ in Counter(terms(text)).most_common(25)]
    return {
        "url": url,
        "title": soup.title.get_text(strip=True) if soup.title else None,
        "meta_description": meta(name="description"),
        "canonical": canonical.get("href") if canonical else None,
        "robots": meta(name="robots"),
        "lang": (soup.html or {}).get("lang") if soup.html else None,
        "published": meta(property="article:published_time"),
        "modified": meta(property="article:modified_time"),
        "h1": [h["text"] for h in headings if h["level"] == 1],
        "outline": [h for h in headings if h["level"] > 1][:60],
        "questions": [h["text"] for h in headings if h["text"].endswith("?")][:20],
        "words": len(text.split()),
        "schema_types": _schema_types(soup),
        "internal_links": internal,
        "external_links": external,
        "images": len(imgs),
        "images_missing_alt": sum(1 for i in imgs if not (i.get("alt") or "").strip()),
        "top_terms": top_terms,
        "text": text,
    }


async def fetch_page(url: str, *, text_chars: int = 6000) -> dict:
    """Fetch a public URL and return its SEO anatomy (outline, words, schema, links, main text excerpt)."""
    if not url.startswith(("http://", "https://")):
        raise ResearchError("URL must start with http:// or https://")
    settings = get_settings()
    try:
        await assert_public_url(url, settings.allow_private_networks)
    except UnsafeURLError as exc:
        raise ResearchError(str(exc)) from exc

    async def load() -> dict:
        resp = await request("GET", url, service="fetch", concurrency=6, retries=1)
        ctype = resp.headers.get("content-type", "")
        if resp.status_code >= 400:
            return {"url": str(resp.url), "status": resp.status_code, "error": f"HTTP {resp.status_code}"}
        if "html" not in ctype and "xml" not in ctype:
            return {"url": str(resp.url), "status": resp.status_code, "error": f"not an HTML page ({ctype})"}
        if len(resp.content) > MAX_BYTES:
            return {"url": str(resp.url), "status": resp.status_code, "error": "page too large"}
        return {"status": resp.status_code, **dissect(str(resp.url), resp.text)}

    page = dict(await cached(f"page|{url}", load, ttl=6 * 3600))
    if "text" in page:
        page["text_excerpt"] = page.pop("text")[:text_chars]
    return page


def gap_analysis(ours: dict | None, competitors: list[dict]) -> dict:
    """Topics (H2/H3 sections) competitors cover that our page doesn't, plus depth and schema comparisons."""
    our_terms = set(terms((ours or {}).get("text", "") + " " + " ".join(h["text"] for h in (ours or {}).get("outline", []))))
    topics: dict[str, dict] = {}
    for comp in competitors:
        for h in comp.get("outline", []):
            words = terms(h["text"])
            if len(words) < 1:
                continue
            key = " ".join(sorted(set(words)))
            covered = sum(1 for w in set(words) if w in our_terms) / len(set(words))
            entry = topics.setdefault(key, {"heading": h["text"], "competitors": set(), "covered": covered})
            entry["competitors"].add(comp.get("url"))
    missing = sorted(({"topic": v["heading"], "covered_by": len(v["competitors"]), "our_coverage": round(v["covered"], 2)}
                      for v in topics.values() if v["covered"] < 0.6),
                     key=lambda t: (-t["covered_by"], t["our_coverage"]))
    comp_words = [c.get("words", 0) for c in competitors if c.get("words")]
    comp_schema = Counter(t for c in competitors for t in c.get("schema_types", []))
    comp_terms = Counter(t for c in competitors for t in c.get("top_terms", []))
    return {
        "competitor_avg_words": round(sum(comp_words) / len(comp_words)) if comp_words else None,
        "our_words": (ours or {}).get("words"),
        "missing_topics": missing[:25],
        "competitor_questions": sorted({q for c in competitors for q in c.get("questions", [])})[:20],
        "schema_competitors_use": [t for t, n in comp_schema.most_common(10) if t not in set((ours or {}).get("schema_types", []))],
        "terms_we_lack": [t for t, n in comp_terms.most_common(40) if n >= 2 and t not in our_terms][:20],
    }
