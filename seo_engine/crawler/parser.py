"""Convert advertools (Scrapy) crawl rows into PageData objects."""

from __future__ import annotations

import json
import re
from urllib.parse import urlsplit, urlunsplit

import pandas as pd

from ..core.models import ImageInfo, LinkInfo, PageData

SEP = "@@"


CSS_SELECTORS = {
    "x_lang": "html::attr(lang)",
    "x_meta_robots": "meta[name=robots]::attr(content), meta[name=googlebot]::attr(content)",
    "x_head_scripts": "head script::attr(src)",
    "x_body_scripts": "body script::attr(src)",
    "x_jsonld": 'script[type="application/ld+json"]::text',
    "x_forms": "form",
    "x_search": "input[type=search], form[role=search], input[name=s], input[name=q]",
    "x_autoplay": "video[autoplay]:not([muted]), audio[autoplay]",
    "x_published": 'meta[property="article:published_time"]::attr(content)',
    "x_modified": 'meta[property="article:modified_time"]::attr(content)',
    "x_article": "article",
    "x_breadcrumb": 'nav[aria-label*="readcrumb"], .breadcrumb, .breadcrumbs, .rank-math-breadcrumb, #breadcrumbs',
    "x_mailto": 'a[href^="mailto:"]::attr(href)',
    "x_src_http": 'img[src^="http:"]::attr(src), script[src^="http:"]::attr(src), '
    'link[rel=stylesheet][href^="http:"]::attr(href), iframe[src^="http:"]::attr(src)',
    "x_inline_js": "script:not([src])::text",
}


XPATH_SELECTORS = {
    "x_main_text": "(//article|//main)[1]//text()[not(ancestor::script) and not(ancestor::style)]",
}


ARCHIVE_PATTERNS = [
    ("tag", re.compile(r"/tag/")),
    ("category", re.compile(r"/category/")),
    ("author", re.compile(r"/author/")),
    ("date", re.compile(r"/\d{4}/(\d{2}/)?$")),
    ("search", re.compile(r"[?&]s=|/search/")),
]


EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def normalize_start_url(url: str) -> str:
    url = url.strip()
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    parts = urlsplit(url)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path or "/", parts.query, ""))


def _split(value) -> list[str]:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return []
    return [v for v in str(value).split(SEP)]


def _first(value) -> str | None:
    items = [v for v in _split(value) if v.strip()]
    return items[0].strip() if items else None


def _classify(url: str, row_is_article: bool, home: str) -> str:
    if url.rstrip("/") == home.rstrip("/"):
        return "home"
    for name, pattern in ARCHIVE_PATTERNS:
        if pattern.search(url):
            return name
    return "article" if row_is_article else "page"


def row_to_page(row: dict, base_url: str) -> PageData:
    get = row.get
    url = str(get("url"))
    status = int(get("status") or 0)
    headers_ct = str(get("resp_headers_Content-Type") or get("resp_headers_content-type") or "")
    base_host = urlsplit(base_url).hostname or ""

    def _internal(u: str) -> bool:
        host = (urlsplit(u).hostname or "").removeprefix("www.")
        return host == base_host.removeprefix("www.")

    links: list[LinkInfo] = []
    seen_region: dict[str, str] = {}
    for region in ("header", "nav", "footer"):
        for u in _split(get(f"{region}_links_url")):
            seen_region.setdefault(u, region)
    for u, t, nf in zip(_split(get("links_url")), _split(get("links_text")), _split(get("links_nofollow")), strict=False):
        if not u or u.startswith(("mailto:", "tel:", "javascript:")):
            continue
        links.append(LinkInfo(url=u.split("#")[0] or u, text=t.strip(), region=seen_region.get(u, "body"),
                              internal=_internal(u), nofollow=nf == "True"))

    srcs, alts = _split(get("img_src")), _split(get("img_alt"))
    widths, heights = _split(get("img_width")), _split(get("img_height"))
    loadings = _split(get("img_loading"))
    images = []
    for i, src in enumerate(srcs):
        alt = alts[i] if i < len(alts) else None
        images.append(ImageInfo(
            src=src,
            alt=alt if alt else None,
            width=(widths[i] or None) if i < len(widths) else None,
            height=(heights[i] or None) if i < len(heights) else None,
            loading=(loadings[i] or None) if i < len(loadings) else None,
        ))

    json_ld, json_ld_errors = [], []
    for raw in _split(get("x_jsonld")):
        if not raw.strip():
            continue
        try:
            json_ld.append(json.loads(raw))
        except json.JSONDecodeError as exc:
            json_ld_errors.append(f"Unparsable JSON-LD: {exc.msg} at char {exc.pos}")

    main_text = " ".join(_split(get("x_main_text"))).strip()
    text = main_text if len(main_text.split()) > 50 else str(get("body_text") or "")
    text = re.sub(r"\s+", " ", text).strip()

    og = {k.split(":", 1)[1]: str(v) for k, v in row.items() if k.startswith("og:") and isinstance(v, str)}
    headings = []
    for level in range(1, 7):
        for h in _split(get(f"h{level}")):
            if h.strip():
                headings.append((level, h.strip()))

    json_types = {str(t) for b in json_ld for t in ([b.get("@type")] if isinstance(b, dict) else [])}
    is_article = bool(
        og.get("type") == "article"
        or json_types & {"Article", "BlogPosting", "NewsArticle"}
        or _first(get("x_published"))
    )
    emails = sorted({m.removeprefix("mailto:").split("?")[0] for m in _split(get("x_mailto")) if m}
                    | set(EMAIL_RE.findall(text)))

    redirect_chain = [u for u in _split(get("redirect_urls")) if u]
    page = PageData(
        url=redirect_chain[0] if redirect_chain else url,
        final_url=url,
        status=status,
        redirect_chain=redirect_chain,
        content_type=headers_ct,
        response_ms=int(float(get("download_latency") or 0) * 1000),
        html_bytes=int(float(get("size") or 0)),
        title=_first(get("title")),
        meta_description=_first(get("meta_desc")),
        meta_robots=",".join(_split(get("x_meta_robots"))),
        x_robots_tag=str(get("resp_headers_X-Robots-Tag") or ""),
        canonical=_first(get("canonical")),
        lang=_first(get("x_lang")),
        viewport=_first(get("viewport")),
        h1=[h for h in _split(get("h1")) if h.strip()],
        headings=headings,
        word_count=len(text.split()),
        text_excerpt=text[:30000],
        images=images,
        links=links,
        json_ld=json_ld,
        json_ld_errors=json_ld_errors,
        og=og,
        scripts=[s for s in _split(get("x_head_scripts")) + _split(get("x_body_scripts")) if s],
        head_scripts=[s for s in _split(get("x_head_scripts")) if s],
        inline_script_sample=" ".join(_split(get("x_inline_js")))[:20000],
        mixed_content=[u for u in _split(get("x_src_http")) if u] if url.startswith("https://") else [],
        has_form=bool(_first(get("x_forms"))),
        has_search_form=bool(_first(get("x_search"))),
        emails=emails[:10],
        published_time=_first(get("x_published")),
        modified_time=_first(get("x_modified")),
        autoplay_media=bool(_first(get("x_autoplay"))),
        has_breadcrumb_markup=bool(_first(get("x_breadcrumb"))),
    )
    page.page_type = _classify(url, is_article, base_url)
    return page
