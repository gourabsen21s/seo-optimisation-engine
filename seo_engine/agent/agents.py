"""Agent factories and entry points (PydanticAI)."""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from typing import Any

from pydantic_ai import Agent, UsageLimits
from pydantic_ai.models import Model

from ..core.models import PageData
from ..fixes.models import FixAction, FixKind, Risk
from ..generators.profile import SiteProfile
from . import prompts
from .llm import LLMConfig, build_model, model_settings
from .schemas import PageCopy, StrategyReport
from .tools import AgentDeps, seo_tools

log = logging.getLogger(__name__)


def make_copywriter(model: Model, cfg: LLMConfig) -> Agent[None, PageCopy]:
    return Agent(model, output_type=PageCopy, instructions=prompts.COPYWRITER, retries=2,
                 model_settings=model_settings(cfg), name="copywriter")


def make_strategist(model: Model, cfg: LLMConfig) -> Agent[AgentDeps, StrategyReport]:
    return Agent(model, deps_type=AgentDeps, output_type=StrategyReport, instructions=prompts.STRATEGIST,
                 toolsets=[seo_tools], retries=3, model_settings=model_settings(cfg), name="strategist")



def _copy_prompt(page: PageData, profile: SiteProfile) -> str:
    missing_alt = [i.src for i in page.images if not (i.alt or "").strip()][:15]
    lines = [
        f"Site: {profile.name or profile.url} — {profile.description}",
        f"Target keywords for the site (use only if relevant): {', '.join(profile.target_keywords) or 'n/a'}",
        f"URL: {page.final_url}",
        f"Page type: {page.page_type}; language: {page.lang or profile.language}",
        f"Current title: {page.title!r}",
        f"Current meta description: {page.meta_description!r}",
        f"H1: {page.h1[:1]}",
        f"Headings: {[h for _, h in page.headings[:12]]}",
        f"Images needing alt text: {missing_alt}",
        "Page text (first 3000 characters):",
        page.text_excerpt[:3000],
    ]
    return "\n".join(lines)


def copy_to_fixes(page: PageData, copy: PageCopy) -> list[FixAction]:
    fixes: list[FixAction] = []
    title_bad = not page.title or not 30 <= len(page.title) <= 60
    if copy.title and (title_bad or copy.title != page.title):
        fixes.append(FixAction(kind=FixKind.SET_TITLE, title="Rewrite title", target_url=page.final_url,
                               rationale=f"Focus keyphrase: {copy.focus_keyphrase}".strip(),
                               payload={"title": copy.title, "previous": page.title},
                               risk=Risk.SAFE if not page.title else Risk.REVIEW, finding_code="title_length",
                               source="agent"))
    desc_bad = not page.meta_description or not 70 <= len(page.meta_description) <= 160
    if copy.meta_description and desc_bad:
        fixes.append(FixAction(kind=FixKind.SET_META_DESCRIPTION, title="Write meta description",
                               target_url=page.final_url, payload={"meta_description": copy.meta_description,
                                                                   "previous": page.meta_description},
                               risk=Risk.SAFE if not page.meta_description else Risk.REVIEW,
                               finding_code="missing_meta_description", source="agent"))
    known = {i.src for i in page.images if not (i.alt or "").strip()}
    alts = [a.model_dump() for a in copy.image_alts if a.src in known and a.alt.strip()]
    if alts:
        fixes.append(FixAction(kind=FixKind.SET_IMAGE_ALT, title=f"Add alt text to {len(alts)} images",
                               target_url=page.final_url, payload={"alts": alts}, requirement=30,
                               finding_code="img_no_alt", source="agent"))
    if not (page.og.get("title") and page.og.get("description")):
        fixes.append(FixAction(kind=FixKind.SET_OPEN_GRAPH, title="Add Open Graph tags", target_url=page.final_url,
                               payload={"title": copy.title, "description": copy.og_description or copy.meta_description,
                                        "type": "article" if page.page_type == "article" else "website",
                                        "url": page.final_url},
                               finding_code="missing_open_graph", source="agent"))
    return fixes


async def generate_page_copy(pages: Sequence[PageData], profile: SiteProfile, cfg: LLMConfig,
                             concurrency: int = 4, model: Model | None = None) -> tuple[list[FixAction], list[str]]:
    """Write titles/descriptions/alt text for many pages in parallel. Returns (fixes, errors)."""
    agent = make_copywriter(model or build_model(cfg), cfg)
    sem = asyncio.Semaphore(concurrency)
    fixes: list[FixAction] = []
    errors: list[str] = []

    async def one(page: PageData):
        async with sem:
            try:
                result = await agent.run(_copy_prompt(page, profile))
                fixes.extend(copy_to_fixes(page, result.output))
            except Exception as exc:  # one bad page must not sink the batch
                log.warning("copywriter failed for %s: %s", page.final_url, exc)
                errors.append(f"{page.final_url}: {exc}")

    await asyncio.gather(*(one(p) for p in pages))
    return fixes, errors


async def run_strategist(deps: AgentDeps, cfg: LLMConfig, model: Model | None = None) -> tuple[StrategyReport, dict[str, Any]]:
    agent = make_strategist(model or build_model(cfg), cfg)
    result = await agent.run(
        "Audit is complete. Investigate, propose any additional high-value fixes, review content risk on a sample "
        "of articles, and return the strategy report.",
        deps=deps,
        usage_limits=UsageLimits(request_limit=deps.settings.agent_request_limit),
    )
    usage = result.usage
    return result.output, {"requests": usage.requests, "input_tokens": usage.input_tokens,
                           "output_tokens": usage.output_tokens}

