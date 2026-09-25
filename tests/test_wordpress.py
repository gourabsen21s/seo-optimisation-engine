"""WordPress connector against a mocked REST API (Rank Math + SEO Engine Bridge installed)."""

import json

import httpx

from seo_engine.connectors.wordpress import WordPressConnector
from seo_engine.fixes.models import FixAction, FixKind

BASE = "https://blog.test"
POST_LINK = f"{BASE}/hello-world/"


class FakeWP:
    def __init__(self):
        self.calls: list[tuple[str, str, dict]] = []
        self.content = '<p>Hi</p><img src="https://blog.test/wp-content/uploads/temple.jpg" alt="">'

    def __call__(self, request: httpx.Request) -> httpx.Response:
        path, method = request.url.path.removeprefix("/wp-json"), request.method
        body = json.loads(request.content) if request.content else {}
        self.calls.append((method, path, body))
        if path == "/wp/v2/users/me":
            return httpx.Response(200, json={"name": "admin", "roles": ["administrator"]})
        if path == "/seo-engine/v1/status":
            return httpx.Response(200, json={"installed": True, "seo_plugin": "rank_math", "page_on_front": 0,
                                             "version": "1.0.0"})
        if path == "/wp/v2/posts" and method == "GET":
            slug = request.url.params.get("slug")
            return httpx.Response(200, json=[{"id": 7, "link": POST_LINK}] if slug == "hello-world" else [])
        if path == "/wp/v2/pages" and method == "GET":
            return httpx.Response(200, json=[])
        if path == "/wp/v2/posts/7" and method == "GET":
            return httpx.Response(200, json={"content": {"raw": self.content}, "meta": {"_seo_engine_jsonld": ""}})
        if path == "/wp/v2/posts/7" and method == "POST":
            if "content" in body:
                self.content = body["content"]
            return httpx.Response(200, json={"id": 7})
        if path == "/wp/v2/media":
            return httpx.Response(200, json=[{"id": 3, "source_url": f"{BASE}/wp-content/uploads/temple.jpg",
                                              "alt_text": ""}])
        if path.startswith("/wp/v2/media/") or path.startswith("/seo-engine/v1/"):
            return httpx.Response(200, json={"ok": True})
        if path == "/wp/v2/pages" and method == "POST":
            return httpx.Response(201, json={"id": 99, "link": f"{BASE}/?page_id=99"})
        return httpx.Response(404, json={"message": "not mocked"})


def connector(fake):
    return WordPressConnector(BASE, "admin", "abcd efgh", transport=httpx.MockTransport(fake))


async def test_wordpress_test_and_meta_update():
    fake = FakeWP()
    wp = connector(fake)
    info = await wp.test()
    assert info["bridge_installed"] and info["seo_plugin"] == "rank_math"
    fix = FixAction(kind=FixKind.SET_META_DESCRIPTION, title="t", target_url=POST_LINK,
                    payload={"meta_description": "A useful description."})
    dry = await wp.apply([fix], dry_run=True)
    assert dry[0].ok and not any(m == "POST" for m, _, _ in fake.calls)
    res = await wp.apply([fix], dry_run=False)
    assert res[0].ok
    posted = [b for m, p, b in fake.calls if m == "POST" and p == "/wp/v2/posts/7"]
    assert posted[-1] == {"meta": {"rank_math_description": "A useful description."}}
    await wp.close()


async def test_wordpress_alt_jsonld_files_and_drafts():
    fake = FakeWP()
    wp = connector(fake)
    fixes = [
        FixAction(kind=FixKind.SET_IMAGE_ALT, title="t", target_url=POST_LINK,
                  payload={"alts": [{"src": f"{BASE}/wp-content/uploads/temple.jpg", "alt": "Temple relief"}]}),
        FixAction(kind=FixKind.ADD_JSON_LD, title="t", target_url=POST_LINK,
                  payload={"schema_type": "BlogPosting", "schema": {"@type": "BlogPosting", "headline": "Hi"}}),
        FixAction(kind=FixKind.WRITE_FILE, title="t", payload={"path": "ads.txt", "content": "google.com, pub-1, DIRECT"}),
        FixAction(kind=FixKind.CREATE_PAGE, title="t", payload={"slug": "disclaimer", "title": "Disclaimer",
                                                                 "html": "<p>x</p>"}),
        FixAction(kind=FixKind.SET_LANG, title="t", target_url=POST_LINK, payload={"lang": "en"}),
    ]
    results = await wp.apply(fixes, dry_run=False)
    assert [r.ok for r in results] == [True, True, True, True, False]
    assert results[-1].manual  # theme-level change
    assert 'alt="Temple relief"' in fake.content
    assert any(p == "/wp/v2/media/3" for _, p, _ in fake.calls)
    jsonld = [b for m, p, b in fake.calls if m == "POST" and p == "/wp/v2/posts/7" and "meta" in b]
    assert "BlogPosting" in jsonld[-1]["meta"]["_seo_engine_jsonld"]
    assert any(p == "/seo-engine/v1/files" for _, p, _ in fake.calls)
    draft = [b for m, p, b in fake.calls if m == "POST" and p == "/wp/v2/pages"][0]
    assert draft["status"] == "draft"
    await wp.close()
