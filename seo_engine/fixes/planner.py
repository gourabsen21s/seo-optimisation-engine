"""Deterministic fix planner: findings + crawl + site profile → FixActions (no LLM needed)."""

from __future__ import annotations

import re
from urllib.parse import urlsplit

from ..audit.context import norm_url
from ..core.models import AuditReport, CrawlResult, PageData
from ..generators import legal, schema, site_files
from ..generators.profile import SiteProfile
from .models import FixAction, FixKind, Risk

TRUST_FINDING_TO_SLUG = {
    "privacy_missing": "privacy-policy",
    "terms_missing": "terms-of-use",
    "disclaimer_missing": "disclaimer",
    "about_missing": "about",
    "contact_missing": "contact",
    "editorial_missing": "editorial-policy",
}
MANUAL_CODES = {
    "home_noindex": "WordPress: Settings → Reading → untick 'Discourage search engines from indexing this site'.",
    "maintenance_mode": "Deactivate Coming Soon / Maintenance plugins and theme modes.",
    "not_https": "Install a TLS certificate (Let's Encrypt) and force HTTPS with a 301 redirect.",
    "http_no_redirect": "Add the HTTPS 301 rule to .htaccess or enable Cloudflare 'Always Use HTTPS'.",
    "mixed_content": "Run Better Search Replace: http://yourdomain → https://yourdomain (dry run first).",
    "multiple_domains": "301-redirect every http/https × www/non-www variant to the one canonical address.",
    "soft_404": "Make unknown URLs return HTTP 404 with a helpful 404 template.",
    "no_cmp": "Install Complianz (TCF v2.2 + Consent Mode v2) or publish AdSense's GDPR message.",
    "popup_plugins": "Deactivate pop-up plugins during AdSense review.",
    "bad_ad_networks": "Remove push-notification and third-party ad scripts before applying.",
    "indexable_archives": "Rank Math → Titles & Meta: set tag archives to noindex, disable date archives.",
    "attachment_pages": "Rank Math → General → Links → Redirect Attachments: ON.",
}


def auto_profile(profile: SiteProfile, crawl: CrawlResult, report: AuditReport | None = None) -> SiteProfile:
    """Fill blanks in the profile from what the crawl observed."""
    p = profile.model_copy(deep=True)
    home = next((pg for pg in crawl.html_pages() if pg.page_type == "home"), None)
    p.url = p.url or crawl.base_url
    if home:
        p.name = p.name or home.og.get("site_name") or re.split(r"\s[|\-–—:]\s", home.title or "")[-1].strip()
        p.description = p.description or (home.meta_description or "")
        p.language = p.language if profile.language != "en" or not home.lang else home.lang
    if not p.publisher_id:
        for pg in crawl.html_pages():
            m = next((re.search(r"ca-(pub-\d{10,20})", s) for s in pg.scripts if "ca-pub-" in s), None)
            if m:
                p.publisher_id = m.group(1)
                break
    if not p.email:
        emails = [e for pg in crawl.html_pages() for e in pg.emails
                  if e.split("@")[-1].removeprefix("www.") in (urlsplit(crawl.base_url).hostname or "")]
        p.email = emails[0] if emails else ""
    if any("wp-content" in s or "wp-includes" in s for pg in crawl.html_pages()[:5] for s in pg.scripts):
        p.platform = "wordpress"
    return p


def _page_by_url(crawl: CrawlResult) -> dict[str, PageData]:
    return {norm_url(p.final_url): p for p in crawl.html_pages()}


def plan_rule_fixes(report: AuditReport, crawl: CrawlResult, profile: SiteProfile) -> list[FixAction]:
    codes = {f.code: f for f in report.findings}
    pages = _page_by_url(crawl)
    home = next((p for p in crawl.html_pages() if p.page_type == "home"), None)
    fixes: list[FixAction] = []

    def add(**kw):
        fixes.append(FixAction(**kw))

    # -- site files
    robots_codes = [c for c in codes if c.startswith("robots_")]
    if robots_codes:
        sitemap = crawl.sitemap_urls_found[0] if crawl.sitemap_urls_found else None
        add(kind=FixKind.WRITE_FILE, title="Replace robots.txt with the AdSense-safe template",
            rationale="Findings: " + ", ".join(robots_codes) + ". Template allows Googlebot, Mediapartners-Google, "
                      "AdsBot and uploads, and lists the sitemap.",
            payload={"path": "robots.txt", "content": site_files.robots_txt(profile, sitemap),
                     "content_type": "text/plain", "previous": crawl.robots_txt},
            risk=Risk.REVIEW, requirement=17, finding_code=robots_codes[0])
    if profile.publisher_id and any(c in codes for c in ("ads_txt_missing", "ads_txt_wrong_pub", "ads_txt_plan")):
        add(kind=FixKind.WRITE_FILE, title=f"Publish ads.txt for {profile.publisher_id}",
            rationale="Authorises Google as a direct seller of your inventory.",
            payload={"path": "ads.txt", "content": site_files.ads_txt(profile.publisher_id, crawl.ads_txt),
                     "content_type": "text/plain"},
            risk=Risk.SAFE, requirement=19, finding_code="ads_txt_missing")
    if "no_llms_txt" in codes:
        add(kind=FixKind.WRITE_FILE, title="Publish /llms.txt for AI answer engines",
            payload={"path": "llms.txt", "content": site_files.llms_txt(profile, crawl), "content_type": "text/plain"},
            risk=Risk.SAFE, finding_code="no_llms_txt")
    if "no_sitemap" in codes:
        if profile.platform == "wordpress":
            add(kind=FixKind.MANUAL, title="Enable the XML sitemap in Rank Math or Yoast", requirement=15,
                payload={"instructions": "Rank Math → Modules → Sitemap ON; include images; exclude noindexed "
                                         "posts. Submit sitemap_index.xml in Search Console and Bing."},
                risk=Risk.REVIEW, finding_code="no_sitemap")
        else:
            add(kind=FixKind.WRITE_FILE, title="Generate sitemap.xml", requirement=15, finding_code="no_sitemap",
                payload={"path": "sitemap.xml", "content": site_files.sitemap_xml(crawl),
                         "content_type": "application/xml"}, risk=Risk.SAFE)

    # -- trust page drafts
    for code, slug in TRUST_FINDING_TO_SLUG.items():
        if code in codes:
            title, body = legal.legal_page(slug, profile)
            add(kind=FixKind.CREATE_PAGE, title=f"Create draft: {title}", requirement=legal.LEGAL_PAGES[slug][2],
                rationale="Created as a draft with [TODO] markers — review and publish, then link it in the footer.",
                payload={"slug": slug, "title": title, "html": body}, risk=Risk.SAFE, finding_code=code)
    if "privacy_incomplete" in codes and "privacy_missing" not in codes:
        title, body = legal.legal_page("privacy-policy", profile)
        add(kind=FixKind.CREATE_PAGE, title="Draft a compliant Privacy Policy to replace the current one",
            rationale=codes["privacy_incomplete"].detail, requirement=5, finding_code="privacy_incomplete",
            payload={"slug": "privacy-policy-updated", "title": title, "html": body}, risk=Risk.REVIEW)
    if "disclaimer_no_medical" in codes:
        health = profile.model_copy(update={"niche": "health"})
        title, body = legal.legal_page("disclaimer", health)
        add(kind=FixKind.CREATE_PAGE, title="Draft a Disclaimer with a medical disclaimer", requirement=8,
            payload={"slug": "disclaimer-updated", "title": title, "html": body}, risk=Risk.REVIEW,
            finding_code="disclaimer_no_medical")

    # -- structured data
    if home and profile.name:
        if "no_org_schema" in codes:
            add(kind=FixKind.ADD_JSON_LD, title="Add Organization schema sitewide", target_url=home.final_url,
                payload={"schema_type": "Organization", "schema": schema.organization_schema(profile), "sitewide": True},
                requirement=23, finding_code="no_org_schema")
        if "no_website_schema" in codes:
            add(kind=FixKind.ADD_JSON_LD, title="Add WebSite schema", target_url=home.final_url,
                payload={"schema_type": "WebSite", "schema": schema.website_schema(profile), "sitewide": True},
                requirement=23, finding_code="no_website_schema")
    article_codes = {"no_article_schema", "article_schema_incomplete", "author_string_schema"} & codes.keys()
    targets = {u for c in article_codes for u in codes[c].urls}
    for url in sorted(targets):
        page = pages.get(norm_url(url))
        if page:
            add(kind=FixKind.ADD_JSON_LD, title="Add complete BlogPosting schema", target_url=page.final_url,
                payload={"schema_type": "BlogPosting", "schema": schema.article_schema(page, profile)},
                requirement=23, finding_code=sorted(article_codes)[0])
    if "no_breadcrumbs" in codes:
        for url in codes["no_breadcrumbs"].urls:
            page = pages.get(norm_url(url))
            if page:
                add(kind=FixKind.ADD_JSON_LD, title="Add BreadcrumbList schema", target_url=page.final_url,
                    payload={"schema_type": "BreadcrumbList", "schema": schema.breadcrumb_schema(page, profile)},
                    requirement=25, finding_code="no_breadcrumbs")

    # -- simple head fixes
    for code, kind, title, payload_fn, req in (
        ("no_lang", FixKind.SET_LANG, "Set <html lang>", lambda pg: {"lang": profile.language or "en"}, 36),
        ("no_viewport", FixKind.ADD_VIEWPORT, "Add responsive viewport meta tag",
         lambda pg: {"viewport": "width=device-width, initial-scale=1"}, 20),
        ("missing_canonical", FixKind.SET_CANONICAL, "Add self-referencing canonical",
         lambda pg: {"canonical": pg.final_url}, 14),
    ):
        if code in codes:
            for url in codes[code].urls:
                page = pages.get(norm_url(url))
                if page:
                    add(kind=kind, title=title, target_url=page.final_url, payload=payload_fn(page), requirement=req,
                        finding_code=code)

    # -- manual items for things only a human/admin panel can change
    for code, instructions in MANUAL_CODES.items():
        if code in codes:
            f = codes[code]
            add(kind=FixKind.MANUAL, title=f.title, payload={"instructions": instructions, "urls": f.urls[:20]},
                requirement=f.requirement, finding_code=code, risk=Risk.REVIEW)
    return dedupe(fixes)


def dedupe(fixes: list[FixAction]) -> list[FixAction]:
    seen: dict[str, FixAction] = {}
    for f in fixes:
        seen.setdefault(f.dedupe_key(), f)
    return list(seen.values())


def pages_needing_copy(report: AuditReport, crawl: CrawlResult, limit: int) -> list[PageData]:
    """Pages whose title, meta description, OG tags or image alts should be (re)written."""
    codes = {"missing_title", "title_length", "missing_meta_description", "meta_description_length",
             "duplicate_title", "duplicate_meta_description", "img_no_alt", "missing_open_graph"}
    urls: dict[str, int] = {}
    for f in report.findings:
        if f.code in codes:
            for u in f.urls:
                urls[norm_url(u)] = urls.get(norm_url(u), 0) + 1
    pages = _page_by_url(crawl)
    ranked = sorted((u for u in urls if u in pages and pages[u].indexable),
                    key=lambda u: (-urls[u], pages[u].page_type != "home", -pages[u].word_count))
    return [pages[u] for u in ranked[:limit]]


def heuristic_copy(page: PageData, profile: SiteProfile) -> list[FixAction]:
    """Fallback copy when no LLM is configured: derived from the page's own H1 and first sentences."""
    out = []
    base_title = page.h1[0] if page.h1 else (page.title or "")
    if base_title and (not page.title or not 30 <= len(page.title) <= 60):
        suffix = f" | {profile.name}" if profile.name and len(base_title) + len(profile.name) + 3 <= 60 else ""
        out.append(FixAction(kind=FixKind.SET_TITLE, title="Rewrite title", target_url=page.final_url,
                             payload={"title": (base_title[:57] + "…" if len(base_title) > 60 else base_title) + suffix,
                                      "previous": page.title},
                             risk=Risk.REVIEW, finding_code="title_length"))
    if not page.meta_description or not 70 <= len(page.meta_description) <= 160:
        text = page.text_excerpt
        sentences = re.split(r"(?<=[.!?])\s+", text)
        desc = ""
        for s in sentences:
            if len(desc) + len(s) > 155:
                break
            desc = f"{desc} {s}".strip()
        desc = desc or text[:152].rsplit(" ", 1)[0] + "…"
        if len(desc) >= 50:
            out.append(FixAction(kind=FixKind.SET_META_DESCRIPTION, title="Write meta description",
                                 target_url=page.final_url, payload={"meta_description": desc,
                                                                     "previous": page.meta_description},
                                 risk=Risk.REVIEW, finding_code="missing_meta_description"))
    alts = []
    for img in page.images:
        if not (img.alt or "").strip():
            stem = re.sub(r"[-_]+", " ", urlsplit(img.src).path.rsplit("/", 1)[-1].rsplit(".", 1)[0])
            stem = re.sub(r"\b\d{2,}\b|\bscaled\b|\d+x\d+", "", stem).strip()
            if len(stem) > 3:
                alts.append({"src": img.src, "alt": stem.capitalize()})
    if alts:
        out.append(FixAction(kind=FixKind.SET_IMAGE_ALT, title=f"Add alt text to {len(alts)} images",
                             target_url=page.final_url, payload={"alts": alts}, risk=Risk.REVIEW,
                             finding_code="img_no_alt", requirement=30))
    return out
