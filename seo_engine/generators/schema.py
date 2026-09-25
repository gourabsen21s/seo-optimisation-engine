"""JSON-LD builders following the manual's schema library (Part II)."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import urljoin, urlsplit

from ..core.models import PageData
from .profile import SiteProfile


def _clean(d: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in d.items() if v not in (None, "", [], {})}


def organization_schema(p: SiteProfile) -> dict:
    address = _clean({"@type": "PostalAddress", "addressLocality": p.city, "addressRegion": p.region,
                      "addressCountry": p.country_code or p.country})
    return _clean({
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": f"{p.base}#organization",
        "name": p.name,
        "url": p.base,
        "logo": _clean({"@type": "ImageObject", "@id": f"{p.base}#logo", "url": p.logo_url}) if p.logo_url else None,
        "description": p.description,
        "foundingDate": p.founding_year,
        "email": p.email,
        "publishingPrinciples": urljoin(p.base, "editorial-policy/"),
        "address": address if len(address) > 1 else None,
        "sameAs": p.social_links,
    })


def website_schema(p: SiteProfile) -> dict:
    search = urljoin(p.base, "?s={search_term_string}") if p.platform == "wordpress" else None
    return _clean({
        "@context": "https://schema.org",
        "@type": "WebSite",
        "@id": f"{p.base}#website",
        "url": p.base,
        "name": p.name,
        "description": p.description,
        "publisher": {"@id": f"{p.base}#organization"},
        "inLanguage": p.language,
        "potentialAction": {
            "@type": "SearchAction",
            "target": {"@type": "EntryPoint", "urlTemplate": search},
            "query-input": "required name=search_term_string",
        } if search else None,
    })


def person_schema(p: SiteProfile) -> dict:
    return _clean({
        "@context": "https://schema.org",
        "@type": "Person",
        "@id": f"{p.base}#author",
        "name": p.author_name or p.owner_name,
        "url": p.author_url,
        "image": p.author_image,
        "description": p.author_bio,
        "worksFor": {"@id": f"{p.base}#organization"},
        "sameAs": p.social_links,
    })


def article_schema(page: PageData, p: SiteProfile, section: str | None = None) -> dict:
    image = next((i for i in page.images if i.src.startswith("http")), None)
    return _clean({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "@id": f"{page.final_url}#article",
        "isPartOf": {"@id": f"{p.base}#website"},
        "headline": (page.h1[0] if page.h1 else page.title or "")[:110],
        "description": page.meta_description,
        "articleSection": section,
        "wordCount": page.word_count,
        "inLanguage": page.lang or p.language,
        "datePublished": page.published_time,
        "dateModified": page.modified_time or page.published_time,
        "author": {"@id": f"{p.base}#author"} if (p.author_name or p.owner_name) else None,
        "publisher": {"@id": f"{p.base}#organization"},
        "mainEntityOfPage": {"@id": page.final_url},
        "image": _clean({"@type": "ImageObject", "url": image.src, "width": image.width, "height": image.height})
        if image else None,
    })


def breadcrumb_schema(page: PageData, p: SiteProfile) -> dict:
    parts = [s for s in urlsplit(page.final_url).path.split("/") if s]
    items = [{"@type": "ListItem", "position": 1, "name": "Home", "item": p.base}]
    for i, seg in enumerate(parts[:-1], start=2):
        items.append({"@type": "ListItem", "position": i, "name": seg.replace("-", " ").title(),
                      "item": urljoin(p.base, "/".join(parts[: i - 1]) + "/")})
    items.append({"@type": "ListItem", "position": len(items) + 1,
                  "name": (page.h1[0] if page.h1 else page.title or parts[-1] if parts else "Page")[:80]})
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "@id": f"{page.final_url}#breadcrumb",
            "itemListElement": items}


def jsonld_script(data: dict | list) -> str:
    body = json.dumps(data, ensure_ascii=False, indent=2).replace("</", "<\\/")
    return f'<script type="application/ld+json">\n{body}\n</script>'
