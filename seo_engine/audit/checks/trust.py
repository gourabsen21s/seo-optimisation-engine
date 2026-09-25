"""Section B — legal, trust and authority pages (requirements 5–12)."""

from __future__ import annotations

import re

from ..context import AuditContext, norm_url
from ..registry import C, H, L, M, check
from ..registry import finding as F
from ..signatures import (
    CMP_SIGNATURES,
    HEALTH_NICHE,
    PLACEHOLDER_RE,
)


@check
def privacy_policy(ctx: AuditContext):
    url, page = ctx.trust_pages["privacy"]
    if page is None or page.status != 200:
        yield F(
            "privacy_missing",
            "No Privacy Policy page found",
            C,
            5,
            recommendation="Publish /privacy-policy/ disclosing Google AdSense, cookies, DoubleClick and "
            "linking to Google's Ads Settings; link it in the footer.",
            fixable=True,
        )
        return
    text = page.text_excerpt.lower()
    missing = []
    if "google" not in text:
        missing.append("named disclosure of Google / AdSense")
    if "cookie" not in text:
        missing.append("cookies")
    if "doubleclick" not in text and "advertising cookie" not in text:
        missing.append("DoubleClick / Google advertising cookie")
    if not re.search(
        r"adssettings\.google|ads settings|myadcenter|google\.com/settings/ads", text
    ):
        missing.append("link to Google Ads Settings opt-out")
    if not re.search(
        r"last updated|effective (date|as of)|updated on|last modified", text
    ):
        missing.append("visible 'Last updated' date")
    if missing:
        yield F(
            "privacy_incomplete",
            "Privacy Policy is missing required AdSense disclosures",
            H,
            5,
            detail="Missing: " + "; ".join(missing),
            urls=[page.final_url],
            fixable=True,
            recommendation="Add the Google third-party vendor cookie paragraph, DoubleClick cookie, "
            "Ads Settings link and a dated 'Last updated' line.",
        )
    if PLACEHOLDER_RE.search(page.text_excerpt):
        yield F(
            "privacy_placeholder",
            "Privacy Policy contains template placeholders",
            H,
            5,
            detail=PLACEHOLDER_RE.search(page.text_excerpt).group(0),
            urls=[page.final_url],
            recommendation="Replace every [bracket] placeholder with real details.",
        )
    target = norm_url(page.final_url)
    without = [
        p.final_url
        for p in ctx.pages
        if not any(norm_url(l.url) == target for l in p.links)
    ]
    if len(without) > max(1, 0.1 * len(ctx.pages)):
        yield F(
            "privacy_not_linked",
            "Privacy Policy is not linked from every page",
            H,
            5,
            detail=f"{len(without)} of {len(ctx.pages)} pages have no link to it.",
            urls=without,
            recommendation="Add Privacy Policy to the footer menu so it's one click from every page.",
        )


@check
def consent_banner(ctx: AuditContext):
    blob = " ".join(
        " ".join(p.scripts) + p.inline_script_sample for p in ctx.pages[:30]
    ).lower()
    if not any(sig in blob for sig in CMP_SIGNATURES):
        yield F(
            "no_cmp",
            "No Google-certified consent banner (CMP) detected",
            H,
            6,
            recommendation="Install a TCF v2.2 CMP (Complianz, CookieYes, Cookiebot) or use AdSense's "
            "Privacy & messaging; enable Consent Mode v2 with Accept/Reject/Preferences.",
        )


def _trust_page_check(ctx, key, req, code, name, severity, min_words=0):
    url, page = ctx.trust_pages[key]
    if page is None or page.status != 200:
        yield F(
            f"{code}_missing",
            f"No {name} page found",
            severity,
            req,
            fixable=True,
            recommendation=f"Publish a {name} page and link it in the footer menu.",
        )
        return None
    if PLACEHOLDER_RE.search(page.text_excerpt):
        yield F(
            f"{code}_placeholder",
            f"{name} page contains template placeholders",
            H,
            req,
            urls=[page.final_url],
        )
    if min_words and page.word_count < min_words:
        yield F(
            f"{code}_thin",
            f"{name} page is thin ({page.word_count} words)",
            M,
            req,
            urls=[page.final_url],
            recommendation=f"Expand it to at least {min_words} words.",
        )
    return page


@check
def terms_page(ctx):
    yield from _trust_page_check(ctx, "terms", 7, "terms", "Terms of Use", M)


@check
def disclaimer_page(ctx):
    gen = _trust_page_check(ctx, "disclaimer", 8, "disclaimer", "Disclaimer", H)
    page = None
    try:
        while True:
            yield next(gen)
    except StopIteration as stop:
        page = stop.value
    health_hits = len(HEALTH_NICHE.findall(ctx.site_text_sample()))
    if (
        page is not None
        and health_hits > 15
        and "medical advice" not in page.text_excerpt.lower()
    ):
        yield F(
            "disclaimer_no_medical",
            "Health-adjacent site without a medical disclaimer",
            H,
            8,
            urls=[page.final_url],
            fixable=True,
            recommendation="State the site does not provide medical advice; readers should consult a "
            "physician; list contraindications. Add it to every practice post.",
        )


@check
def about_page(ctx):
    gen = _trust_page_check(ctx, "about", 9, "about", "About", H, min_words=500)
    page = None
    try:
        while True:
            yield next(gen)
    except StopIteration as stop:
        page = stop.value
    if page is not None and ctx.home is not None:
        target = norm_url(page.final_url)
        if not any(
            norm_url(l.url) == target and l.region in ("header", "nav")
            for l in ctx.home.links
        ):
            yield F(
                "about_not_in_header",
                "About page is not in the header menu",
                M,
                9,
                urls=[page.final_url],
                recommendation="Add About to the primary header menu, not only the footer.",
            )


@check
def contact_page(ctx):
    gen = _trust_page_check(ctx, "contact", 10, "contact", "Contact", H)
    page = None
    try:
        while True:
            yield next(gen)
    except StopIteration as stop:
        page = stop.value
    if page is None:
        return
    if not page.has_form:
        yield F(
            "contact_no_form",
            "Contact page has no form",
            M,
            10,
            urls=[page.final_url],
            recommendation="Add a working contact form (Fluent Forms/WPForms + WP Mail SMTP).",
        )
    if not page.emails:
        yield F(
            "contact_no_email",
            "Contact page has no visible email address",
            M,
            10,
            urls=[page.final_url],
            recommendation="Publish a direct email address plus city and country.",
        )


@check
def editorial_page(ctx):
    yield from _trust_page_check(
        ctx, "editorial", 11, "editorial", "Editorial Policy", L
    )


@check
def author_signals(ctx):
    missing, string_authors = [], []
    for p in ctx.articles:
        has_link = any("/author/" in l.url for l in p.links)
        schema_authors = [
            n.get("author")
            for n in p.schema_nodes("BlogPosting")
            + p.schema_nodes("Article")
            + p.schema_nodes("NewsArticle")
        ]
        if any(isinstance(a, str) for a in schema_authors):
            string_authors.append(p.final_url)
        if not has_link and not any(
            isinstance(a, (dict, list)) for a in schema_authors
        ):
            missing.append(p.final_url)
    if missing:
        yield F(
            "no_author",
            "Articles without a named author / author profile",
            M,
            12,
            urls=missing,
            detail=f"{len(missing)} of {len(ctx.articles)} articles.",
            recommendation="Show an author bio box linking to /author/<slug>/ and add Person schema.",
            fixable=True,
        )
    if string_authors:
        yield F(
            "author_string_schema",
            "Article schema 'author' is a plain string",
            M,
            23,
            urls=string_authors,
            recommendation="author must be a Person/Organization object.",
            fixable=True,
        )
