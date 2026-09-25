"""Section E — navigation and site architecture (requirements 24–26)."""

from __future__ import annotations

from ..context import norm_url
from ..registry import H, L, M, check
from ..registry import finding as F


@check
def navigation(ctx):
    home = ctx.home
    if home is None or home.status != 200:
        return
    menu = {
        norm_url(l.url)
        for l in home.links
        if l.region in ("header", "nav") and l.internal
    }
    if not menu:
        yield F(
            "no_menu",
            "No header/nav menu detected on the homepage",
            H,
            24,
            recommendation="Create a Primary menu (Home, main categories, About, Contact).",
        )
    elif len(menu) > 12:
        yield F(
            "menu_too_big",
            f"Header menu has {len(menu)} links",
            L,
            24,
            recommendation="Keep top-level menu items to seven or fewer with at most one dropdown level.",
        )
    categories = [p for p in ctx.pages if p.page_type == "category"]
    if len(ctx.articles) >= 10 and len(categories) < 3:
        yield F(
            "few_categories",
            "Few category archives for the amount of content",
            L,
            24,
            recommendation="Organise posts into 6–8 real categories with 100–200 word descriptions.",
        )


@check
def breadcrumbs(ctx):
    missing = [
        p.final_url
        for p in ctx.articles
        if "BreadcrumbList" not in p.schema_types() and not p.has_breadcrumb_markup
    ]
    if missing:
        yield F(
            "no_breadcrumbs",
            "Articles without breadcrumbs",
            L,
            25,
            urls=missing,
            fixable=True,
            recommendation="Enable Rank Math/Yoast breadcrumbs (emits BreadcrumbList schema).",
        )


@check
def internal_linking(ctx):
    weak = [
        p.final_url
        for p in ctx.articles
        if len({norm_url(l.url) for l in p.links if l.internal and l.region == "body"})
        < 3
    ]
    if weak:
        yield F(
            "few_internal_links",
            "Articles with fewer than 3 contextual internal links",
            M,
            26,
            urls=weak,
            recommendation="Add 3–6 descriptive internal links per article; build hub pages.",
        )
    if ctx.pages and not any(p.has_search_form for p in ctx.pages[:20]):
        yield F(
            "no_search",
            "No site search form",
            L,
            26,
            recommendation="Add a Search block to the header.",
        )
