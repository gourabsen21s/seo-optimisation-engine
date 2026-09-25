from __future__ import annotations

import asyncio
import logging
from collections.abc import Sequence
from typing import Any, Literal

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models import Model

from ..agent.llm import LLMConfig, build_model
from ..core.models import Finding, PageData, Severity
from ..fixes.models import FixAction, FixKind, Risk

log = logging.getLogger(__name__)

PolicyRisk = Literal[
    "unapproved_health_claim",
    "promissory_income_or_outcome",
    "graphic_violence",
    "sexual_content",
    "hate_or_religious_denigration",
    "dangerous_or_illegal_activity",
    "gambling",
    "wholesale_republication",
]
RISK_LABELS = {
    "unapproved_health_claim": "Unapproved health claim (e.g. 'cures', 'reverses')",
    "promissory_income_or_outcome": "Promissory outcome/income claims",
    "graphic_violence": "Gratuitous graphic violence",
    "sexual_content": "Sexually explicit content",
    "hate_or_religious_denigration": "Denigration of a group or religion",
    "dangerous_or_illegal_activity": "Dangerous or illegal activity",
    "gambling": "Gambling promotion",
    "wholesale_republication": "Wholesale republication of third-party/public-domain text",
}


class JudgeConfig(LLMConfig):
    model: str = "typesafe:jev-latest"
    enabled: bool = True
    min_confidence: float = 0.6


class PageJudgement(BaseModel):
    """An assessment of one web page's main text for Google AdSense / Publisher Policy and content quality."""

    policy_risks: list[PolicyRisk] = Field(
        description="Which of these Google Publisher Policy risks does the text clearly contain?")
    reads_generic_ai: float = Field(
        ge=0, le=1, description="Does the text read like unedited generic AI output: uniform sections, hedging, "
                                "no specific sources, no first-person judgement or original detail?")
    helpful_depth: float = Field(
        ge=0, le=1, description="Is this a substantive, original, in-depth piece a reader would find genuinely "
                                "helpful and trust, rather than thin or derivative content?")
    cites_sources: bool = Field(description="Does the text name specific sources, texts, studies or translations?")
    needs_medical_disclaimer: bool = Field(
        description="Does the text give health, exercise, breathing, diet or medical guidance that warrants a "
                    "medical disclaimer?")
    search_intent: Literal["informational", "commercial", "transactional", "navigational"] = Field(
        description="What search intent does this page best satisfy?")


class CopyVerdict(BaseModel):
    """A check of proposed search-snippet copy (title / meta description / alt text) against the page it describes."""

    accurate: bool = Field(description="Does the proposed copy accurately describe the page without claims the page "
                                       "does not support?")
    clickbait_or_stuffed: bool = Field(description="Is the proposed copy clickbait, misleading or keyword-stuffed?")
    policy_safe: bool = Field(description="Is the proposed copy free of promissory health, income or other "
                                          "Publisher-Policy-violating claims?")


def _make(model: Model, output_type, instructions: str) -> Agent:
    return Agent(model, output_type=output_type, instructions=instructions, retries=1)


def _confidence(result) -> dict[str, float]:
    details = getattr(result.response, "provider_details", None) or {}
    return dict(details.get("confidence") or {})


async def judge_pages(pages: Sequence[PageData], cfg: JudgeConfig, concurrency: int = 16,
                      model: Model | None = None) -> list[dict[str, Any]]:
    agent = _make(model or build_model(cfg), PageJudgement,
                  "You assess web pages submitted for Google AdSense review. Judge only the text given.")
    sem = asyncio.Semaphore(concurrency)
    out: list[dict[str, Any]] = []

    async def one(page: PageData):
        text = f"URL: {page.final_url}\nTitle: {page.title}\n\n{page.text_excerpt[:24000]}"
        async with sem:
            try:
                result = await agent.run(text)
            except Exception as exc:
                log.warning("judge failed for %s: %s", page.final_url, exc)
                return
        out.append({"url": page.final_url, "words": page.word_count, **result.output.model_dump(),
                    "confidence": _confidence(result)})

    await asyncio.gather(*(one(p) for p in pages))
    return sorted(out, key=lambda j: j["url"])


def judgements_to_findings(judgements: list[dict[str, Any]], min_confidence: float = 0.6) -> list[Finding]:
    def sure(j, field):
        return j.get("confidence", {}).get(field, 1.0) >= min_confidence

    findings: list[Finding] = []
    risks: dict[str, list[str]] = {}
    for j in judgements:
        if sure(j, "policy_risks"):
            for r in j["policy_risks"]:
                risks.setdefault(r, []).append(j["url"])
    for risk, urls in risks.items():
        findings.append(Finding(code=f"judge_policy_{risk}", title=RISK_LABELS[risk], severity=Severity.HIGH,
                                requirement=31, category="content", urls=urls,
                                detail="Flagged by the content judge.",
                                recommendation="Review and reframe per Google Publisher Policies."))
    generic = [j["url"] for j in judgements if j["reads_generic_ai"] >= 0.75]
    if generic:
        findings.append(Finding(code="judge_generic_ai", title="Content reads as unedited generic AI output",
                                severity=Severity.HIGH if len(generic) > len(judgements) / 3 else Severity.MEDIUM,
                                requirement=28, category="content", urls=generic,
                                recommendation="Add named sources, first-person judgement, original detail and "
                                               "your own voice."))
    shallow = [j["url"] for j in judgements if j["helpful_depth"] < 0.35]
    if shallow:
        findings.append(Finding(code="judge_low_depth", title="Content judged thin or derivative", severity=Severity.MEDIUM,
                                requirement=29, category="content", urls=shallow,
                                recommendation="Expand with depth, originality and sources, or merge and redirect."))
    unsourced = [j["url"] for j in judgements if not j["cites_sources"] and sure(j, "cites_sources")]
    if len(unsourced) > max(2, len(judgements) / 2):
        findings.append(Finding(code="judge_unsourced", title="Most articles cite no specific sources",
                                severity=Severity.LOW, requirement=11, category="content", urls=unsourced,
                                recommendation="Cite translations, studies and primary sources (and in schema `citation`)."))
    medical = [j["url"] for j in judgements if j["needs_medical_disclaimer"] and sure(j, "needs_medical_disclaimer")]
    if medical:
        findings.append(Finding(code="judge_needs_medical_disclaimer", title="Health guidance needs a medical disclaimer block",
                                severity=Severity.MEDIUM, requirement=8, category="content", urls=medical,
                                recommendation="Append a medical disclaimer to these posts (e.g. via a the_content filter)."))
    return findings


COPY_KINDS = {FixKind.SET_TITLE, FixKind.SET_META_DESCRIPTION, FixKind.SET_IMAGE_ALT, FixKind.SET_OPEN_GRAPH}


async def verify_copy_fixes(fixes: list[FixAction], pages: dict[str, PageData], cfg: JudgeConfig,
                            concurrency: int = 16, model: Model | None = None) -> None:
    """Guardrail: judge each LLM-written copy fix against its page. Failures are downgraded to REVIEW so
    autopilot never applies them. Verdicts are recorded in fix.payload['verification']."""
    agent = _make(model or build_model(cfg), CopyVerdict,
                  "You verify search-snippet copy proposed for a web page.")
    sem = asyncio.Semaphore(concurrency)

    async def one(fix: FixAction):
        page = pages.get(fix.target_url or "")
        if page is None:
            return
        proposed = {k: v for k, v in fix.payload.items() if k not in ("previous", "url", "type")}
        text = (f"PAGE URL: {page.final_url}\nPAGE TITLE: {page.title}\nPAGE TEXT:\n{page.text_excerpt[:6000]}\n\n"
                f"PROPOSED {fix.kind.value.upper()}: {proposed}")
        async with sem:
            try:
                result = await agent.run(text)
            except Exception as exc:
                log.warning("copy verification failed for %s: %s", fix.id, exc)
                fix.risk = Risk.REVIEW
                fix.payload["verification"] = {"error": str(exc)}
                return
        v: CopyVerdict = result.output
        passed = v.accurate and v.policy_safe and not v.clickbait_or_stuffed
        fix.payload["verification"] = {**v.model_dump(), "passed": passed, "confidence": _confidence(result),
                                       "judge": cfg.model}
        if not passed:
            fix.risk = Risk.REVIEW

    await asyncio.gather(*(one(f) for f in fixes if f.kind in COPY_KINDS and f.source == "agent"))
