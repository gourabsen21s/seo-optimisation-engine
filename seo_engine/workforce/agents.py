"""One PydanticAI agent per LLM employee. Instructions = role card + the context engine's briefing."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models import Model

from ..agent.llm import LLMConfig, model_settings
from ..agent.schemas import StrategyReport
from ..agent.team import ArticleDraft, RankInsights, rank_tools
from ..agent.tools import seo_tools
from .code_tools import code_tools
from .research_tools import LINKS, RANKS, RESEARCH, TECH, manager_tools, subset
from .roster import ANALYST, ENGINEER, LINK_BUILDER, MANAGER, ONPAGE, RESEARCHER, ROSTER, STRATEGIST, TECH_SEO, WRITER
from .tools import EmployeeDeps, collab_tools

WORK_RULES = """
How you work:
- Read your briefing first; it contains the task, the discussion thread, team memory and relevant site knowledge.
- Use tools to investigate; don't guess URLs or data. Stay within your role — delegate to colleagues via create_task.
- If you are blocked by something only the owner can provide, call ask_human and finish with outcome "blocked".
- Report `learnings` (durable lessons for yourself) and `team_notes` (facts everyone should know). Keep each one
  short, specific and reusable; skip trivia.
- Be honest: rankings cannot be guaranteed; say what is uncertain.
- If a tool returns {"error": ...} (e.g. an integration is not configured), adapt: use another source, or note
  what the owner should connect — don't retry the same call.
"""

ENGINEER_RULES = """
How you engineer:
- Orient first: repo_overview, then find_page_source / search_code / file_outline. Read the exact code before
  deciding. Prefer the framework's idiomatic mechanism (e.g. Next.js metadata API, Astro layout props, Hugo front
  matter) over hard-coded tags.
- Make the smallest change that achieves the goal. Give implement_change a precise instruction and only the
  files that must change; pass related files as read_only_files for context.
- After every implement_change: check syntax_problems, then review_changes. Fix or discard anything unintended.
  Run run_site_check("build") when available.
- Never touch secrets, CI workflows, lock files or unrelated code. Your changes become a pull request the owner
  reviews; describe what changed, why, and how to verify it in `details`.
"""


class TaskResult(BaseModel):
    summary: str = Field(description="2–4 sentence summary of what you did and found")
    details: str = Field(default="", description="Markdown details for the owner and colleagues")
    outcome: Literal["done", "blocked"] = "done"
    learnings: list[str] = Field(default_factory=list, description="Durable lessons for your own memory")
    team_notes: list[str] = Field(default_factory=list, description="Facts the whole team should remember")


class RankTaskResult(TaskResult):
    insights: RankInsights | None = None


class StrategyTaskResult(TaskResult):
    strategy: StrategyReport | None = None


class WriterTaskResult(TaskResult):
    draft: ArticleDraft | None = None


class WrapUpResult(TaskResult):
    actions: list[str] = Field(default_factory=list, description="What the team did this cycle")
    next_focus: str = Field(default="", description="What the next cycle should prioritise")
    expected_impact: str = Field(default="", description="Realistic expected effect and timeframe")


OUTPUT_TYPES = {ANALYST: RankTaskResult, STRATEGIST: StrategyTaskResult, WRITER: WriterTaskResult}
READ_ONLY_SEO = seo_tools.filtered(lambda ctx, tool_def: not tool_def.name.startswith("propose_"))


def _seo(*names: str):
    return seo_tools.filtered(lambda ctx, t: t.name in names)


READ_PAGES = ("get_audit_overview", "list_findings", "list_pages", "get_page", "fetch_live_page")


def _toolsets(employee_id: str):
    if employee_id == MANAGER:
        return [collab_tools, READ_ONLY_SEO, subset(RESEARCH - {"content_gap"}, RANKS), manager_tools]
    if employee_id == ANALYST:
        return [collab_tools, rank_tools, READ_ONLY_SEO,
                subset({"web_search", "check_serp_position", "keyword_ideas"}, RANKS)]
    if employee_id == ONPAGE:
        return [collab_tools, seo_tools, subset({"web_search", "check_serp_position", "analyze_page",
                                                 "propose_technical_fix"})]
    if employee_id == STRATEGIST:
        return [collab_tools, _seo(*READ_PAGES, "propose_manual_action"), subset(RESEARCH, RANKS)]
    if employee_id == WRITER:
        return [collab_tools, _seo("list_pages", "get_page"),
                subset({"web_search", "analyze_page", "keyword_ideas", "content_gap"})]
    if employee_id == RESEARCHER:
        return [collab_tools, READ_ONLY_SEO,
                rank_tools.filtered(lambda ctx, t: t.name in ("get_query_rows", "get_striking_distance")),
                subset(RESEARCH, RANKS, {"domain_authority"})]
    if employee_id == LINK_BUILDER:
        return [collab_tools, _seo(*READ_PAGES, "propose_manual_action"),
                subset(LINKS, {"web_search", "analyze_page"})]
    if employee_id == TECH_SEO:
        return [collab_tools, _seo(*READ_PAGES, "propose_schema", "propose_manual_action"),
                rank_tools.filtered(lambda ctx, t: t.name == "inspect_index_status"),
                subset(TECH, {"check_serp_position"})]
    if employee_id == ENGINEER:
        return [collab_tools, READ_ONLY_SEO, code_tools]
    raise ValueError(f"{employee_id} is not an LLM employee")


REQUEST_LIMITS = {ENGINEER: 45, RESEARCHER: 35, LINK_BUILDER: 35}


def make_employee(employee_id: str, model: Model, cfg: LLMConfig, briefing: str,
                  output_type: type[BaseModel] | None = None) -> Agent[EmployeeDeps, BaseModel]:
    role = ROSTER[employee_id]
    settings = model_settings(cfg)
    if employee_id == WRITER:
        settings = {**settings, "max_tokens": max(settings.get("max_tokens", 8000), 16000)}
    rules = WORK_RULES + (ENGINEER_RULES if employee_id == ENGINEER else "")
    return Agent(model, deps_type=EmployeeDeps, output_type=output_type or OUTPUT_TYPES.get(employee_id, TaskResult),
                 instructions=f"{role.card()}\n{rules}\n{briefing}", toolsets=_toolsets(employee_id),
                 retries=3, model_settings=settings, name=employee_id)
