"""Section D — structured data (requirement 23)."""

from __future__ import annotations

from ..registry import L, M, check
from ..registry import finding as F


@check
def structured_data(ctx):
    home = ctx.home
    if home and home.status == 200:
        types = home.schema_types()
        if not types & {
            "Organization",
            "Person",
            "NewsMediaOrganization",
            "Corporation",
            "LocalBusiness",
        }:
            yield F(
                "no_org_schema",
                "Homepage has no Organization schema",
                M,
                23,
                urls=[home.final_url],
                fixable=True,
                recommendation="Add sitewide Organization JSON-LD with logo, sameAs and email.",
            )
        if "WebSite" not in types:
            yield F(
                "no_website_schema",
                "Homepage has no WebSite schema",
                L,
                23,
                urls=[home.final_url],
                fixable=True,
            )
    no_article = [
        p.final_url
        for p in ctx.articles
        if not p.schema_types() & {"Article", "BlogPosting", "NewsArticle"}
    ]
    if no_article:
        yield F(
            "no_article_schema",
            "Articles without Article/BlogPosting schema",
            M,
            23,
            urls=no_article,
            fixable=True,
        )
    incomplete = []
    for p in ctx.articles:
        for node in p.schema_nodes("BlogPosting") + p.schema_nodes("Article"):
            missing = [
                f
                for f in (
                    "headline",
                    "image",
                    "datePublished",
                    "dateModified",
                    "author",
                )
                if not node.get(f)
            ]
            if missing:
                incomplete.append(f"{p.final_url} (missing {', '.join(missing)})")
    if incomplete:
        yield F(
            "article_schema_incomplete",
            "Article schema missing recommended fields",
            L,
            23,
            urls=[x.split(" (")[0] for x in incomplete],
            detail="; ".join(incomplete[:10]),
            fixable=True,
        )
    errors = [p.final_url for p in ctx.pages if p.json_ld_errors]
    if errors:
        yield F(
            "jsonld_unparsable",
            "Unparsable JSON-LD",
            M,
            23,
            urls=errors,
            detail="Usually a smart quote or trailing comma.",
            fixable=True,
        )
    dupes = [
        p.final_url
        for p in ctx.pages
        if sum(1 for t in ("Article", "BlogPosting") for _ in p.schema_nodes(t)) > 1
    ]
    if dupes:
        yield F(
            "duplicate_article_schema",
            "Duplicate Article schema on a page (theme + plugin)",
            L,
            23,
            urls=dupes,
        )
    medical = [
        p.final_url
        for p in ctx.pages
        if p.schema_types() & {"MedicalWebPage", "MedicalCondition"}
    ]
    if medical:
        yield F(
            "medical_schema",
            "Medical schema in use — only valid if reviewed by a medical professional",
            M,
            23,
            urls=medical,
        )
