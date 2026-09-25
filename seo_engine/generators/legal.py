"""Legal and trust page drafts. Always published as drafts for human review."""

from __future__ import annotations

import html
from datetime import UTC, date, datetime

from .profile import SiteProfile


def _p(text: str) -> str:
    return f"<p>{text}</p>"


def _todo(label: str) -> str:
    return f'<mark data-seo-engine-todo="true">[TODO: {html.escape(label)}]</mark>'


def _f(value: str, label: str) -> str:
    return html.escape(value) if value else _todo(label)


def privacy_policy_html(p: SiteProfile) -> str:
    today = date.today().strftime("%d %B %Y")
    name, email = _f(p.name, "site name"), _f(p.email, "contact email")
    where = ", ".join(x for x in (p.city, p.country) if x) or "your city and country"
    return "\n".join([
        f"<p><strong>Last updated:</strong> {today}</p>",
        "<h2>Who we are</h2>",
        _p(f"{name} ({html.escape(p.base)}) is operated by {_f(p.owner_name, 'legal name')}, based in "
           f"{html.escape(where)}. You can reach us at {email}."),
        "<h2>What data we collect</h2>",
        _p("When you leave a comment, submit our contact form or subscribe to our newsletter we collect the "
           "information you provide (such as your name and email address). Like most websites we also receive "
           "technical data automatically: IP address, browser and device type, pages visited and referring "
           "pages, and analytics identifiers."),
        "<h2>Cookies</h2>",
        _p("We use <strong>essential cookies</strong> needed for the site to work, <strong>analytics "
           "cookies</strong> that help us understand how the site is used, and <strong>advertising "
           "cookies</strong> used to serve and measure ads. Essential cookies last for your session; analytics "
           "and advertising cookies can last up to 13 months. You can control cookies through our consent "
           "banner and your browser settings."),
        "<h2>Third-party advertising (Google AdSense)</h2>",
        _p("We use Google AdSense to display advertisements. Third-party vendors, including Google, use "
           "cookies to serve ads based on your prior visits to this website and other websites. Google's use of "
           "advertising cookies, including the DoubleClick cookie, enables it and its partners to serve ads to "
           "you based on your visits to this site and/or other sites on the Internet. Third parties may place "
           "and read cookies on your browser, or use web beacons and IP addresses to collect information as a "
           "result of ad serving on this website."),
        _p('You may opt out of personalised advertising by visiting <a href="https://adssettings.google.com" '
           'rel="nofollow noopener">Google Ads Settings</a>. You can also opt out of some third-party vendors\' '
           'use of cookies for personalised advertising at <a href="https://www.aboutads.info/choices/" '
           'rel="nofollow noopener">aboutads.info</a>. Learn more in '
           '<a href="https://policies.google.com/technologies/ads" rel="nofollow noopener">how Google uses '
           'information from sites that use its services</a>.'),
        "<h2>Analytics</h2>",
        _p('We use Google Analytics 4 to measure traffic and engagement. GA4 does not log or store IP addresses. '
           'You can opt out with the <a href="https://tools.google.com/dlpage/gaoptout" rel="nofollow noopener">'
           'Google Analytics opt-out browser add-on</a>.'),
        "<h2>Legal bases and your rights</h2>",
        _p("Where the GDPR applies we process personal data on the basis of your consent (advertising and "
           "analytics cookies) and our legitimate interests (site security and essential functionality). You "
           "have the right to access, correct, delete, restrict or port your data and to withdraw consent at "
           "any time. California residents may exercise CCPA/CPRA rights, including the right to opt out of the "
           "'sale' or 'sharing' of personal information. Under India's Digital Personal Data Protection Act "
           f"2023 you have the rights to notice, correction and erasure. To exercise any right, email {email}."),
        "<h2>Children</h2>",
        _p("This site is not directed at children under 13 (or under 18 where the DPDP Act applies) and we do "
           "not knowingly collect their personal data."),
        "<h2>Data retention and security</h2>",
        _p("Comments are kept until you ask us to remove them; contact-form messages are kept for up to 24 "
           "months; server logs are kept for up to 90 days. We protect data with HTTPS, access controls and "
           "reputable hosting providers."),
        "<h2>Changes to this policy</h2>",
        _p("We will update the 'Last updated' date above whenever this policy changes."),
    ])


def terms_html(p: SiteProfile) -> str:
    law = ", ".join(x for x in (p.city, p.country) if x) or "your jurisdiction"
    return "\n".join([
        f"<p><strong>Last updated:</strong> {date.today().strftime('%d %B %Y')}</p>",
        "<h2>Acceptance of terms</h2>", _p(f"By using {_f(p.name, 'site name')} you agree to these terms."),
        "<h2>Intellectual property</h2>",
        _p("All articles, images and other original content are owned by us or our licensors. Reproduction "
           "requires prior written permission; brief quotation with attribution and a link is welcome."),
        "<h2>Acceptable use and comments</h2>",
        _p("You agree not to misuse the site. We moderate comments and may remove any that are spam, abusive, "
           "hateful or off-topic."),
        "<h2>Third-party links</h2>", _p("We are not responsible for the content of external websites we link to."),
        "<h2>Limitation of liability</h2>",
        _p("Content is provided 'as is' for general information. To the extent permitted by law we are not "
           "liable for losses arising from its use."),
        "<h2>Copyright complaints (DMCA)</h2>",
        _p(f"If you believe content on this site infringes your copyright, email {_f(p.email, 'contact email')} "
           "with the URL, the work concerned and proof of ownership."),
        "<h2>Governing law</h2>", _p(f"These terms are governed by the laws and courts of {html.escape(law)}."),
    ])


def disclaimer_html(p: SiteProfile) -> str:
    parts = [
        f"<p><strong>Last updated:</strong> {date.today().strftime('%d %B %Y')}</p>",
        "<h2>Educational content</h2>",
        _p("Articles are written for education and general information. Where topics are contested we present "
           "the scholarly consensus with sources, and we welcome corrections."),
    ]
    if p.niche == "health":
        parts += [
            "<h2>Medical disclaimer</h2>",
            _p("This site does not provide medical advice, diagnosis or treatment. Always consult a qualified "
               "physician before beginning any exercise, breathing, dietary or wellness practice — particularly "
               "if you are pregnant or have hypertension, glaucoma, a cardiac condition, recent surgery or a "
               "spinal injury. Some practices (including inversions and certain breathing techniques) carry "
               "specific contraindications. You assume full responsibility for your own practice."),
        ]
    if p.niche == "finance":
        parts += ["<h2>Financial disclaimer</h2>",
                  _p("Nothing on this site is financial, investment or tax advice. Consult a licensed adviser.")]
    parts += [
        "<h2>Affiliate disclosure</h2>",
        _p("Some links may be affiliate links. If you buy through them we may earn a commission at no extra "
           "cost to you. We only recommend products we believe are useful."),
        "<h2>Advertising</h2>", _p("This site displays ads served by Google AdSense; advertisers do not influence "
                                   "our editorial content."),
    ]
    return "\n".join(parts)


def editorial_policy_html(p: SiteProfile) -> str:
    return "\n".join([
        "<h2>How we research</h2>",
        _p("Every article is researched from primary sources and reputable scholarship. Our source hierarchy: "
           "primary texts and translations; peer-reviewed research; museum and institutional sources; then "
           "high-quality secondary writing. We cite our sources in each article."),
        "<h2>Opinion and consensus</h2>",
        _p("We clearly distinguish established consensus from interpretation and label contested claims."),
        "<h2>Use of AI tools</h2>",
        _p("Drafting tools may assist with research and structuring, but every article is written, fact-checked "
           f"and edited by a named human author{(' — ' + html.escape(p.author_name)) if p.author_name else ''}."),
        "<h2>Corrections</h2>",
        _p(f"Spotted an error? Email {_f(p.email, 'contact email')}. We date and annotate corrections rather than "
           "silently editing."),
    ])


def about_html(p: SiteProfile) -> str:
    return "\n".join([
        _p(f"{_f(p.description, 'one paragraph on what readers get here that they cannot get elsewhere')}"),
        "<h2>Who writes this</h2>",
        _p(f"{_f(p.author_name or p.owner_name, 'author name')} — {_f(p.author_bio, 'background, credentials and published work')}"),
        _todo("add a real photograph of the author"),
        "<h2>Our editorial standards</h2>",
        _p('Read our <a href="/editorial-policy/">editorial policy</a> to see how we research, cite and correct.'),
        "<h2>Get in touch</h2>",
        _p(f'Email {_f(p.email, "contact email")} or use our <a href="/contact/">contact page</a>.'),
        _todo("expand this page to 500–900 words; link your social and publishing profiles"),
    ])


def contact_html(p: SiteProfile) -> str:
    where = ", ".join(x for x in (p.city, p.country) if x)
    return "\n".join([
        _p(f"Email: <a href=\"mailto:{html.escape(p.email)}\">{html.escape(p.email)}</a>" if p.email else _todo("contact email")),
        _p(f"Location: {html.escape(where)}" if where else _todo("city and country")),
        _p("We usually reply within 2 business days."),
        _todo("embed a working contact form (Fluent Forms / WPForms) with a Privacy Policy consent checkbox"),
    ])


LEGAL_PAGES = {
    "privacy-policy": ("Privacy Policy", privacy_policy_html, 5),
    "terms-of-use": ("Terms of Use", terms_html, 7),
    "disclaimer": ("Disclaimer", disclaimer_html, 8),
    "about": ("About", about_html, 9),
    "contact": ("Contact", contact_html, 10),
    "editorial-policy": ("Editorial Policy", editorial_policy_html, 11),
}


def legal_page(slug: str, profile: SiteProfile) -> tuple[str, str]:
    title, fn, _ = LEGAL_PAGES[slug]
    return title, fn(profile)


def standalone_html(title: str, body: str, profile: SiteProfile) -> str:
    """Wrap a draft in a minimal HTML document for static sites."""
    return f"""<!doctype html>
<html lang="{html.escape(profile.language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)} | {html.escape(profile.name)}</title>
<meta name="robots" content="noindex">
</head>
<body>
<main>
<h1>{html.escape(title)}</h1>
{body}
</main>
<!-- Generated by seo-engine {datetime.now(UTC).isoformat(timespec="seconds")} — review, remove the
noindex tag and every [TODO] before publishing. -->
</body>
</html>
"""
