"""Structured outputs returned by the agents."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ImageAlt(BaseModel):
    src: str = Field(description="Exact image src URL as given")
    alt: str = Field(description="Descriptive alt text, under 125 characters, no 'image of'")


class PageCopy(BaseModel):
    title: str = Field(description="SEO title, 30–60 characters, primary keyword near the start")
    meta_description: str = Field(description="Meta description, 120–155 characters, specific and compelling")
    og_description: str = Field(default="", description="Social share description (optional)")
    image_alts: list[ImageAlt] = Field(default_factory=list,
                                       description="Alt text ONLY for the listed images that lack it")
    focus_keyphrase: str = Field(default="", description="The query this page should rank for")


class Priority(BaseModel):
    title: str
    why: str = Field(description="Impact on rankings or AdSense approval, citing the finding/requirement")
    impact: str = Field(description="high | medium | low")
    effort: str = Field(description="high | medium | low")


class ContentBrief(BaseModel):
    title: str = Field(description="Working title for a new or expanded article")
    target_keyword: str
    search_intent: str = Field(description="informational | commercial | navigational | transactional")
    outline: list[str] = Field(description="H2/H3 outline")
    internal_links: list[str] = Field(default_factory=list, description="Existing site URLs to link to/from")
    target_words: int = 1500
    action: str = Field(default="new", description="new | expand | merge")
    existing_url: str | None = None


class ContentRisk(BaseModel):
    url: str
    category: str = Field(description="e.g. health claim, copyright image, religious sensitivity, thin/generic")
    excerpt: str
    explanation: str
    severity: str = Field(description="high | medium | low")


class StrategyReport(BaseModel):
    summary: str = Field(description="Plain-language assessment of where the site stands and what matters most")
    priorities: list[Priority] = Field(description="Ranked action list, most important first (max 12)")
    content_plan: list[ContentBrief] = Field(default_factory=list, description="Up to 8 content briefs")
    content_risks: list[ContentRisk] = Field(default_factory=list)
    manual_actions: list[str] = Field(default_factory=list,
                                      description="Things only a human can do (Search Console, AdSense UI, ...)")
