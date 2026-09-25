"""Runtime-configurable settings (LLM + Judge), stored encrypted in the database and overriding env defaults."""

from __future__ import annotations

import time
from typing import Any, Literal

from pydantic import BaseModel
from pydantic_ai import Agent

from ..agent.llm import PROVIDERS, LLMConfig, build_model
from ..core.config import get_settings
from ..db import AppSetting, session_scope
from ..judge import JudgeConfig
from .common import secret_box

LLM_KEY, JUDGE_KEY = "llm", "judge"


async def _load(key: str) -> dict[str, Any]:
    async with session_scope() as s:
        row = await s.get(AppSetting, key)
    return secret_box().decrypt(row.value) if row else {}


async def _save(key: str, data: dict[str, Any]) -> None:
    async with session_scope() as s:
        row = await s.get(AppSetting, key)
        value = secret_box().encrypt(data)
        if row:
            row.value = value
        else:
            s.add(AppSetting(key=key, value=value))


async def get_llm_config() -> LLMConfig:
    env = get_settings()
    stored = await _load(LLM_KEY)
    return LLMConfig(**{"model": env.llm_model, "api_key": env.llm_api_key, "base_url": env.llm_base_url, **stored})


async def get_judge_config() -> JudgeConfig | None:
    env = get_settings()
    stored = await _load(JUDGE_KEY)
    cfg = JudgeConfig(**{"model": env.judge_model, "api_key": env.judge_api_key, **stored})
    if not cfg.enabled:
        return None
    try:
        build_model(cfg)
    except Exception:
        return None  # judge not configured (e.g. no TYPESAFE_API_KEY) — layer is skipped
    return cfg


class LLMUpdate(BaseModel):
    model: str
    api_key: str | None = None  # None = keep, "" = clear
    base_url: str = ""
    temperature: float | None = None
    max_tokens: int = 8000


class JudgeUpdate(BaseModel):
    model: str = "typesafe:jev-latest"
    api_key: str | None = None
    base_url: str = ""
    enabled: bool = True
    min_confidence: float = 0.6


async def update(llm: LLMUpdate | None, judge: JudgeUpdate | None) -> None:
    for key, upd in ((LLM_KEY, llm), (JUDGE_KEY, judge)):
        if upd is None:
            continue
        current = await _load(key)
        data = upd.model_dump(exclude={"api_key"})
        data["api_key"] = current.get("api_key", "") if upd.api_key is None else upd.api_key
        await _save(key, data)


async def public_settings() -> dict[str, Any]:
    llm = await get_llm_config()
    env = get_settings()
    stored_judge = await _load(JUDGE_KEY)
    judge = JudgeConfig(**{"model": env.judge_model, "api_key": env.judge_api_key, **stored_judge})
    import os

    def key_set(cfg: LLMConfig) -> bool:
        env_var = next((p["env"] for p in PROVIDERS if p["id"] == cfg.provider), "")
        return bool(cfg.api_key or (env_var and os.getenv(env_var)))

    return {
        "llm": {"model": llm.model, "base_url": llm.base_url, "api_key_set": key_set(llm),
                "temperature": llm.temperature, "max_tokens": llm.max_tokens},
        "judge": {"model": judge.model, "base_url": judge.base_url, "api_key_set": key_set(judge),
                  "enabled": judge.enabled, "min_confidence": judge.min_confidence},
        "providers": PROVIDERS,
    }


class _Ping(BaseModel):
    """Connectivity check."""

    ok: bool


async def test(target: Literal["llm", "judge"]) -> dict[str, Any]:
    cfg: LLMConfig = await get_llm_config() if target == "llm" else JudgeConfig(
        **{"model": get_settings().judge_model, "api_key": get_settings().judge_api_key, **(await _load(JUDGE_KEY))})
    started = time.perf_counter()
    try:
        model = build_model(cfg)
        agent = Agent(model, output_type=_Ping, instructions="Answer ok=true.")
        await agent.run("Is this a connectivity test?")
    except Exception as exc:
        return {"ok": False, "message": str(exc)[:500], "latency_ms": round((time.perf_counter() - started) * 1000)}
    return {"ok": True, "message": f"{cfg.model} responded", "latency_ms": round((time.perf_counter() - started) * 1000)}
