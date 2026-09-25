from pydantic_ai.messages import ModelResponse, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.test import TestModel

from seo_engine.agent import AgentDeps, LLMConfig, generate_page_copy, run_strategist
from seo_engine.agent.llm import LLMNotConfigured, build_model
from seo_engine.agent.team import TeamDeps, make_rank_analyst
from seo_engine.core.config import get_settings
from seo_engine.fixes.models import FixAction, FixKind, Risk
from seo_engine.fixes.planner import auto_profile, pages_needing_copy
from seo_engine.generators import SiteProfile
from seo_engine.integrations.gsc import low_ctr, striking_distance
from seo_engine.judge import judgements_to_findings, verify_copy_fixes
from seo_engine.judge.judge import JudgeConfig
from seo_engine.services.impact import verdict


def _output_tool(info: AgentInfo, args: dict) -> ModelResponse:
    return ModelResponse(parts=[ToolCallPart(info.output_tools[0].name, args)])


async def test_copywriter_produces_fixes(audited):
    report, crawl = audited
    profile = auto_profile(SiteProfile(), crawl, report)
    pages = pages_needing_copy(report, crawl, 3)

    def writer(messages, info):
        return _output_tool(info, {"title": "Tales: Stories From Ancient Times", "focus_keyphrase": "tales",
                                   "meta_description": "Explore myth and history retold with sources, context "
                                                       "and original commentary from the Tales editorial team.",
                                   "image_alts": [{"src": "http://127.0.0.1:8765/img/hero.jpg", "alt": "Temple"}]})

    fixes, errors = await generate_page_copy(pages, profile, LLMConfig(), model=FunctionModel(writer))
    assert not errors
    assert {f.kind for f in fixes} >= {FixKind.SET_TITLE, FixKind.SET_META_DESCRIPTION}
    alt = [f for f in fixes if f.kind == FixKind.SET_IMAGE_ALT]
    assert alt and alt[0].payload["alts"][0]["alt"] == "Temple"


async def test_strategist_and_team_run_offline(audited):
    report, crawl = audited
    profile = auto_profile(SiteProfile(), crawl, report)
    deps = AgentDeps(profile=profile, report=report, crawl=crawl, settings=get_settings())
    out, usage = await run_strategist(deps, LLMConfig(), model=TestModel(call_tools=["get_audit_overview",
                                                                                   "list_findings"]))
    assert usage["requests"] >= 1 and out.summary is not None

    rows = [{"page": "http://127.0.0.1:8765/", "query": "tales", "clicks": 3, "impressions": 300, "ctr": 0.01,
             "position": 7.2}]
    team = TeamDeps(profile=profile, report=report, crawl=crawl, settings=get_settings(), gsc_rows=rows)
    analyst = make_rank_analyst(TestModel(call_tools=["get_striking_distance"]), LLMConfig())
    assert (await analyst.run("go", deps=team)).output is not None


def test_llm_factory():
    assert type(build_model(LLMConfig(model="test"))).__name__ == "TestModel"
    assert type(build_model(LLMConfig(model="ollama:llama3.3"))).__name__ == "OpenAIChatModel"
    assert type(build_model(LLMConfig(model="typesafe:jev-latest", api_key="k"))).__name__ == "TypeSafeModel"
    try:
        build_model(LLMConfig(model="openai-compatible:x"))
        raise AssertionError("expected LLMNotConfigured")
    except LLMNotConfigured:
        pass


def test_judgements_to_findings():
    j = [{"url": "u1", "policy_risks": ["unapproved_health_claim"], "reads_generic_ai": 0.9, "helpful_depth": 0.2,
          "cites_sources": False, "needs_medical_disclaimer": True, "search_intent": "informational",
          "confidence": {"policy_risks": 0.9}}]
    codes = {f.code for f in judgements_to_findings(j)}
    assert {"judge_policy_unapproved_health_claim", "judge_generic_ai", "judge_low_depth",
            "judge_needs_medical_disclaimer"} <= codes


async def test_judge_guardrail_downgrades_failed_copy(audited):
    _, crawl = audited
    page = crawl.html_pages()[0]
    fix = FixAction(kind=FixKind.SET_META_DESCRIPTION, title="t", target_url=page.final_url, source="agent",
                    payload={"meta_description": "Guaranteed to cure diabetes in 7 days!"}, risk=Risk.SAFE)

    def jev(messages, info):
        return _output_tool(info, {"accurate": False, "clickbait_or_stuffed": True, "policy_safe": False})

    await verify_copy_fixes([fix], {page.final_url: page}, JudgeConfig(model="test"), model=FunctionModel(jev))
    assert fix.risk == Risk.REVIEW and fix.payload["verification"]["passed"] is False


def test_gsc_opportunity_helpers():
    rows = [{"page": "a", "query": "q1", "clicks": 1, "impressions": 500, "ctr": 0.002, "position": 8},
            {"page": "b", "query": "q2", "clicks": 1, "impressions": 500, "ctr": 0.01, "position": 2},
            {"page": "c", "query": "q3", "clicks": 1, "impressions": 5, "ctr": 0.2, "position": 9}]
    assert [r["query"] for r in striking_distance(rows)] == ["q1"]
    assert [r["query"] for r in low_ctr(rows)] == ["q2"]


def test_impact_verdict():
    base = {"clicks": 280, "impressions": 5600, "ctr": 0.05, "position": 6.0, "days": 28}
    assert verdict(base, {"clicks": 200, "impressions": 2800, "ctr": 0.07, "position": 4.5, "days": 14})[0] == "improved"
    assert verdict(base, {"clicks": 40, "impressions": 2000, "ctr": 0.02, "position": 9.0, "days": 14})[0] == "worse"
    assert verdict({**base, "impressions": 10}, {"clicks": 0, "impressions": 5, "ctr": 0, "position": 30,
                                                  "days": 14})[0] == "insufficient_data"
