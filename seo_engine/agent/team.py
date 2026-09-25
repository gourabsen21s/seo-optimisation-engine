"""Shared building blocks for the AI workforce: team dependencies, rank-analysis tools and structured outputs.

The employees themselves (roster, task board, runner, memory-aware briefings) live in `seo_engine.workforce`.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field
from pydantic_ai import Agent, FunctionToolset, ModelRetry, RunContext
from pydantic_ai.models import Model

from ..integrations.gsc import SearchConsole, low_ctr, striking_distance
from .llm import LLMConfig, model_settings
from .schemas import StrategyReport
from .tools import AgentDeps


@dataclass
class TeamDeps(AgentDeps):
    cfg: LLMConfig = field(default_factory=LLMConfig)
    model: Model | None = None
    gsc_rows: list[dict[str, Any]] = field(default_factory=list)
    gsc: SearchConsole | None = None
    history: list[str] = field(default_factory=list)  # previous cycles + measured impact
    max_pages_per_cycle: int = 15
    max_drafts_per_cycle: int = 2
    auto_publish_content: bool = False
    strategy: StrategyReport | None = None
    drafts_written: int = 0


# ----------------------------------------------------------------------------- outputs

class Opportunity(BaseModel):
    url: str
    query: str = ""
    position: float | None = None
    impressions: int = 0
    kind: str = Field(description="striking_distance | low_ctr | not_indexed | cannibalization | other")
    recommendation: str


class RankInsights(BaseModel):
    summary: str
    opportunities: list[Opportunity] = Field(description="Most valuable first, max 20")
    index_issues: list[str] = Field(default_factory=list)


class ArticleDraft(BaseModel):
    title: str
    meta_description: str
    slug: str = Field(description="lowercase-hyphenated URL slug")
    html_body: str = Field(description="Article body HTML using <h2>/<h3>/<p>/<ul>; no <h1>, no <html>/<body>")
    facts_to_verify: list[str] = Field(default_factory=list,
                                       description="Claims, dates and sources an editor must verify before publishing")


# ----------------------------------------------------------------------------- rank analyst

rank_tools: FunctionToolset[TeamDeps] = FunctionToolset()


@rank_tools.tool
async def get_striking_distance(ctx: RunContext[TeamDeps], limit: int = 25) -> list[dict[str, Any]]:
    """Queries ranking in positions 4–20 with real impressions, ranked by opportunity."""
    return striking_distance(ctx.deps.gsc_rows)[:limit]


@rank_tools.tool
async def get_low_ctr_pages(ctx: RunContext[TeamDeps], limit: int = 15) -> list[dict[str, Any]]:
    """Top-5 rankings whose click-through rate lags the typical curve (weak titles/descriptions)."""
    return low_ctr(ctx.deps.gsc_rows)[:limit]


@rank_tools.tool
async def get_query_rows(ctx: RunContext[TeamDeps], url_contains: str = "", limit: int = 40) -> list[dict[str, Any]]:
    """Raw Search Console rows (page, query, clicks, impressions, ctr, position), optionally filtered by URL."""
    rows = [r for r in ctx.deps.gsc_rows if url_contains in r.get("page", "")]
    return sorted(rows, key=lambda r: -r["impressions"])[:limit]


@rank_tools.tool
async def inspect_index_status(ctx: RunContext[TeamDeps], url: str) -> dict[str, Any]:
    """Google's index status for a URL (URL Inspection API)."""
    if ctx.deps.gsc is None:
        raise ModelRetry("Search Console is not connected; skip index inspection.")
    return await ctx.deps.gsc.inspect(url)


def make_rank_analyst(model: Model, cfg: LLMConfig) -> Agent[TeamDeps, RankInsights]:
    return Agent(model, deps_type=TeamDeps, output_type=RankInsights, toolsets=[rank_tools], retries=2,
                 model_settings=model_settings(cfg), name="rank_analyst",
                 instructions="You are an SEO rank analyst. Use Search Console data to find the highest-leverage "
                              "ranking opportunities: striking-distance queries (pos 4–20), low-CTR top-5 results, "
                              "pages not indexed, and keyword cannibalisation (several URLs for one query). Recommend "
                              "a specific change for each opportunity.")


def make_writer(model: Model, cfg: LLMConfig) -> Agent[None, ArticleDraft]:
    return Agent(model, output_type=ArticleDraft, retries=2, model_settings={**model_settings(cfg), "max_tokens": 16000},
                 name="writer",
                 instructions="You are an expert writer drafting a long-form article from a brief. Write with depth, "
                              "specific examples and a clear structure. Never invent citations, statistics, quotes or "
                              "credentials — where a source is needed write [SOURCE NEEDED: ...] and list it in "
                              "facts_to_verify. Health topics: educational, non-promissory, advise consulting a "
                              "professional.")
