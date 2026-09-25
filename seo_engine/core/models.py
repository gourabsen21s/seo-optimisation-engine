"""Core domain models shared by the crawler, checks, agent and API."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class Severity(StrEnum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


SEVERITY_RANK = {Severity.CRITICAL: 4, Severity.HIGH: 3, Severity.MEDIUM: 2, Severity.LOW: 1, Severity.INFO: 0}


class ImageInfo(BaseModel):
    src: str
    alt: str | None = None
    width: str | None = None
    height: str | None = None
    loading: str | None = None


class LinkInfo(BaseModel):
    url: str
    text: str = ""
    region: str = "body"  # header | nav | footer | body
    internal: bool = True
    nofollow: bool = False


class PageData(BaseModel):
    url: str
    final_url: str
    status: int
    redirect_chain: list[str] = Field(default_factory=list)
    content_type: str = ""
    response_ms: int = 0
    html_bytes: int = 0
    error: str | None = None

    title: str | None = None
    meta_description: str | None = None
    meta_robots: str = ""
    x_robots_tag: str = ""
    canonical: str | None = None
    lang: str | None = None
    viewport: str | None = None
    h1: list[str] = Field(default_factory=list)
    headings: list[tuple[int, str]] = Field(default_factory=list)
    word_count: int = 0
    text_excerpt: str = ""
    images: list[ImageInfo] = Field(default_factory=list)
    links: list[LinkInfo] = Field(default_factory=list)
    json_ld: list[dict[str, Any]] = Field(default_factory=list)
    json_ld_errors: list[str] = Field(default_factory=list)
    og: dict[str, str] = Field(default_factory=dict)
    scripts: list[str] = Field(default_factory=list)
    head_scripts: list[str] = Field(default_factory=list)
    inline_script_sample: str = ""
    mixed_content: list[str] = Field(default_factory=list)
    has_form: bool = False
    has_search_form: bool = False
    emails: list[str] = Field(default_factory=list)
    published_time: str | None = None
    modified_time: str | None = None
    page_type: str = "page"  # home | article | page | category | tag | author | date | search | other
    autoplay_media: bool = False
    has_breadcrumb_markup: bool = False

    @property
    def is_html(self) -> bool:
        return "html" in self.content_type and self.error is None

    @property
    def indexable(self) -> bool:
        robots = f"{self.meta_robots},{self.x_robots_tag}".lower()
        return self.status == 200 and "noindex" not in robots

    def schema_types(self) -> set[str]:
        types: set[str] = set()
        for block in self.json_ld:
            for node in _iter_nodes(block):
                t = node.get("@type")
                if isinstance(t, str):
                    types.add(t)
                elif isinstance(t, list):
                    types.update(x for x in t if isinstance(x, str))
        return types

    def schema_nodes(self, type_name: str) -> list[dict[str, Any]]:
        out = []
        for block in self.json_ld:
            for node in _iter_nodes(block):
                t = node.get("@type")
                if t == type_name or (isinstance(t, list) and type_name in t):
                    out.append(node)
        return out


def _iter_nodes(block: Any):
    if isinstance(block, list):
        for item in block:
            yield from _iter_nodes(item)
    elif isinstance(block, dict):
        yield block
        if "@graph" in block:
            yield from _iter_nodes(block["@graph"])


class SitemapEntry(BaseModel):
    url: str
    lastmod: str | None = None


class CrawlResult(BaseModel):
    start_url: str
    base_url: str
    pages: dict[str, PageData] = Field(default_factory=dict)
    robots_txt: str | None = None
    robots_status: int | None = None
    ads_txt: str | None = None
    ads_txt_status: int | None = None
    ads_txt_content_type: str = ""
    llms_txt_status: int | None = None
    sitemap_urls_found: list[str] = Field(default_factory=list)
    sitemap_entries: list[SitemapEntry] = Field(default_factory=list)
    sitemap_errors: list[str] = Field(default_factory=list)
    not_found_probe_status: int | None = None
    variant_redirects: dict[str, str | None] = Field(default_factory=dict)
    external_link_status: dict[str, int] = Field(default_factory=dict)
    blocked_by_robots: list[str] = Field(default_factory=list)
    truncated: bool = False

    def html_pages(self) -> list[PageData]:
        return [p for p in self.pages.values() if p.is_html and p.status == 200]


class Finding(BaseModel):
    code: str
    title: str
    severity: Severity
    requirement: int | None = None
    category: str = "seo"  # seo | adsense | performance | content
    detail: str = ""
    recommendation: str = ""
    urls: list[str] = Field(default_factory=list)
    fixable: bool = False


class RequirementStatus(StrEnum):
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"
    MANUAL = "manual"


class RequirementResult(BaseModel):
    id: int
    section: str
    title: str
    level: str
    status: RequirementStatus
    verify: str
    findings: list[str] = Field(default_factory=list)


class AuditReport(BaseModel):
    site_url: str
    seo_score: int
    adsense_score: int
    overall_score: int
    section_scores: dict[str, int]
    pages_crawled: int
    findings: list[Finding]
    requirements: list[RequirementResult]
    pages: list[dict[str, Any]]
    stats: dict[str, Any] = Field(default_factory=dict)
    pagespeed: list[dict[str, Any]] = Field(default_factory=list)
