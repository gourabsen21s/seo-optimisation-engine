"""Fix lifecycle: persist proposals → approve/reject → preview → apply (with baseline) → measure → rollback."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import delete, select, update

from ..db import Fix, Site, session_scope
from ..fixes.models import FixAction, FixKind, FixResult, FixStatus, Risk
from .common import JobReporter, NotFound, ServiceError, now
from .sites import connector_for, get_site, gsc_for

log = logging.getLogger(__name__)
ROLLBACKABLE = {FixKind.SET_TITLE: "title", FixKind.SET_META_DESCRIPTION: "meta_description"}
# Fixes whose inverse is a different, fully specified action (not a single field restore).
INVERTIBLE = {FixKind.ADD_INTERNAL_LINK, FixKind.CODE_CHANGE}
AUTO_ROLLBACK_KINDS = {k.value for k in ROLLBACKABLE} | {k.value for k in INVERTIBLE}


def _inverse(fix: Fix) -> tuple[str, dict[str, Any], str]:
    kind = FixKind(fix.kind)
    if kind == FixKind.ADD_INTERNAL_LINK:
        return FixKind.REMOVE_INTERNAL_LINK.value, dict(fix.payload), "Removes the internal link that was added."
    if kind == FixKind.CODE_CHANGE:
        files = [{"path": f["path"], "before": f.get("after"), "after": f.get("before")}
                 for f in fix.payload.get("files", [])]
        return fix.kind, {**fix.payload, "files": files, "diff": _reverse_diff(fix.payload.get("diff", "")),
                          "summary": f"Revert: {fix.payload.get('summary', '')}"}, "Reverts the code change."
    field = ROLLBACKABLE[kind]
    return fix.kind, {field: fix.payload["previous"], "previous": fix.payload.get(field)}, "Restores the previous value."


def _reverse_diff(diff: str) -> str:
    out = []
    for line in diff.splitlines():
        if line.startswith("+++ ") or line.startswith("--- "):
            out.append(line)
        elif line.startswith("+"):
            out.append("-" + line[1:])
        elif line.startswith("-"):
            out.append("+" + line[1:])
        else:
            out.append(line)
    return "\n".join(out)


def serialize(fix: Fix) -> dict[str, Any]:
    return {c: getattr(fix, c) for c in ("id", "kind", "title", "rationale", "target_url", "payload", "risk",
                                          "requirement", "finding_code", "source", "status", "result", "baseline",
                                          "impact", "rollback_of", "created_at", "applied_at")}


def to_action(fix: Fix) -> FixAction:
    return FixAction(id=fix.id, kind=FixKind(fix.kind), title=fix.title, rationale=fix.rationale,
                     target_url=fix.target_url, payload=fix.payload, risk=Risk(fix.risk),
                     requirement=fix.requirement, finding_code=fix.finding_code, source=fix.source)


async def persist(site_id: int, actions: list[FixAction], audit_id: int | None = None,
                  run_id: int | None = None, replace_source: str | None = None) -> list[Fix]:
    """Store proposals. Supersedes still-open proposals for the same target (dedupe key)."""
    keys = {a.dedupe_key(): a for a in actions}
    async with session_scope() as s:
        open_fixes = list(await s.scalars(select(Fix).where(Fix.site_id == site_id,
                                                             Fix.status.in_(("proposed", "approved")))))
        for old in open_fixes:
            old_key = to_action(old).dedupe_key()
            if old_key in keys or (replace_source and old.source == replace_source):
                await s.delete(old)
        rows = []
        for a in keys.values():
            row = Fix(id=a.id, site_id=site_id, audit_id=audit_id, run_id=run_id, kind=a.kind.value, title=a.title[:300],
                      rationale=a.rationale, target_url=a.target_url, payload=a.payload, risk=a.risk.value,
                      requirement=a.requirement, finding_code=a.finding_code, source=a.source, status="proposed")
            s.add(row)
            rows.append(row)
    return rows


async def list_fixes(site_id: int, status: str | None = None) -> list[Fix]:
    q = select(Fix).where(Fix.site_id == site_id)
    if status:
        q = q.where(Fix.status == status)
    async with session_scope() as s:
        return list(await s.scalars(q.order_by(Fix.created_at.desc()).limit(2000)))


async def set_status(ids: list[str], status: FixStatus) -> int:
    async with session_scope() as s:
        res = await s.execute(update(Fix).where(Fix.id.in_(ids), Fix.status.in_(("proposed", "approved", "failed",
                                                                                 "rejected")))
                              .values(status=status.value))
        return res.rowcount or 0


def autopilot_eligible(fix: FixAction, mode: str) -> bool:
    if mode == "off" or fix.kind == FixKind.MANUAL:
        return False
    verification = fix.payload.get("verification")
    if verification is not None and not verification.get("passed", False):
        return False
    if mode == "safe":
        return fix.risk == Risk.SAFE
    return True  # full


async def preview(site_id: int, ids: list[str]) -> list[FixResult]:
    site = await get_site(site_id)
    async with session_scope() as s:
        rows = list(await s.scalars(select(Fix).where(Fix.site_id == site_id, Fix.id.in_(ids))))
    connector = connector_for(site)
    try:
        return await connector.apply([to_action(r) for r in rows], dry_run=True)
    finally:
        if hasattr(connector, "close"):
            await connector.close()


async def _baselines(site: Site, urls: set[str]) -> dict[str, dict[str, float]]:
    gsc = gsc_for(site)
    if gsc is None or not urls:
        return {}
    try:
        metrics = await gsc.page_metrics(days=28)
    except Exception as exc:
        log.warning("baseline capture failed: %s", exc)
        return {}
    return {u: {**metrics[u], "days": 28} for u in urls if u in metrics}


async def apply(site_id: int, ids: list[str], report: JobReporter | None = None) -> dict[str, Any]:
    site = await get_site(site_id)
    async with session_scope() as s:
        rows = list(await s.scalars(select(Fix).where(Fix.site_id == site_id, Fix.id.in_(ids),
                                                       Fix.status.in_(("proposed", "approved", "failed")))))
    actions = [to_action(r) for r in rows if r.kind != FixKind.MANUAL.value]
    if not actions:
        return {"applied": 0, "failed": 0, "manual": 0}
    if report:
        await report(f"Applying {len(actions)} fixes via {site.connector_type}")
    baselines = await _baselines(site, {a.target_url for a in actions if a.target_url})
    connector = connector_for(site)
    try:
        results = await connector.apply(actions, dry_run=False)
    finally:
        if hasattr(connector, "close"):
            await connector.close()
    by_id = {r.fix_id: r for r in results}
    counts = {"applied": 0, "failed": 0, "manual": 0}
    async with session_scope() as s:
        for row in await s.scalars(select(Fix).where(Fix.id.in_([a.id for a in actions]))):
            r = by_id.get(row.id)
            if r is None:
                continue
            row.result = r.model_dump()
            if r.ok:
                row.status, row.applied_at = "applied", now()
                row.baseline = baselines.get(row.target_url or "")
                counts["applied"] += 1
            else:
                row.status = "failed"
                counts["manual" if r.manual else "failed"] += 1
    code_changes = [a for a in actions if a.kind == FixKind.CODE_CHANGE and by_id.get(a.id) and by_id[a.id].ok]
    if code_changes:
        from ..workforce.board import log_activity

        via = "opened a pull request" if site.connector_type == "github" else "applied a code change"
        for a in code_changes:
            await log_activity(site_id, "engineer", "opened_pr", f"Ezra {via}: {a.title.removeprefix('Code change: ')} "
                               f"— {by_id[a.id].message}", a.payload.get("task_id"))
    if report:
        await report(f"Applied {counts['applied']}, failed {counts['failed']}, need manual action {counts['manual']}")
    return counts


async def autopilot_apply(site: Site, fixes: list[Fix], report: JobReporter) -> dict[str, Any] | None:
    if site.autopilot == "off":
        return None
    if not site.connector_secret:
        await report.warn("Autopilot is on but no connector is configured — fixes stay proposed.")
        return None
    eligible = [f.id for f in fixes if autopilot_eligible(to_action(f), site.autopilot)]
    if not eligible:
        await report("Autopilot: nothing eligible to apply automatically")
        return None
    await set_status(eligible, FixStatus.APPROVED)
    await report(f"Autopilot ({site.autopilot}): applying {len(eligible)} verified fixes")
    return await apply(site.id, eligible, report)


async def create_rollback(fix_id: str) -> Fix:
    async with session_scope() as s:
        fix = await s.get(Fix, fix_id)
        if fix is None:
            raise NotFound(f"fix {fix_id} not found")
        kind = FixKind(fix.kind)
        if fix.status != "applied":
            raise ServiceError("Only applied fixes can be rolled back.")
        if kind not in INVERTIBLE and (kind not in ROLLBACKABLE or not fix.payload.get("previous")):
            raise ServiceError("This fix can't be rolled back automatically (only titles/descriptions with a previous "
                               "value, internal links and code changes).")
        inv_kind, payload, rationale = _inverse(fix)
        inverse = Fix(id=FixAction(kind=kind, title="x").id, site_id=fix.site_id, audit_id=fix.audit_id,
                      kind=inv_kind, title=f"Rollback: {fix.title}"[:300], rationale=rationale,
                      target_url=fix.target_url, payload=payload, risk="safe", source="rollback", status="approved",
                      rollback_of=fix.id, finding_code=fix.finding_code)
        s.add(inverse)
        fix.impact = {**(fix.impact or {}), "rolled_back": True}
        return inverse


async def purge_open(site_id: int, source: str) -> None:
    async with session_scope() as s:
        await s.execute(delete(Fix).where(Fix.site_id == site_id, Fix.source == source,
                                          Fix.status.in_(("proposed",))))
