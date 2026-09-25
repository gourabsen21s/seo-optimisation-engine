"""Section F — content standards (requirements 27–33)."""

from __future__ import annotations

import re
import statistics
from collections import defaultdict
from datetime import UTC, datetime

from ..registry import H, L, M, check
from ..registry import finding as F
from ..signatures import (
    DEMO_TITLES,
    RISKY_PHRASES,
)


@check
def content_volume(ctx):
    n = len(ctx.articles)
    note = " (crawl limit reached — may be higher)" if ctx.crawl.truncated else ""
    if n < 15:
        yield F(
            "few_articles",
            f"Only {n} articles found{note}",
            H,
            27,
            category="content",
            recommendation="Aim for 25–35 substantial articles before applying.",
        )
    elif n < 25:
        yield F(
            "few_articles",
            f"{n} articles found{note}",
            M,
            27,
            category="content",
            recommendation="Aim for 25–35 substantial articles.",
        )
    if n:
        median = statistics.median(p.word_count for p in ctx.articles)
        if median < 1200:
            yield F(
                "short_articles",
                f"Median article length is {int(median)} words",
                M,
                27,
                category="content",
                recommendation="Standard pieces: 1,200–2,000 words. Expand the weakest ten first.",
            )
        pillars = sum(1 for p in ctx.articles if p.word_count >= 2500)
        if pillars < 3:
            yield F(
                "few_pillars",
                f"{pillars} pillar guides (2,500+ words)",
                L,
                27,
                category="content",
                recommendation="Publish at least 3 comprehensive, heavily interlinked guides.",
            )


@check
def thin_duplicate_content(ctx):
    thin = [p.final_url for p in ctx.articles if p.word_count < 700]
    if thin:
        yield F(
            "thin_articles",
            f"{len(thin)} articles under 700 words",
            H,
            29,
            category="content",
            urls=thin,
            recommendation="Expand, merge (301) or delete-and-redirect each thin post.",
        )
    demo = [
        p.final_url
        for p in ctx.pages
        if DEMO_TITLES.search(p.title or "") or any(DEMO_TITLES.search(h) for h in p.h1)
    ]
    if demo:
        yield F(
            "demo_content",
            "WordPress demo content still published",
            H,
            29,
            category="content",
            urls=demo,
            recommendation="Delete 'Hello world!', 'Sample Page' and theme demo content.",
        )
    lorem = [p.final_url for p in ctx.pages if "lorem ipsum" in p.text_excerpt.lower()]
    if lorem:
        yield F(
            "lorem_ipsum",
            "Placeholder 'lorem ipsum' text found",
            H,
            29,
            category="content",
            urls=lorem,
        )
    for field, label in (
        ("title", "titles"),
        ("meta_description", "meta descriptions"),
    ):
        groups = defaultdict(list)
        for p in ctx.pages:
            v = getattr(p, field)
            if v and p.indexable:
                groups[v.strip().lower()].append(p.final_url)
        dupes = [u for urls in groups.values() if len(urls) > 1 for u in urls]
        if dupes:
            yield F(
                f"duplicate_{field}",
                f"Duplicate {label}",
                M,
                29,
                category="seo",
                urls=dupes,
                fixable=True,
            )


@check
def images(ctx):
    no_alt = [
        p.final_url
        for p in ctx.pages
        if any(not (i.alt or "").strip() for i in p.images)
    ]
    count = sum(1 for p in ctx.pages for i in p.images if not (i.alt or "").strip())
    if no_alt:
        yield F(
            "img_no_alt",
            f"{count} images without alt text",
            M,
            30,
            urls=no_alt,
            fixable=True,
            recommendation="Write descriptive (not keyword-stuffed) alt text; empty alt only for decoration.",
        )
    camera = [
        p.final_url
        for p in ctx.pages
        if any(
            re.search(r"/(img|dsc|dscn|pxl|screenshot)[_-]?\d+", i.src, re.I)
            for i in p.images
        )
    ]
    if camera:
        yield F(
            "img_camera_names",
            "Images with camera-default filenames",
            L,
            30,
            urls=camera,
            recommendation="Rename files descriptively before upload (e.g. khajuraho-temple-relief.jpg).",
        )


@check
def policy_risks(ctx):
    risky = defaultdict(set)
    for p in ctx.pages:
        for m in RISKY_PHRASES.finditer(p.text_excerpt):
            risky[p.final_url].add(m.group(0))
    if risky:
        yield F(
            "policy_risk_phrases",
            "Possible restricted/prohibited claims",
            M,
            31,
            category="content",
            urls=list(risky),
            detail="; ".join(
                f"{u}: {', '.join(sorted(v))}" for u, v in list(risky.items())[:10]
            ),
            recommendation="Reframe promissory health/income claims; describe tradition vs. evidence.",
        )


@check
def taxonomy(ctx):
    idx = [
        p.final_url
        for p in ctx.pages
        if p.page_type in ("tag", "date", "search") and p.indexable
    ]
    if idx:
        yield F(
            "indexable_archives",
            "Tag/date/search archives are indexable",
            M,
            32,
            urls=idx,
            fixable=True,
            recommendation="Set tag and date archives to noindex,follow; disable date archives.",
        )


@check
def freshness(ctx):
    dates = []
    for p in ctx.articles:
        for d in (p.published_time, p.modified_time):
            if d:
                dates.append(d)
    if not dates:
        dates = [e.lastmod for e in ctx.crawl.sitemap_entries if e.lastmod]
    parsed = []
    for d in dates:
        try:
            dt = datetime.fromisoformat(d.replace("Z", "+00:00"))
            parsed.append(dt if dt.tzinfo else dt.replace(tzinfo=UTC))
        except ValueError:
            continue
    if not parsed:
        yield F(
            "no_dates",
            "No publish dates detected",
            L,
            33,
            category="content",
            recommendation="Show Published and Last updated dates; expose article:published_time.",
        )
        return
    age = (ctx.now - max(parsed)).days
    if age > 30:
        yield F(
            "stale_site",
            f"Most recent content is {age} days old",
            M,
            33,
            category="content",
            recommendation="Publish at least weekly during the review period.",
        )
    elif age > 7:
        yield F(
            "stale_site",
            f"Most recent content is {age} days old",
            L,
            33,
            category="content",
        )
