"""Runtime-configurable integrations: research APIs, notifications and the LLM budget.

Stored encrypted in the database (like the LLM settings) and layered over the environment defaults, so keys can
be managed from the UI without redeploying.
"""

from __future__ import annotations

import time
from typing import Any, Literal

from pydantic import BaseModel, Field

from ..core.config import get_settings
from ..db import AppSetting, session_scope
from .common import secret_box

KEY = "integrations"
SECRET_FIELDS = ("serp_api_key", "openpagerank_api_key", "pagespeed_api_key", "indexnow_key", "slack_webhook_url",
                 "notify_webhook_url", "smtp_password")
EVENTS = ("task_blocked", "cycle_finished", "rollback", "job_failed", "budget_reached", "agent_message")


class IntegrationsConfig(BaseModel):
    serp_provider: Literal["", "serper", "serpapi", "brave"] = ""
    serp_api_key: str = ""
    serp_country: str = "us"
    serp_language: str = "en"
    openpagerank_api_key: str = ""
    pagespeed_api_key: str = ""
    indexnow_key: str = ""
    public_url: str = ""
    slack_webhook_url: str = ""
    notify_webhook_url: str = ""
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    notify_email: str = ""
    notify_events: list[str] = Field(default_factory=lambda: list(EVENTS))
    llm_daily_token_budget: int = 0
    code_execution_enabled: bool = False

    @property
    def serp_configured(self) -> bool:
        return bool(self.serp_provider and self.serp_api_key)

    @property
    def email_configured(self) -> bool:
        return bool(self.smtp_host and self.notify_email)

    @property
    def notifications_configured(self) -> bool:
        return bool(self.slack_webhook_url or self.notify_webhook_url or self.email_configured)


class IntegrationsUpdate(BaseModel):
    """Partial update. For secret fields: omitted/None = keep, "" = clear."""

    serp_provider: Literal["", "serper", "serpapi", "brave"] | None = None
    serp_api_key: str | None = None
    serp_country: str | None = Field(default=None, max_length=5)
    serp_language: str | None = Field(default=None, max_length=10)
    openpagerank_api_key: str | None = None
    pagespeed_api_key: str | None = None
    indexnow_key: str | None = Field(default=None, max_length=128)
    public_url: str | None = None
    slack_webhook_url: str | None = None
    notify_webhook_url: str | None = None
    smtp_host: str | None = None
    smtp_port: int | None = Field(default=None, ge=1, le=65535)
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str | None = None
    notify_email: str | None = None
    notify_events: list[str] | None = None
    llm_daily_token_budget: int | None = Field(default=None, ge=0)
    code_execution_enabled: bool | None = None


def _env_defaults() -> dict[str, Any]:
    env = get_settings()
    fields = [f for f in IntegrationsConfig.model_fields if f != "notify_events"]
    return {f: getattr(env, f) for f in fields if hasattr(env, f)}


async def _load() -> dict[str, Any]:
    async with session_scope() as s:
        row = await s.get(AppSetting, KEY)
    return secret_box().decrypt(row.value) if row else {}


_cache: tuple[float, IntegrationsConfig] | None = None


async def get_integrations(fresh: bool = False) -> IntegrationsConfig:
    """Effective config (env defaults ← stored overrides). Cached for a few seconds: tools call this often."""
    global _cache
    if not fresh and _cache and time.monotonic() - _cache[0] < 5:
        return _cache[1]
    stored = await _load()
    cfg = IntegrationsConfig(**{**_env_defaults(), **{k: v for k, v in stored.items() if v is not None}})
    _cache = (time.monotonic(), cfg)
    return cfg


async def update(upd: IntegrationsUpdate) -> IntegrationsConfig:
    global _cache
    current = await _load()
    for key, value in upd.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        if key == "notify_events":
            value = [e for e in value if e in EVENTS]
        current[key] = value.strip() if isinstance(value, str) else value
    async with session_scope() as s:
        row = await s.get(AppSetting, KEY)
        value = secret_box().encrypt(current)
        if row:
            row.value = value
        else:
            s.add(AppSetting(key=KEY, value=value))
    _cache = None
    return await get_integrations(fresh=True)


async def public() -> dict[str, Any]:
    """Safe view for the UI: secrets are reported as set/unset, never returned."""
    from .budget import usage_summary

    cfg = await get_integrations(fresh=True)
    data = cfg.model_dump(exclude=set(SECRET_FIELDS))
    data.update({f"{f}_set": bool(getattr(cfg, f)) for f in SECRET_FIELDS})
    data["events"] = list(EVENTS)
    data["usage"] = await usage_summary()
    return data


async def test(target: Literal["serp", "openpagerank", "pagespeed", "notify"]) -> dict[str, Any]:
    cfg = await get_integrations(fresh=True)
    started = time.perf_counter()
    try:
        if target == "serp":
            from ..research.serp import search

            page = await search("seo", cfg, num=10, use_cache=False)
            message = f"{cfg.serp_provider} returned {len(page.results)} results"
        elif target == "openpagerank":
            from ..research.authority import domain_authority

            rows = await domain_authority(["google.com"], cfg)
            message = f"google.com page rank {rows[0].get('page_rank')}"
        elif target == "pagespeed":
            from ..research.tech import pagespeed

            res = await pagespeed("https://www.google.com/", cfg, strategy="mobile")
            if res.get("error"):
                raise RuntimeError(res["error"])
            message = f"PageSpeed ok (performance {res.get('performance')})"
        else:
            from ..integrations.notify import send

            channels = await send(cfg, "Rankcrew test notification", "Notifications are working.", level="info")
            if not channels:
                raise RuntimeError("No notification channel is configured")
            message = "Delivered via " + ", ".join(channels)
    except Exception as exc:
        return {"ok": False, "message": str(exc)[:500], "latency_ms": round((time.perf_counter() - started) * 1000)}
    return {"ok": True, "message": message, "latency_ms": round((time.perf_counter() - started) * 1000)}
