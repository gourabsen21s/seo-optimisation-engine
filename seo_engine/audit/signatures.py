"""Detection patterns and third-party script signatures used by checks."""

import re

TRUST_PATTERNS = {
    "privacy": re.compile(r"privacy", re.I),
    "terms": re.compile(r"terms|conditions|\btos\b", re.I),
    "disclaimer": re.compile(r"disclaimer", re.I),
    "about": re.compile(r"\babout", re.I),
    "contact": re.compile(r"contact", re.I),
    "editorial": re.compile(r"editorial|standards|corrections|fact.?check", re.I),
    "html_sitemap": re.compile(r"sitemap", re.I),
}


CMP_SIGNATURES = ["complianz", "cookieyes", "cookiebot", "cookie-law-info", "fundingchoicesmessages", "__tcfapi",
                  "onetrust", "quantcast", "usercentrics", "iubenda", "termly", "osano", "didomi", "cookie-notice",
                  "consentmanager", "cmp.js"]


POPUP_SIGNATURES = ["optinmonster", "popup-maker", "popupmaker", "bloom", "sumo.com", "hellobar", "convertpro",
                    "popupally", "optincat", "convertbox", "poptin"]


BAD_AD_SIGNATURES = ["onesignal", "pushengage", "propellerads", "popads", "adsterra", "popcash", "monetag",
                     "hilltopads", "exoclick", "juicyads", "pushcrew", "izooto", "webpushr", "pushnami",
                     "clickadu", "richpush", "a-ads.com"]


MAINTENANCE_RE = re.compile(r"coming soon|under construction|maintenance mode|site is under maintenance", re.I)


PLACEHOLDER_RE = re.compile(r"\[(?:your|site|company|email|name|date|insert|website|address)[^\]]{0,40}\]|lorem ipsum",
                            re.I)


DEMO_TITLES = re.compile(r"^(hello world!?|sample page|just another wordpress site)", re.I)


RISKY_PHRASES = re.compile(
    r"\b(cures? (?:diabetes|cancer|hypertension|thyroid)|reverses? (?:diabetes|hypertension|aging)|"
    r"burns? belly fat|guaranteed (?:results|cure|income|win)|lose \d+ ?(?:kg|lbs|pounds) in \d+ days|"
    r"online casino|sports betting|buy followers)\b", re.I)


AD_CLICK_BAIT = re.compile(r"click (?:on )?(?:the |our )?ads|support us by clicking|top offers|favou?rite sites",
                           re.I)


HEALTH_NICHE = re.compile(r"\b(yoga|asana|pranayama|ayurved\w*|diet|fitness|weight loss|medical|disease|symptom\w*|"
                          r"supplement\w*|health)\b", re.I)


ADSENSE_CLIENT = re.compile(r"ca-pub-\d{10,20}")
