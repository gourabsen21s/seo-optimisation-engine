"""Fast typed judgements over content — powered by TypeSafe's Jev (System One model) by default.

Jev answers typed questions (bool / Literal / list[Literal] / probability) with calibrated confidence in
~100ms at negligible cost, which makes it practical to judge *every* page of a site rather than a sample, and
to guardrail LLM-written copy before autopilot applies it. Any model with structured output works as a
substitute; with no judge configured this layer is skipped.
"""

from .judge import (
           CopyVerdict,
           JudgeConfig,
           PageJudgement,
           judge_pages,
           judgements_to_findings,
           verify_copy_fixes,
)

__all__ = ["CopyVerdict", "JudgeConfig", "PageJudgement", "judge_pages", "judgements_to_findings",
           "verify_copy_fixes"]
