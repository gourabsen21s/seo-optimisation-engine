"""Section A — eligibility and crawlability (requirements 1–4)."""

from __future__ import annotations

from urllib.parse import urlsplit

from ..context import AuditContext
from ..registry import C, H, check
from ..registry import finding as F
from ..signatures import (
    MAINTENANCE_RE,
)


@check
def domain_ownership(ctx: AuditContext):
    host = urlsplit(ctx.crawl.base_url).hostname or ""
    hosted = (
        ".wordpress.com",
        ".blogspot.com",
        ".wixsite.com",
        ".github.io",
        ".netlify.app",
        ".vercel.app",
        ".weebly.com",
        ".medium.com",
        ".substack.com",
        ".pages.dev",
    )
    if host.endswith(hosted):
        yield F(
            "free_subdomain",
            "Site is on a free hosted subdomain",
            H,
            2,
            detail=f"{host} is a platform subdomain; AdSense requires a domain you own.",
            recommendation="Move the site to your own top-level domain.",
        )


@check
def site_live(ctx: AuditContext):
    home = ctx.home
    if home is None or home.status != 200:
        yield F(
            "home_unreachable",
            "Homepage is not reachable",
            C,
            3,
            detail=f"Status: {home.status if home else 'no response'}",
            recommendation="Make sure the homepage returns HTTP 200 to crawlers (check firewall/bot protection).",
            urls=[ctx.crawl.start_url],
        )
        return
    if not home.indexable:
        yield F(
            "home_noindex",
            "Homepage is set to noindex",
            C,
            3,
            detail=f"robots meta: '{home.meta_robots}' X-Robots-Tag: '{home.x_robots_tag}'",
            recommendation="WordPress: Settings → Reading → untick 'Discourage search engines'.",
            urls=[home.final_url],
            fixable=True,
        )
    text = f"{home.title} {' '.join(home.h1)} {home.text_excerpt[:1500]}"
    if MAINTENANCE_RE.search(text):
        yield F(
            "maintenance_mode",
            "Site looks like a Coming Soon / maintenance page",
            C,
            3,
            recommendation="Disable maintenance/coming-soon plugins and theme modes.",
            urls=[home.final_url],
        )
    if len(ctx.pages) <= 1:
        yield F(
            "crawl_blocked",
            "Crawler could only reach one page",
            H,
            3,
            detail="Links may be JavaScript-only, blocked by robots.txt or by bot protection.",
            recommendation="Ensure navigation uses real <a href> links and bots are not challenged.",
        )
