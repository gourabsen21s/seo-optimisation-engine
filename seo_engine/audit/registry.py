"""Check registry and the Finding factory."""

from __future__ import annotations

from collections.abc import Callable, Iterator

from ..core.models import Finding, Severity
from .context import AuditContext

C, H, M, L, I = Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW, Severity.INFO

Check = Callable[[AuditContext], Iterator[Finding]]
CHECKS: list[Check] = []


def check(fn: Check) -> Check:
    CHECKS.append(fn)
    return fn


def finding(code, title, severity, req=None, category="adsense", detail="", recommendation="", urls=None,
            fixable=False) -> Finding:
    return Finding(code=code, title=title, severity=severity, requirement=req, category=category, detail=detail,
                   recommendation=recommendation, urls=(urls or [])[:200], fixable=fixable)


def run_checks(ctx: AuditContext) -> list[Finding]:
    from . import checks  # noqa: F401  (importing registers all checks)

    findings: list[Finding] = []
    for fn in CHECKS:
        findings.extend(fn(ctx))
    return findings
