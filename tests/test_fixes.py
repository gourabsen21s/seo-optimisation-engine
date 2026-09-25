import json

import pytest

from seo_engine.connectors.base import url_to_file_candidates
from seo_engine.connectors.local import LocalConnector
from seo_engine.fixes.htmlpatch import PatchError, apply_fix
from seo_engine.fixes.models import FixAction, FixKind, Risk
from seo_engine.fixes.planner import auto_profile, heuristic_copy, pages_needing_copy, plan_rule_fixes
from seo_engine.generators import SiteProfile, site_files
from seo_engine.services.fixes import autopilot_eligible

HTML = '<html><head><title>Old</title></head><body><img src="/a.jpg"><img src="/b.jpg" alt="B"></body></html>'


def fx(kind, **payload):
    return FixAction(kind=kind, title="t", target_url="https://x.test/", payload=payload)


def test_htmlpatch_all_kinds():
    out = apply_fix(HTML, fx(FixKind.SET_TITLE, title="New title"))
    assert "<title>New title</title>" in out
    out = apply_fix(out, fx(FixKind.SET_META_DESCRIPTION, meta_description="Desc"))
    assert '<meta content="Desc" name="description"/>' in out or 'name="description"' in out
    out = apply_fix(out, fx(FixKind.SET_CANONICAL, canonical="https://x.test/"))
    assert 'rel="canonical"' in out
    out = apply_fix(out, fx(FixKind.SET_LANG, lang="en"))
    assert '<html lang="en">' in out
    out = apply_fix(out, fx(FixKind.ADD_VIEWPORT))
    assert "width=device-width" in out
    out = apply_fix(out, fx(FixKind.SET_IMAGE_ALT, alts=[{"src": "https://x.test/a.jpg", "alt": "Temple relief"}]))
    assert 'alt="Temple relief"' in out and 'alt="B"' in out
    schema = {"@context": "https://schema.org", "@type": "WebSite", "name": "X"}
    out = apply_fix(out, fx(FixKind.ADD_JSON_LD, schema=schema))
    out = apply_fix(out, fx(FixKind.ADD_JSON_LD, schema={**schema, "name": "Y"}))
    assert out.count("application/ld+json") == 1 and '"Y"' in out  # replaced, not duplicated
    with pytest.raises(PatchError):
        apply_fix(out, fx(FixKind.SET_IMAGE_ALT, alts=[{"src": "/nope.jpg", "alt": "x"}]))


def test_url_to_file_candidates():
    assert url_to_file_candidates("https://x.test/") == ["index.html"]
    assert url_to_file_candidates("https://x.test/blog/post/", "public") == ["public/blog/post/index.html"]
    assert url_to_file_candidates("https://x.test/about")[:2] == ["about.html", "about/index.html"]


def test_site_files():
    robots = site_files.robots_txt(SiteProfile(url="https://x.test", platform="wordpress"))
    assert "User-agent: Mediapartners-Google" in robots and "Sitemap: https://x.test/sitemap_index.xml" in robots
    assert "Disallow: /\n" not in robots
    ads = site_files.ads_txt("ca-pub-1234567890123456")
    assert "google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0" in ads
    with pytest.raises(ValueError):
        site_files.ads_txt("1234")


async def test_rule_planner(audited):
    report, crawl = audited
    profile = auto_profile(SiteProfile(), crawl, report)
    assert profile.publisher_id == "pub-1234567890123456"
    fixes = plan_rule_fixes(report, crawl, profile)
    kinds = {(f.kind, f.payload.get("path") or f.payload.get("slug") or f.payload.get("schema_type")) for f in fixes}
    assert (FixKind.WRITE_FILE, "robots.txt") in kinds
    assert (FixKind.WRITE_FILE, "ads.txt") in kinds
    assert (FixKind.CREATE_PAGE, "disclaimer") in kinds
    assert (FixKind.ADD_JSON_LD, "Organization") in kinds
    assert len({f.dedupe_key() for f in fixes}) == len(fixes)
    pages = pages_needing_copy(report, crawl, 10)
    assert pages and all(p.indexable for p in pages)
    assert heuristic_copy(pages[0], profile)


async def test_local_connector_dry_run_and_apply(site_copy):
    conn = LocalConnector(str(site_copy))
    assert (await conn.test())["ok"]
    fixes = [
        FixAction(kind=FixKind.SET_TITLE, title="t", target_url="http://127.0.0.1:8765/blog/first-post/",
                  payload={"title": "A Better Post Title About Tales"}),
        FixAction(kind=FixKind.ADD_JSON_LD, title="t", target_url="http://127.0.0.1:8765/",
                  payload={"schema_type": "Organization", "schema": {"@type": "Organization", "name": "Tales"}}),
        FixAction(kind=FixKind.WRITE_FILE, title="t", payload={"path": "ads.txt", "content": "google.com, pub-1, DIRECT\n"}),
        FixAction(kind=FixKind.CREATE_PAGE, title="t", payload={"slug": "disclaimer", "title": "Disclaimer",
                                                                 "html": "<p>Hi</p>"}),
        FixAction(kind=FixKind.MANUAL, title="t", payload={"instructions": "do it"}),
    ]
    before = (site_copy / "blog/first-post/index.html").read_text()
    preview = await conn.apply(fixes, dry_run=True)
    assert (site_copy / "blog/first-post/index.html").read_text() == before
    assert all(r.ok for r in preview[:4]) and preview[-1].manual
    assert any(r.diff and "A Better Post Title" in r.diff for r in preview)
    await conn.apply(fixes, dry_run=False)
    assert "A Better Post Title About Tales" in (site_copy / "blog/first-post/index.html").read_text()
    assert '"Organization"' in (site_copy / "index.html").read_text()
    assert (site_copy / "ads.txt").read_text().startswith("google.com")
    assert "noindex" in (site_copy / "seo-drafts/disclaimer.html").read_text()


def test_local_connector_blocks_path_traversal(site_copy):
    from seo_engine.connectors.base import ConnectorError

    with pytest.raises(ConnectorError):
        LocalConnector(str(site_copy))._abs("../../etc/passwd")


def test_autopilot_eligibility():
    safe = fx(FixKind.SET_META_DESCRIPTION, meta_description="x")
    review = FixAction(kind=FixKind.WRITE_FILE, title="t", payload={}, risk=Risk.REVIEW)
    failed = fx(FixKind.SET_TITLE, title="x", verification={"passed": False})
    manual = FixAction(kind=FixKind.MANUAL, title="t")
    assert not autopilot_eligible(safe, "off")
    assert autopilot_eligible(safe, "safe") and not autopilot_eligible(review, "safe")
    assert autopilot_eligible(review, "full")
    assert not autopilot_eligible(failed, "full") and not autopilot_eligible(manual, "full")
    assert json.dumps(safe.model_dump())
