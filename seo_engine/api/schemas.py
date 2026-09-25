"""Request bodies."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl

from ..services.settings import JudgeUpdate, LLMUpdate


class SiteCreate(BaseModel):
    url: str = Field(min_length=3, max_length=500)
    name: str | None = None
    autopilot: Literal["off", "safe", "full"] = "off"
    start_audit: bool = True


class SiteUpdate(BaseModel):
    name: str | None = None
    profile: dict[str, Any] | None = None
    autopilot: Literal["off", "safe", "full"] | None = None
    audit_every_hours: int | None = Field(default=None, ge=0, le=24 * 90)
    cycle_every_hours: int | None = Field(default=None, ge=0, le=24 * 90)
    auto_publish_content: bool | None = None
    obey_robots: bool | None = None
    max_pages: int | None = Field(default=None, ge=1, le=20000)


class ConnectorIn(BaseModel):
    type: Literal["wordpress", "github", "local"]
    config: dict[str, Any]


class GSCIn(BaseModel):
    property_url: str
    service_account_json: str | None = None


class Ids(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=1000)


class CycleIn(BaseModel):
    fresh_audit: bool = True


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=8000)


class SettingsIn(BaseModel):
    llm: LLMUpdate | None = None
    judge: JudgeUpdate | None = None


class TestIn(BaseModel):
    target: Literal["llm", "judge"] = "llm"


__all__ = ["ChatIn", "ConnectorIn", "CycleIn", "GSCIn", "HttpUrl", "Ids", "SettingsIn", "SiteCreate", "SiteUpdate",
           "TestIn"]
