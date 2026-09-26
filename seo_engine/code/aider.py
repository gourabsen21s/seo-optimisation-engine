"""Run Aider (https://aider.chat, Apache-2.0) headlessly inside a workspace to make multi-file code edits.

Aider brings what large codebases need: a tree-sitter repo map (so the model understands thousands of files
without reading them all), robust search/replace edit formats with automatic retries, and built-in linting that
makes it fix syntax errors it introduces. It runs in its own virtualenv as a subprocess, so its dependency pins
never conflict with the engine's, and it uses the same LLM the team is configured with.
"""

from __future__ import annotations

import asyncio
import os
import re
import shutil
from pathlib import Path

from ..agent.llm import LLMConfig
from ..core.config import get_settings
from .workspace import Workspace, WorkspaceError

# provider id → (litellm prefix, API-key env var)
PROVIDER_MAP = {
    "anthropic": ("anthropic/", "ANTHROPIC_API_KEY"),
    "openai": ("openai/", "OPENAI_API_KEY"),
    "google": ("gemini/", "GEMINI_API_KEY"),
    "google-gla": ("gemini/", "GEMINI_API_KEY"),
    "groq": ("groq/", "GROQ_API_KEY"),
    "mistral": ("mistral/", "MISTRAL_API_KEY"),
    "ollama": ("ollama_chat/", ""),
    "openai-compatible": ("openai/", "OPENAI_API_KEY"),
    "openrouter": ("openrouter/", "OPENROUTER_API_KEY"),
    "deepseek": ("deepseek/", "DEEPSEEK_API_KEY"),
    "xai": ("xai/", "XAI_API_KEY"),
}
SOURCE_ENV = {"GEMINI_API_KEY": ("GEMINI_API_KEY", "GOOGLE_API_KEY")}
_TOKENS = re.compile(r"Tokens:\s*([\d.,]+)(k|m)?\s*sent,\s*([\d.,]+)(k|m)?\s*received", re.I)


def aider_binary() -> str | None:
    configured = get_settings().aider_path
    if configured:
        return configured if Path(configured).exists() else None
    found = shutil.which("aider")
    if found:
        return found
    local = Path.cwd() / ".tools" / "aider" / "bin" / "aider"
    return str(local) if local.exists() else None


def _num(value: str, unit: str | None) -> int:
    n = float(value.replace(",", ""))
    return int(n * {"k": 1_000, "m": 1_000_000}.get((unit or "").lower(), 1))


def model_args(cfg: LLMConfig) -> tuple[list[str], dict[str, str]]:
    """Translate the team's `provider:model` into Aider's (litellm) model name, flags and environment."""
    if ":" not in cfg.model:
        raise WorkspaceError(f"Code edits need a provider-prefixed model (e.g. anthropic:claude-opus-5), got {cfg.model!r}")
    provider, name = cfg.model.split(":", 1)
    if provider not in PROVIDER_MAP:
        raise WorkspaceError(f"The {provider} provider is not supported for code edits; choose another LLM in Settings.")
    prefix, key_env = PROVIDER_MAP[provider]
    args, env = ["--model", prefix + name], {}
    if key_env:
        key = cfg.api_key or next((os.environ[v] for v in SOURCE_ENV.get(key_env, (key_env,)) if os.environ.get(v)), "")
        if not key:
            raise WorkspaceError(f"No API key for {provider}: set it in Settings or the {key_env} environment variable.")
        env[key_env] = key
    if provider == "ollama":
        base = cfg.base_url or os.environ.get("OLLAMA_BASE_URL") or "http://localhost:11434"
        env["OLLAMA_API_BASE"] = base.rstrip("/").removesuffix("/v1")
    elif provider == "openai-compatible" and cfg.base_url:
        args += ["--openai-api-base", cfg.base_url]
    return args, env


async def run_aider(ws: Workspace, instruction: str, cfg: LLMConfig, *, files: list[str] | None = None,
                    read_only: list[str] | None = None, time_limit: int | None = None) -> dict:
    binary = aider_binary()
    if not binary:
        raise WorkspaceError("Aider is not installed. Install it with `uv tool install aider-chat` (or see README → "
                             "Code edits) and restart.")
    margs, menv = model_args(cfg)
    for rel in (files or []) + (read_only or []):
        ws.resolve(rel)  # validates paths stay inside the repo
    state = ws.path / ".rankcrew"
    state.mkdir(exist_ok=True)
    cmd = [binary, *margs, "--message", instruction,
           "--yes-always", "--no-auto-commits", "--no-dirty-commits", "--no-check-update", "--no-show-release-notes",
           "--no-pretty", "--no-stream", "--no-fancy-input", "--no-suggest-shell-commands", "--no-detect-urls",
           "--no-show-model-warnings", "--no-gitignore", "--analytics-disable", "--no-notifications",
           "--no-restore-chat-history", "--auto-lint", "--map-tokens", "2048", "--encoding", "utf-8",
           "--chat-history-file", str(state / "chat.md"), "--input-history-file", str(state / "input.txt"),
           "--llm-history-file", str(state / "llm.txt")]
    for rel in files or []:
        cmd += ["--file", rel]
    for rel in read_only or []:
        cmd += ["--read", rel]
    env = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"), "HOME": str(state), "LANG": "C.UTF-8",
           "PYTHONIOENCODING": "utf-8", "AIDER_ANALYTICS": "false", "GIT_TERMINAL_PROMPT": "0", **menv}
    llm_log = state / "llm.txt"
    log_before = llm_log.stat().st_size if llm_log.exists() else 0
    proc = await asyncio.create_subprocess_exec(*cmd, cwd=str(ws.path), env=env, stdin=asyncio.subprocess.DEVNULL,
                                                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    limit = time_limit or get_settings().aider_timeout_seconds
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), limit)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        # Its token report died with the process: estimate the spend from its LLM log (about 4 characters a token).
        grown = (llm_log.stat().st_size if llm_log.exists() else 0) - log_before
        err = WorkspaceError(f"the code edit took longer than {limit}s and was stopped")
        err.usage = {"input_tokens": max(0, grown) // 4, "output_tokens": 0}
        raise err from None
    text = out.decode("utf-8", errors="replace")
    ws.aider_runs += 1
    sent = received = 0
    for m in _TOKENS.finditer(text):
        sent += _num(m.group(1), m.group(2))
        received += _num(m.group(3), m.group(4))
    ws.usage["input_tokens"] += sent
    ws.usage["output_tokens"] += received
    ws.usage["requests"] += len(_TOKENS.findall(text))
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.startswith(("Aider v", "Main model", "Weak model",
                                                                                   "Git repo", "Repo-map", "Added "))]
    return {"exit_code": proc.returncode, "output": "\n".join(lines)[-6000:],
            "usage": {"input_tokens": sent, "output_tokens": received}}
