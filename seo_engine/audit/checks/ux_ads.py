"""Sections G/H — user experience and the ad environment (requirements 34–40)."""

from __future__ import annotations

from collections import defaultdict

from ..registry import H, I, L, M, check
from ..registry import finding as F
from ..signatures import (
    AD_CLICK_BAIT,
    BAD_AD_SIGNATURES,
    POPUP_SIGNATURES,
)


@check
def popups_autoplay(ctx):
    pop = [
        p.final_url
        for p in ctx.pages
        if any(s in " ".join(p.scripts).lower() for s in POPUP_SIGNATURES)
    ]
    if pop:
        yield F(
            "popup_plugins",
            "Pop-up/overlay scripts detected",
            H,
            34,
            urls=pop,
            recommendation="Deactivate pop-up plugins (OptinMonster, Popup Maker, Bloom) during review.",
        )
    auto = [p.final_url for p in ctx.pages if p.autoplay_media]
    if auto:
        yield F(
            "autoplay_media",
            "Auto-playing audio/video without mute",
            H,
            34,
            urls=auto,
            recommendation="Set embedded media to muted, no autoplay.",
        )


@check
def bad_ad_networks(ctx):
    hits = defaultdict(set)
    for p in ctx.pages:
        blob = (" ".join(p.scripts) + p.inline_script_sample).lower()
        for s in BAD_AD_SIGNATURES:
            if s in blob:
                hits[s].add(p.final_url)
    if hits:
        yield F(
            "bad_ad_networks",
            "Push-notification or low-quality ad scripts detected",
            H,
            35,
            detail=", ".join(sorted(hits)),
            urls=sorted({u for v in hits.values() for u in v}),
            recommendation="Remove third-party ad scripts and push prompts before applying.",
        )


@check
def accessibility(ctx):
    bad_h1 = [p.final_url for p in ctx.pages if len(p.h1) != 1]
    if bad_h1:
        yield F(
            "h1_count",
            "Pages without exactly one H1",
            M,
            36,
            category="seo",
            urls=bad_h1,
        )
    skips = []
    for p in ctx.pages:
        levels = [lv for lv, _ in p.headings]
        # advertools groups headings by level, so we can only detect missing intermediate levels
        present = sorted(set(levels))
        if present and any(b - a > 1 for a, b in zip(present, present[1:], strict=False)):
            skips.append(p.final_url)
    if skips:
        yield F(
            "heading_skip",
            "Heading levels are skipped (e.g. H1 → H3)",
            L,
            36,
            urls=skips,
        )
    no_lang = [p.final_url for p in ctx.pages if not p.lang]
    if no_lang:
        yield F(
            "no_lang",
            "Missing <html lang> attribute",
            M,
            36,
            urls=no_lang,
            fixable=True,
        )


@check
def adsense_code(ctx):
    with_code = [p for p in ctx.pages if any("adsbygoogle" in s for s in p.scripts)]
    in_head = [p for p in with_code if any("adsbygoogle" in s for s in p.head_scripts)]
    if not with_code:
        yield F(
            "no_adsense_code",
            "AdSense code not installed (add it when ready to apply)",
            I,
            38,
        )
        return
    if len(with_code) < len(ctx.pages) * 0.9:
        missing = [p.final_url for p in ctx.pages if p not in with_code]
        yield F(
            "adsense_partial",
            "AdSense code missing from some pages",
            H,
            38,
            urls=missing,
            recommendation="Insert the snippet sitewide via WPCode header or Site Kit; clear caches.",
        )
    body_only = [p.final_url for p in with_code if p not in in_head]
    if body_only:
        yield F(
            "adsense_in_body",
            "AdSense code is in <body>, not <head>",
            H,
            38,
            urls=body_only,
        )


@check
def ad_placement_language(ctx):
    bait = [p.final_url for p in ctx.pages if AD_CLICK_BAIT.search(p.text_excerpt)]
    if bait:
        yield F(
            "ad_click_bait",
            "Language that encourages ad clicks or misleading ad labels",
            H,
            40,
            urls=bait,
            recommendation="Remove 'click the ads'/'support us' language; use 'Advertisement' labels only.",
        )
