"""Fix actions: concrete, reviewable changes produced by the rule planner or the agent."""

from __future__ import annotations

import hashlib
import uuid
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class FixKind(StrEnum):
    SET_TITLE = "set_title"
    SET_META_DESCRIPTION = "set_meta_description"
    SET_CANONICAL = "set_canonical"
    SET_LANG = "set_lang"
    ADD_VIEWPORT = "add_viewport"
    SET_IMAGE_ALT = "set_image_alt"
    ADD_JSON_LD = "add_json_ld"
    SET_OPEN_GRAPH = "set_open_graph"
    WRITE_FILE = "write_file"
    CREATE_PAGE = "create_page"
    ADD_INTERNAL_LINK = "add_internal_link"
    REMOVE_INTERNAL_LINK = "remove_internal_link"
    CODE_CHANGE = "code_change"  # multi-file source edit made by the Web Engineer in a repository workspace
    MANUAL = "manual"


class Risk(StrEnum):
    SAFE = "safe"  # additive, reversible, low blast radius — eligible for autopilot
    REVIEW = "review"  # needs a human look before applying


class FixStatus(StrEnum):
    PROPOSED = "proposed"
    APPROVED = "approved"
    REJECTED = "rejected"
    APPLIED = "applied"
    FAILED = "failed"


PAGE_KINDS = {FixKind.SET_TITLE, FixKind.SET_META_DESCRIPTION, FixKind.SET_CANONICAL, FixKind.SET_LANG,
              FixKind.ADD_VIEWPORT, FixKind.SET_IMAGE_ALT, FixKind.ADD_JSON_LD, FixKind.SET_OPEN_GRAPH,
              FixKind.ADD_INTERNAL_LINK, FixKind.REMOVE_INTERNAL_LINK}


class FixAction(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex)
    kind: FixKind
    title: str
    rationale: str = ""
    target_url: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)
    risk: Risk = Risk.SAFE
    requirement: int | None = None
    finding_code: str | None = None
    source: str = "rules"  # rules | agent

    def dedupe_key(self) -> str:
        extra = (self.payload.get("path") or self.payload.get("slug") or self.payload.get("schema_type")
                 or self.payload.get("href") or "")
        if self.kind == FixKind.CODE_CHANGE:
            files = "|".join(sorted(f.get("path", "") for f in self.payload.get("files", [])))
            extra = hashlib.sha256((files + str(self.payload.get("summary", ""))).encode()).hexdigest()[:16]
        return f"{self.kind}|{self.target_url or ''}|{extra}"


class FixResult(BaseModel):
    fix_id: str
    ok: bool
    message: str = ""
    diff: str | None = None
    manual: bool = False
