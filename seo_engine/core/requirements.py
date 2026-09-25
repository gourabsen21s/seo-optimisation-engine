"""Catalog of the 40 AdSense/quality requirements from the AdSense Approval Manual (2026).

Each requirement is either checked automatically by the crawler/checks, or listed as a
manual verification item with instructions on how to verify it.
"""

from dataclasses import dataclass
from enum import StrEnum


class Level(StrEnum):
    MANDATORY = "mandatory"
    STRONGLY_ADVISED = "strongly_advised"
    RECOMMENDED = "recommended"


LEVEL_WEIGHT = {Level.MANDATORY: 3, Level.STRONGLY_ADVISED: 2, Level.RECOMMENDED: 1}


@dataclass(frozen=True)
class Requirement:
    id: int
    section: str
    title: str
    level: Level
    automated: bool
    verify: str


SECTIONS = {
    "A": "Account & Ownership Eligibility",
    "B": "Legal, Trust & Authority Pages",
    "C": "Technical Foundation",
    "D": "Structured Data",
    "E": "Navigation & Site Architecture",
    "F": "Content Standards",
    "G": "User Experience & Ad Environment",
    "H": "Application & Post-Approval",
}

M, S, R = Level.MANDATORY, Level.STRONGLY_ADVISED, Level.RECOMMENDED

REQUIREMENTS: dict[int, Requirement] = {
    r.id: r
    for r in [
        Requirement(1, "A", "Account holder 18+, one AdSense account only", M, False,
                    "AdSense → Payments info: legal name matches bank/PAN; no second account."),
        Requirement(2, "A", "Own the domain on a top-level domain", M, True,
                    "Confirm self-hosted on your own domain with file and DNS access."),
        Requirement(3, "A", "Site live, public and fully crawlable", M, True,
                    "Incognito on mobile data; GSC URL Inspection → Test Live URL."),
        Requirement(4, "A", "Domain age and steady publishing history", S, False,
                    "GSC → Performance shows non-zero impressions over the last 28 days."),
        Requirement(5, "B", "Privacy Policy with Google & cookie disclosure", M, True,
                    "Open the live page; confirm Google, cookies, DoubleClick, Ads Settings link, date."),
        Requirement(6, "B", "Cookie consent banner (Google-certified CMP, TCF v2.2)", M, True,
                    "Incognito + EU VPN: banner with Accept / Reject / Preferences appears first."),
        Requirement(7, "B", "Terms of Use page", S, True, "Linked in footer."),
        Requirement(8, "B", "Niche-specific Disclaimer page", M, True,
                    "Open the page; medical disclaimer on health/practice posts."),
        Requirement(9, "B", "Substantial About page (500+ words) in header menu", M, True,
                    "Real name, photo, credentials, editorial standards."),
        Requirement(10, "B", "Contact page with working form and email address", M, True,
                    "Send a test message from an outside account; check it arrives."),
        Requirement(11, "B", "Editorial policy / sourcing / corrections page", R, True,
                    "Linked from footer and author box; includes AI policy."),
        Requirement(12, "B", "Author bio boxes and author archives (E-E-A-T)", S, True,
                    "Visit /author/<slug>/; bio + photo on every post."),
        Requirement(13, "C", "HTTPS sitewide, no mixed content", M, True,
                    "DevTools console on 3 pages shows zero mixed-content warnings."),
        Requirement(14, "C", "One canonical domain, one canonical URL per page", M, True,
                    "All 4 URL variants 301 to one address; self-referencing canonicals."),
        Requirement(15, "C", "Valid XML sitemap submitted to Search Console", M, True,
                    "GSC → Sitemaps status Success."),
        Requirement(16, "C", "Human-readable HTML sitemap page", R, True, "/sitemap/ linked in footer."),
        Requirement(17, "C", "robots.txt does not block Google crawlers", M, True,
                    "No 'Disallow: /' for *, Mediapartners-Google allowed."),
        Requirement(18, "C", "Search Console verified; 80%+ URLs indexed", S, False,
                    "GSC → Pages: most URLs under Indexed, not 'Crawled – currently not indexed'."),
        Requirement(19, "C", "ads.txt at document root", M, True,
                    "https://domain/ads.txt renders as text/plain with your pub ID."),
        Requirement(20, "C", "Genuine mobile responsiveness", M, True,
                    "Real phone: no horizontal scroll, menu works, 16px+ text."),
        Requirement(21, "C", "Core Web Vitals and page speed", S, True,
                    "PageSpeed Insights mobile: LCP < 2.5s, INP < 200ms, CLS < 0.1."),
        Requirement(22, "C", "Zero broken links, real 404 page, no orphans", M, True,
                    "Full crawl: no internal 4xx/5xx, unknown URLs return 404."),
        Requirement(23, "D", "Structured data (JSON-LD) across the site", R, True,
                    "Rich Results Test on home, article, category and static page."),
        Requirement(24, "E", "Clear primary menu and real category structure", M, True,
                    "Homepage menu ≤ 7 items; populated categories."),
        Requirement(25, "E", "Breadcrumb navigation on posts and pages", R, True,
                    "BreadcrumbList schema validates in Rich Results Test."),
        Requirement(26, "E", "Internal linking, related posts, search", S, True,
                    "3–6 contextual internal links per article; working search."),
        Requirement(27, "F", "Sufficient content volume", M, True,
                    "25+ substantial articles; 3+ pillar guides of 2,500+ words."),
        Requirement(28, "F", "Original content and honest AI policy", M, False,
                    "Copyscape/plagiarism check < 5% match; AI policy published."),
        Requirement(29, "F", "No thin, duplicate, placeholder or demo pages", M, True,
                    "No 'Hello world!', 'Sample Page', lorem ipsum, or posts under 700 words."),
        Requirement(30, "F", "Image licensing, attribution and optimisation", M, True,
                    "Every image has alt text, a known licensed source and dimensions."),
        Requirement(31, "F", "No prohibited or restricted content", M, True,
                    "Manual read-through against Google Publisher Policies."),
        Requirement(32, "F", "Taxonomy hygiene (tags, date archives)", S, True,
                    "Tag/date archives noindexed; tags pruned."),
        Requirement(33, "F", "Publishing consistency and freshness", R, True,
                    "Most recent post within the last 7 days."),
        Requirement(34, "G", "Better Ads Standards (no pop-ups, autoplay)", M, True,
                    "Fresh incognito mobile session: nothing covers the article."),
        Requirement(35, "G", "No low-quality ad networks or push prompts", S, True,
                    "View source: no third-party ad scripts or push-notification SDKs."),
        Requirement(36, "G", "Readability and accessibility", R, True,
                    "Lighthouse Accessibility 90+; one H1; heading order; contrast 4.5:1."),
        Requirement(37, "G", "Legitimate traffic only", M, False,
                    "Never buy traffic; internal traffic filtered in GA4."),
        Requirement(38, "H", "AdSense code in <head> of every page", M, True,
                    "View source on 3 pages: adsbygoogle + ca-pub ID in <head>."),
        Requirement(39, "H", "Privacy & messaging configured in AdSense", M, False,
                    "AdSense → Privacy & messaging: GDPR + US states messages published."),
        Requirement(40, "H", "Ongoing ad placement policy compliance", M, True,
                    "No 'click the ads' language; permitted ad labels only; weekly Policy Center."),
    ]
}
