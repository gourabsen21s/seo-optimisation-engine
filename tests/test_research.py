"""Research integrations against canned API responses (no network)."""

from __future__ import annotations

import json

import httpx
import pytest

from seo_engine.research import authority, http, keywords, pages, serp
from seo_engine.research.http import ResearchError
from seo_engine.services.integrations import IntegrationsConfig


@pytest.fixture
def mock_http():
    """Install a MockTransport for the duration of a test; returns the list of requests seen."""
    seen: list[httpx.Request] = []
    handlers: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        for host, fn in handlers.items():
            if request.url.host.endswith(host):
                return fn(request)
        return httpx.Response(404, request=request)

    http.clear_cache()
    http.set_transport(httpx.MockTransport(handler))
    yield handlers, seen
    from tests.conftest import OfflineTransport

    http.set_transport(OfflineTransport())
    http.clear_cache()


SERPER = {"organic": [{"title": "Rival guide", "link": "https://rival.com/guide", "snippet": "…", "position": 1},
                      {"title": "Our page", "link": "https://www.example.com/post", "snippet": "…", "position": 2}],
          "peopleAlsoAsk": [{"question": "How does it work?"}], "relatedSearches": [{"query": "example tips"}]}


async def test_serp_providers_and_position(mock_http):
    handlers, seen = mock_http
    handlers["serper.dev"] = lambda r: httpx.Response(200, json=SERPER)
    handlers["serpapi.com"] = lambda r: httpx.Response(200, json={
        "organic_results": [{"position": 1, "title": "A", "link": "https://a.com/", "snippet": "x"}],
        "related_questions": [{"question": "q?"}]})
    handlers["search.brave.com"] = lambda r: httpx.Response(200, json={
        "web": {"results": [{"title": "B", "url": "https://b.com/x", "description": "d"}]}})

    page = await serp.search("example", IntegrationsConfig(serp_provider="serper", serp_api_key="k"))
    assert [r.domain for r in page.results] == ["rival.com", "example.com"]
    assert page.people_also_ask == ["How does it work?"] and page.related_searches == ["example tips"]
    assert serp.position_of(page, "example.com").position == 2
    assert json.loads(seen[-1].content)["q"] == "example" and seen[-1].headers["X-API-KEY"] == "k"

    page = await serp.search("example", IntegrationsConfig(serp_provider="serpapi", serp_api_key="k"))
    assert page.results[0].url == "https://a.com/" and page.people_also_ask == ["q?"]
    page = await serp.search("example", IntegrationsConfig(serp_provider="brave", serp_api_key="k"))
    assert page.results[0].domain == "b.com" and seen[-1].headers["X-Subscription-Token"] == "k"

    with pytest.raises(ResearchError, match="No search results provider"):
        await serp.search("x", IntegrationsConfig())
    handlers["serper.dev"] = lambda r: httpx.Response(403, json={})
    with pytest.raises(ResearchError, match="rejected"):
        await serp.search("other", IntegrationsConfig(serp_provider="serper", serp_api_key="bad"), use_cache=False)


async def test_keyword_ideas_from_autocomplete(mock_http):
    handlers, _ = mock_http

    def suggest(r: httpx.Request) -> httpx.Response:
        q = r.url.params["q"]
        return httpx.Response(200, content=json.dumps([q, [f"{q} tips", f"{q} for beginners"]]).encode())

    handlers["google.com"] = suggest
    ideas = await keywords.keyword_ideas("sourdough", modifiers=False, limit=50)
    words = {i["keyword"] for i in ideas}
    assert "sourdough tips" in words and "how sourdough tips" in words
    assert next(i for i in ideas if i["keyword"].startswith("how "))["type"] == "question"


async def test_domain_authority(mock_http):
    handlers, seen = mock_http
    handlers["openpagerank.com"] = lambda r: httpx.Response(200, json={"response": [
        {"domain": "example.com", "page_rank_decimal": 4.2, "rank": "123", "status_code": 200}]})
    rows = await authority.domain_authority(["https://www.example.com/x"], IntegrationsConfig(openpagerank_api_key="k"))
    assert rows == [{"domain": "example.com", "page_rank": 4.2, "global_rank": "123", "found": True}]
    assert seen[-1].headers["API-OPR"] == "k"
    with pytest.raises(ResearchError):
        await authority.domain_authority(["a.com"], IntegrationsConfig())


def test_page_dissection_and_gap_analysis():
    html = """<html lang="en"><head><title>Best sourdough guide</title>
      <meta name="description" content="All about starters">
      <script type="application/ld+json">{"@type": "Article"}</script></head>
      <body><h1>Sourdough</h1><h2>Feeding your starter</h2><h2>How long to proof?</h2>
      <p>Starter hydration and flour choice matter for sourdough bread baking at home.</p>
      <a href="/about">About</a><a href="https://other.org">x</a><img src="a.jpg"></body></html>"""
    d = pages.dissect("https://comp.com/guide", html)
    assert d["title"] == "Best sourdough guide" and d["schema_types"] == ["Article"]
    assert d["questions"] == ["How long to proof?"] and d["internal_links"] == 1 and d["external_links"] == 1
    assert d["images_missing_alt"] == 1
    ours = {"text": "Feeding your starter every day keeps it active.", "outline": [], "words": 300, "schema_types": []}
    gap = pages.gap_analysis(ours, [d, {**d, "url": "https://comp2.com/"}])
    topics = [t["topic"] for t in gap["missing_topics"]]
    assert "How long to proof?" in topics and "Feeding your starter" not in topics
    assert gap["schema_competitors_use"] == ["Article"]
