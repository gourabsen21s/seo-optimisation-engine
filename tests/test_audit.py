from seo_engine.audit.checks.trust import privacy_policy
from seo_engine.audit.context import AuditContext
from seo_engine.audit.scoring import requirement_results, seo_score
from seo_engine.core.models import CrawlResult, Finding, LinkInfo, PageData, RequirementStatus, Severity
from seo_engine.generators import SiteProfile
from seo_engine.generators.legal import privacy_policy_html


async def test_crawl_extracts_page_data(audited):
    _, crawl = audited
    home = crawl.pages["http://127.0.0.1:8765/"]
    assert home.page_type == "home"
    assert home.title == "Tales Test Site"
    assert any(l.region == "footer" and l.url.endswith("/privacy-policy/") for l in home.links)
    assert "WebSite" in home.schema_types()
    assert any("adsbygoogle" in s for s in home.head_scripts)
    post = crawl.pages["http://127.0.0.1:8765/blog/first-post/"]
    assert post.page_type == "article" and post.autoplay_media
    assert crawl.robots_txt.startswith("User-agent: *")
    assert len(crawl.sitemap_entries) == 3


async def test_audit_flags_manual_requirements(audited):
    report, _ = audited
    codes = {f.code for f in report.findings}
    expected = {
        "robots_blocks_google", "robots_blocks_adsense", "privacy_incomplete", "privacy_placeholder", "no_cmp",
        "disclaimer_missing", "contact_missing", "ads_txt_missing", "broken_internal", "demo_content",
        "lorem_ipsum", "thin_articles", "autoplay_media", "bad_ad_networks", "author_string_schema", "img_no_alt",
    }
    assert expected <= codes, expected - codes
    statuses = {r.id: r.status for r in report.requirements}
    assert statuses[17] == RequirementStatus.FAIL
    assert statuses[1] == RequirementStatus.MANUAL
    assert 0 <= report.overall_score <= 100
    assert report.findings[0].severity == Severity.CRITICAL  # sorted by severity


def _page(url, text, links=()):
    return PageData(url=url, final_url=url, status=200, content_type="text/html", text_excerpt=text,
                    word_count=len(text.split()), links=list(links))


def test_generated_privacy_policy_passes_our_own_check():
    from bs4 import BeautifulSoup

    profile = SiteProfile(name="Tales", url="https://tales.example/", email="hi@tales.example", owner_name="A B",
                          city="Delhi", country="India")
    text = BeautifulSoup(privacy_policy_html(profile), "html.parser").get_text(" ")
    text += " adssettings.google.com"  # link text is rendered as "Google Ads Settings"; href holds the domain
    privacy = _page("https://tales.example/privacy-policy/", text)
    home = _page("https://tales.example/", "home", [LinkInfo(url=privacy.url, text="Privacy Policy", region="footer")])
    privacy.links = [LinkInfo(url=privacy.url, text="Privacy Policy", region="footer")]
    crawl = CrawlResult(start_url=home.url, base_url=home.url, pages={home.url: home, privacy.url: privacy})
    codes = {f.code for f in privacy_policy(AuditContext(crawl))}
    assert not codes & {"privacy_missing", "privacy_incomplete", "privacy_placeholder", "privacy_not_linked"}, codes


def test_requirement_status_and_seo_score():
    findings = [Finding(code="a", title="a", severity=Severity.HIGH, requirement=5),
                Finding(code="b", title="b", severity=Severity.LOW, requirement=7),
                Finding(code="c", title="c", severity=Severity.INFO, requirement=19)]
    res = {r.id: r.status for r in requirement_results(findings)}
    assert res[5] == RequirementStatus.FAIL
    assert res[7] == RequirementStatus.WARN
    assert res[19] == RequirementStatus.PASS
    assert res[37] == RequirementStatus.MANUAL
    assert seo_score([], 10) == 100
    assert seo_score([Finding(code="t", title="t", severity=Severity.CRITICAL, category="seo")], 10) < 100
