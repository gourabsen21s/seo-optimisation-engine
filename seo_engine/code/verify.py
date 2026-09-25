"""Optional build verification: run the site's own scripts (build / lint / typecheck / test) in the workspace.

This executes repository code, so it is disabled unless `code_execution_enabled` is on (Workspace settings →
Integrations). Run Rankcrew in a container when enabling it.
"""

from __future__ import annotations

import asyncio
import os

from .inspect import detect
from .workspace import Workspace, WorkspaceError

ALLOWED_SCRIPTS = ("build", "lint", "typecheck", "type-check", "check", "test", "astro check", "format:check")
INSTALL = {"npm": ["npm", "ci", "--no-audit", "--no-fund"], "pnpm": ["pnpm", "install", "--frozen-lockfile"],
           "yarn": ["yarn", "install", "--frozen-lockfile"], "bun": ["bun", "install", "--frozen-lockfile"]}


async def _run(ws: Workspace, cmd: list[str], time_limit: int) -> tuple[int, str]:
    env = {"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"), "HOME": str(ws.path / ".rankcrew"),
           "CI": "1", "NODE_ENV": "production" if cmd[-1] == "build" else "development", "LANG": "C.UTF-8"}
    try:
        proc = await asyncio.create_subprocess_exec(*cmd, cwd=str(ws.path), env=env, stdin=asyncio.subprocess.DEVNULL,
                                                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    except FileNotFoundError as exc:
        raise WorkspaceError(f"{cmd[0]} is not installed on the server") from exc
    try:
        out, _ = await asyncio.wait_for(proc.communicate(), time_limit)
    except TimeoutError:
        proc.kill()
        await proc.wait()
        return 124, f"{' '.join(cmd)} timed out after {time_limit}s"
    return proc.returncode or 0, out.decode("utf-8", errors="replace")


async def run_script(ws: Workspace, script: str, time_limit: int = 900) -> dict:
    info = detect(ws)
    if script not in info["scripts"]:
        raise WorkspaceError(f"package.json has no {script!r} script. Available: {', '.join(info['scripts']) or 'none'}")
    if script not in ALLOWED_SCRIPTS and not script.startswith(("lint", "test", "check", "build")):
        raise WorkspaceError(f"only build/lint/check/test scripts can be run, not {script!r}")
    pm = info["package_manager"] or "npm"
    log = ""
    if not (ws.path / "node_modules").exists():
        install = INSTALL[pm] if (ws.path / {"npm": "package-lock.json", "pnpm": "pnpm-lock.yaml",
                                              "yarn": "yarn.lock", "bun": "bun.lockb"}[pm]).exists() else [pm, "install"]
        code, out = await _run(ws, install, time_limit)
        log += f"$ {' '.join(install)}\n{out[-3000:]}\n"
        if code != 0:
            return {"ok": False, "script": script, "exit_code": code, "log": log[-6000:]}
    cmd = [pm, "run", script]
    code, out = await _run(ws, cmd, time_limit)
    log += f"$ {' '.join(cmd)}\n{out[-5000:]}"
    return {"ok": code == 0, "script": script, "exit_code": code, "log": log[-6000:]}
