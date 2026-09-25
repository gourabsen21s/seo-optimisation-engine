"""Core on-page SEO checks not tied to a manual requirement."""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from ..registry import H, I, L, M, check
from ..registry import finding as F


@check
def titles_and_meta(ctx):
    idx = [p for p in ctx.pages if p.indexable]
    no_title = [p.final_url for p in idx if not p.title]
    if no_title:
        yield F(
            "missing_title",
            "Pages without a <title>",
            H,
            category="seo",
            urls=no_title,
            fixable=True,
        )
    bad_len = [p.final_url for p in idx if p.title and not (30 <= len(p.title) <= 60)]
    if bad_len:
        yield F(
            "title_length",
            "Titles outside 30–60 characters",
            L,
            category="seo",
            urls=bad_len,
            fixable=True,
        )
    no_desc = [p.final_url for p in idx if not p.meta_description]
    if no_desc:
        yield F(
            "missing_meta_description",
            "Pages without a meta description",
            M,
            category="seo",
            urls=no_desc,
            fixable=True,
        )
    bad_desc = [
        p.final_url
        for p in idx
        if p.meta_description and not (70 <= len(p.meta_description) <= 160)
    ]
    if bad_desc:
        yield F(
            "meta_description_length",
            "Meta descriptions outside 70–160 characters",
            L,
            category="seo",
            urls=bad_desc,
            fixable=True,
        )
    no_og = [p.final_url for p in idx if not (p.og.get("title") and p.og.get("image"))]
    if no_og:
        yield F(
            "missing_open_graph",
            "Missing Open Graph title/image (poor social sharing)",
            L,
            category="seo",
            urls=no_og,
            fixable=True,
        )


@check
def url_hygiene(ctx):
    bad = [
        p.final_url
        for p in ctx.pages
        if re.search(r"[A-Z_]", urlsplit(p.final_url).path) or len(p.final_url) > 115
    ]
    if bad:
        yield F(
            "url_hygiene",
            "URLs with uppercase, underscores or excessive length",
            L,
            category="seo",
            urls=bad,
        )


@check
def llms_txt(ctx):
    if ctx.crawl.llms_txt_status != 200:
        yield F(
            "no_llms_txt",
            "No /llms.txt for AI answer engines (optional)",
            I,
            category="seo",
            fixable=True,
        )
