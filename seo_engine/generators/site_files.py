"""robots.txt, ads.txt, llms.txt and sitemap.xml generators (AdSense manual, Part III)."""

from __future__ import annotations

from urllib.parse import urljoin
from xml.sax.saxutils import escape

from ..core.models import CrawlResult
from .profile import SiteProfile

ADSENSE_TAG_ID = "f08c47fec0942fa0"


def robots_txt(profile: SiteProfile, sitemap_url: str | None = None) -> str:
    sitemap_url = sitemap_url or urljoin(profile.base, "sitemap_index.xml" if profile.platform == "wordpress" else "sitemap.xml")
    lines = ["# ---- Default rules for all crawlers ----", "User-agent: *", "Allow: /"]
    if profile.platform == "wordpress":
        lines += ["Disallow: /wp-admin/", "Allow: /wp-admin/admin-ajax.php", "Disallow: /wp-login.php",
                  "Disallow: /xmlrpc.php", "Disallow: /readme.html", "Disallow: /?s=", "Disallow: /search/",
                  "Disallow: /*?replytocom=", "Disallow: /*?add-to-cart=", "Disallow: /cgi-bin/",
                  "Disallow: /trackback/", "Disallow: /*/feed/$"]
    else:
        lines += ["Disallow: /search", "Disallow: /*?s="]
    lines += ["", "# ---- Google AdSense contextual crawler: must be allowed ----",
              "User-agent: Mediapartners-Google", "Allow: /", "",
              "# ---- Google Ads landing-page quality crawlers ----",
              "User-agent: AdsBot-Google", "Allow: /", "", "User-agent: AdsBot-Google-Mobile", "Allow: /", ""]
    if profile.platform == "wordpress":
        lines += ["# ---- Image crawler: keep uploads open ----", "User-agent: Googlebot-Image",
                  "Allow: /wp-content/uploads/", ""]
    lines += ["# ---- Aggressive SEO scrapers ----", "User-agent: AhrefsBot", "Crawl-delay: 10", "",
              "User-agent: SemrushBot", "Crawl-delay: 10", ""]
    if profile.block_ai_training:
        lines += ["# ---- Block AI training crawlers (does not affect Search or AdSense) ----"]
        for bot in ("GPTBot", "CCBot", "Google-Extended", "ClaudeBot"):
            lines += [f"User-agent: {bot}", "Disallow: /", ""]
    lines += ["# ---- Sitemaps ----", f"Sitemap: {sitemap_url}", ""]
    return "\n".join(lines)


def ads_txt(publisher_id: str, existing: str | None = None) -> str:
    pub = publisher_id.strip().removeprefix("ca-")
    if not pub.startswith("pub-"):
        raise ValueError("publisher_id must look like pub-0000000000000000")
    record = f"google.com, {pub}, DIRECT, {ADSENSE_TAG_ID}"
    if existing and pub in existing:
        return existing
    body = (existing.rstrip() + "\n") if existing else "# ads.txt — authorised digital sellers\n"
    return body + record + "\n"


def llms_txt(profile: SiteProfile, crawl: CrawlResult) -> str:
    pages = [p for p in crawl.html_pages() if p.indexable]
    guides = sorted((p for p in pages if p.page_type == "article"), key=lambda p: -p.word_count)[:10]
    trust = [p for p in pages if any(k in p.final_url.lower() for k in ("about", "editorial", "contact", "privacy"))]
    out = [f"# {profile.name or crawl.base_url}", ""]
    if profile.description:
        out += [f"> {profile.description}", ""]
    if guides:
        out += ["## Core guides"]
        out += [f"- [{p.title or p.final_url}]({p.final_url}): {(p.meta_description or '').strip()}" for p in guides]
        out.append("")
    if trust:
        out += ["## Editorial"] + [f"- [{p.title or p.final_url}]({p.final_url})" for p in trust] + [""]
    return "\n".join(out)


def sitemap_xml(crawl: CrawlResult) -> str:
    """Flat sitemap for static sites: only canonical, indexable, 200-status HTML pages."""
    rows = []
    for p in crawl.html_pages():
        if not p.indexable or (p.canonical and p.canonical.rstrip("/") != p.final_url.rstrip("/")):
            continue
        lastmod = (p.modified_time or p.published_time or "")[:10]
        imgs = "".join(f"<image:image><image:loc>{escape(i.src)}</image:loc></image:image>"
                       for i in p.images[:5] if i.src.startswith("http"))
        rows.append(f"  <url><loc>{escape(p.final_url)}</loc>"
                    + (f"<lastmod>{lastmod}</lastmod>" if lastmod else "") + imgs + "</url>")
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
            'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' + "\n".join(rows) + "\n</urlset>\n")
