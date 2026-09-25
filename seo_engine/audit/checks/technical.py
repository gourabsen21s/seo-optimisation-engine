"""Section C — technical foundation (requirements 13–22)."""

from __future__ import annotations

import re
from urllib.parse import urljoin, urlsplit

from ..context import norm_url
from ..registry import C, H, I, L, M, check
from ..registry import finding as F


@check
def https(ctx):
    http_pages = [p.final_url for p in ctx.pages if p.final_url.startswith("http://")]
    if http_pages:
        yield F(
            "not_https",
            "Pages served over plain HTTP",
            C,
            13,
            urls=http_pages,
            recommendation="Install an SSL certificate and 301-redirect all HTTP to HTTPS.",
        )
    bare = urlsplit(ctx.crawl.base_url).netloc.removeprefix("www.")
    http_variant = ctx.crawl.variant_redirects.get(f"http://{bare}/")
    if (
        ctx.crawl.base_url.startswith("https://")
        and http_variant
        and http_variant.startswith("http://")
    ):
        yield F(
            "http_no_redirect",
            "HTTP does not redirect to HTTPS",
            H,
            13,
            recommendation="Force a 301 redirect from http:// to https:// (.htaccess or Cloudflare).",
        )
    mixed = [p.final_url for p in ctx.pages if p.mixed_content]
    if mixed:
        yield F(
            "mixed_content",
            "Mixed content (http:// resources on https pages)",
            H,
            13,
            urls=mixed,
            recommendation="Use Better Search Replace to rewrite http:// URLs to https://.",
            fixable=True,
        )


@check
def canonical_domain(ctx):
    finals = {v for v in ctx.crawl.variant_redirects.values() if v}
    finals_norm = {f.rstrip("/") for f in finals}
    if len(finals_norm) > 1:
        yield F(
            "multiple_domains",
            "Site resolves on more than one address",
            H,
            14,
            detail="Variants resolve to: " + ", ".join(sorted(finals_norm)),
            recommendation="301 all four http/https × www/non-www variants to one canonical address.",
        )
    no_canonical = [p.final_url for p in ctx.pages if p.indexable and not p.canonical]
    if no_canonical:
        yield F(
            "missing_canonical",
            "Pages without a canonical tag",
            M,
            14,
            urls=no_canonical,
            fixable=True,
            recommendation="Emit a self-referencing rel=canonical on every page (Rank Math/Yoast do this).",
        )
    ugly = [p.final_url for p in ctx.pages if re.search(r"[?&]p=\d+", p.final_url)]
    if ugly:
        yield F(
            "plain_permalinks",
            "Default ?p=123 permalinks in use",
            M,
            14,
            urls=ugly,
            recommendation="Settings → Permalinks → Post name, with redirects from old URLs.",
        )
    attach = [
        p.final_url
        for p in ctx.pages
        if "/attachment/" in p.final_url or "attachment_id=" in p.final_url
    ]
    if attach:
        yield F(
            "attachment_pages",
            "Attachment pages are indexable",
            M,
            14,
            urls=attach,
            recommendation="Redirect attachment URLs to the parent post (Rank Math: Redirect Attachments).",
        )


@check
def xml_sitemap(ctx):
    if not ctx.crawl.sitemap_urls_found:
        yield F(
            "no_sitemap",
            "No XML sitemap found",
            H,
            15,
            fixable=True,
            recommendation="Enable the sitemap in Rank Math/Yoast (sitemap_index.xml) and submit it in "
            "Search Console and Bing Webmaster Tools.",
        )
        return
    for err in ctx.crawl.sitemap_errors[:5]:
        yield F("sitemap_error", "XML sitemap has errors", M, 15, detail=err)
    by_url = {norm_url(p.url): p for p in ctx.crawl.pages.values()}
    bad = []
    for e in ctx.crawl.sitemap_entries:
        p = by_url.get(norm_url(e.url))
        if p is not None and (p.status != 200 or p.redirect_chain or not p.indexable):
            bad.append(e.url)
    if bad:
        yield F(
            "sitemap_bad_urls",
            "Sitemap lists non-200, redirected or noindexed URLs",
            M,
            15,
            urls=bad,
            recommendation="Only include canonical, indexable URLs that return 200.",
        )
    if ctx.crawl.robots_txt and not re.search(
        r"(?im)^\s*sitemap:", ctx.crawl.robots_txt
    ):
        yield F(
            "robots_no_sitemap",
            "robots.txt does not reference the sitemap",
            L,
            17,
            fixable=True,
            recommendation=f"Add 'Sitemap: {ctx.crawl.sitemap_urls_found[0]}' to robots.txt.",
        )


@check
def html_sitemap(ctx):
    url, page = ctx.trust_pages["html_sitemap"]
    if page is None or page.status != 200:
        yield F(
            "no_html_sitemap",
            "No human-readable HTML sitemap page",
            L,
            16,
            recommendation="Create /sitemap/ with Rank Math's HTML sitemap and link it in the footer.",
        )


@check
def robots_txt(ctx):
    if ctx.crawl.robots_status != 200 or ctx.crawl.robots_txt is None:
        yield F(
            "robots_missing",
            "No robots.txt file",
            L,
            17,
            fixable=True,
            recommendation="Publish the WordPress robots.txt template (allows Mediapartners-Google, "
            "AdsBot, uploads, and lists the sitemap).",
        )
        return
    rp, base = ctx.robots, ctx.crawl.base_url
    if not rp.can_fetch("Googlebot", base):
        yield F(
            "robots_blocks_google",
            "robots.txt blocks Googlebot from the homepage",
            C,
            17,
            fixable=True,
            detail="A 'Disallow: /' rule applies to Googlebot.",
            recommendation="Remove 'Disallow: /'.",
        )
    if not rp.can_fetch("Mediapartners-Google", base):
        yield F(
            "robots_blocks_adsense",
            "robots.txt blocks the AdSense crawler (Mediapartners-Google)",
            H,
            17,
            fixable=True,
            recommendation="Add 'User-agent: Mediapartners-Google / Allow: /'.",
        )
    if not rp.can_fetch(
        "Googlebot-Image", urljoin(base, "/wp-content/uploads/test.jpg")
    ):
        yield F(
            "robots_blocks_uploads",
            "robots.txt blocks /wp-content/uploads/",
            M,
            17,
            fixable=True,
        )
    for asset in (
        "/wp-includes/js/jquery/jquery.min.js",
        "/wp-content/themes/x/style.css",
    ):
        if not rp.can_fetch("Googlebot", urljoin(base, asset)):
            yield F(
                "robots_blocks_assets",
                "robots.txt blocks CSS/JS needed for rendering",
                M,
                17,
                fixable=True,
                detail=f"Blocked: {asset}",
            )
            break


@check
def ads_txt(ctx):
    pubs = {c.replace("ca-", "") for c in ctx.adsense_clients}
    if ctx.crawl.ads_txt_status != 200 or not ctx.crawl.ads_txt:
        if pubs:
            yield F(
                "ads_txt_missing",
                "AdSense code present but no ads.txt",
                H,
                19,
                fixable=True,
                recommendation=f"Publish /ads.txt with: google.com, {next(iter(pubs))}, DIRECT, f08c47fec0942fa0",
            )
        else:
            yield F(
                "ads_txt_plan",
                "No ads.txt yet (add it right after approval)",
                I,
                19,
                fixable=True,
            )
        return
    body = ctx.crawl.ads_txt
    if "text/plain" not in ctx.crawl.ads_txt_content_type:
        yield F(
            "ads_txt_mime",
            "ads.txt is not served as text/plain",
            M,
            19,
            detail=f"Content-Type: {ctx.crawl.ads_txt_content_type}",
        )
    lines = [ln.split("#")[0].strip() for ln in body.splitlines()]
    records = [ln for ln in lines if ln and "=" not in ln.split(",")[0]]
    malformed = [ln for ln in records if len([x for x in ln.split(",")]) < 3]
    if malformed:
        yield F(
            "ads_txt_malformed",
            "ads.txt has malformed records",
            M,
            19,
            detail="; ".join(malformed[:5]),
        )
    for pub in pubs:
        if pub not in body:
            yield F(
                "ads_txt_wrong_pub",
                f"ads.txt does not list your publisher ID {pub}",
                C,
                19,
                fixable=True,
                recommendation=f"Add: google.com, {pub}, DIRECT, f08c47fec0942fa0",
            )


@check
def mobile(ctx):
    no_vp = [p.final_url for p in ctx.pages if not p.viewport]
    if no_vp:
        yield F(
            "no_viewport",
            "Pages missing the responsive viewport meta tag",
            H,
            20,
            urls=no_vp,
            fixable=True,
            recommendation='Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
        )
    locked = [
        p.final_url
        for p in ctx.pages
        if p.viewport
        and re.search(
            r"user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b", p.viewport
        )
    ]
    if locked:
        yield F(
            "zoom_disabled",
            "Viewport disables zoom (accessibility)",
            L,
            20,
            urls=locked,
        )


@check
def performance(ctx):
    slow = [p.final_url for p in ctx.pages if p.response_ms > 1500]
    if slow:
        yield F(
            "slow_ttfb",
            "Slow server responses (>1.5s)",
            M,
            21,
            category="performance",
            urls=slow,
            recommendation="Use page caching (LiteSpeed Cache/WP Rocket), a CDN and PHP 8.2+.",
        )
    heavy = [p.final_url for p in ctx.pages if p.html_bytes > 500_000]
    if heavy:
        yield F(
            "heavy_html",
            "Very large HTML documents (>500 KB)",
            L,
            21,
            category="performance",
            urls=heavy,
        )
    no_dims = [
        p.final_url
        for p in ctx.pages
        if any(not (i.width and i.height) for i in p.images)
    ]
    if no_dims:
        yield F(
            "img_no_dimensions",
            "Images without width/height (causes layout shift)",
            L,
            21,
            category="performance",
            urls=no_dims,
            recommendation="Set explicit width/height on images to protect CLS.",
        )
    for r in ctx.pagespeed:
        if r.get("error"):
            continue
        problems = []
        if (r.get("lcp_ms") or 0) > 2500:
            problems.append(f"LCP {r['lcp_ms'] / 1000:.1f}s (target < 2.5s)")
        if (r.get("cls") or 0) > 0.1:
            problems.append(f"CLS {r['cls']:.2f} (target < 0.1)")
        if (r.get("inp_ms") or 0) > 200:
            problems.append(f"INP {r['inp_ms']:.0f}ms (target < 200ms)")
        if (r.get("performance") or 100) < 50:
            problems.append(f"Lighthouse performance {r['performance']}")
        if problems:
            yield F(
                "core_web_vitals",
                "Core Web Vitals need work",
                H if len(problems) > 1 else M,
                21,
                category="performance",
                detail="; ".join(problems),
                urls=[r["url"]],
                recommendation="Convert images to WebP, defer JS, preload the LCP image, reserve ad slot space.",
            )


@check
def broken_links(ctx):
    broken = {
        p.url: p.status
        for p in ctx.crawl.pages.values()
        if p.status >= 400 or p.status == 0
    }
    if broken:
        sources = sorted(
            {src for u in broken for src in ctx.inbound.get(norm_url(u), set())}
        )
        yield F(
            "broken_internal",
            f"{len(broken)} broken internal URLs",
            H,
            22,
            detail="; ".join(f"{u} → {s}" for u, s in list(broken.items())[:20]),
            urls=sources or list(broken),
            recommendation="Fix or 301-redirect every internal 4xx/5xx (Redirection plugin).",
        )
    if ctx.crawl.not_found_probe_status == 200:
        yield F(
            "soft_404",
            "Unknown URLs return 200 instead of 404 (soft 404)",
            H,
            22,
            recommendation="Serve a real 404 status with a helpful 404 template.",
        )
    ext = [
        u
        for u, s in ctx.crawl.external_link_status.items()
        if s >= 400 and s not in (401, 403, 429, 999)
    ]
    if ext:
        yield F(
            "broken_external",
            f"{len(ext)} broken external links",
            L,
            22,
            urls=ext,
            recommendation="Replace dead citations with Wayback Machine archive links.",
        )
    crawled = {norm_url(p.final_url) for p in ctx.pages}
    orphans = [
        e.url
        for e in ctx.crawl.sitemap_entries
        if norm_url(e.url) in crawled
        and not ctx.inbound.get(norm_url(e.url))
        and ctx.home
        and norm_url(e.url) != norm_url(ctx.home.final_url)
    ]
    if orphans:
        yield F(
            "orphan_pages",
            "Orphan pages (in sitemap but not linked internally)",
            M,
            22,
            urls=orphans,
            recommendation="Link each from a category page, hub page or related article.",
        )
    if any("/uncategorized/" in l.url for p in ctx.pages for l in p.links):
        yield F(
            "uncategorized",
            "Posts filed under 'Uncategorized'",
            L,
            22,
            recommendation="Reassign posts to real categories and delete 'Uncategorized'.",
        )
    chains = [p.url for p in ctx.crawl.pages.values() if len(p.redirect_chain) > 2]
    if chains:
        yield F(
            "redirect_chains",
            "Redirect chains (more than one hop)",
            L,
            22,
            category="seo",
            urls=chains,
        )
