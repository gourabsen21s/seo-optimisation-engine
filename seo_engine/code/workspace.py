"""A disposable, git-tracked copy of a site's repository where the Web Engineer works.

The base branch is materialised once per task (GitHub tarball or a copy of the local folder), committed as the
baseline, edited by Aider, and turned into a reviewable `code_change` fix (exact before/after per file). The
workspace never pushes anywhere — applying the fix goes through the site's connector (GitHub → pull request).
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import shutil
import tarfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import httpx

from ..connectors.static_site import SKIP_DIRS, check_editable
from ..core.config import get_settings
from ..fixes.htmlpatch import PatchError

log = logging.getLogger(__name__)
IGNORED = (".aider*", ".rankcrew/")
MAX_CHANGE_BYTES = 3_000_000


class WorkspaceError(RuntimeError):
    pass


def workspaces_root() -> Path:
    root = Path(get_settings().data_dir).expanduser().resolve() / "workspaces"
    root.mkdir(parents=True, exist_ok=True)
    return root


async def git(cwd: Path, *args: str, check: bool = True, time_limit: float = 120) -> str:
    proc = await asyncio.create_subprocess_exec(
        "git", *args, cwd=str(cwd), stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        env={"PATH": os.environ.get("PATH", "/usr/local/bin:/usr/bin:/bin"), "GIT_TERMINAL_PROMPT": "0",
             "HOME": str(cwd / ".rankcrew")})
    try:
        out, err = await asyncio.wait_for(proc.communicate(), time_limit)
    except TimeoutError:
        proc.kill()
        raise WorkspaceError(f"git {args[0]} timed out") from None
    if check and proc.returncode != 0:
        raise WorkspaceError(f"git {args[0]} failed: {err.decode(errors='replace')[:300]}")
    return out.decode("utf-8", errors="replace")


@dataclass
class FileChange:
    path: str
    before: str | None
    after: str | None


@dataclass
class Workspace:
    path: Path
    source: str  # e.g. "github:owner/repo@main" or "local:/srv/site"
    site_dir: str = ""  # subfolder that holds the site (GitHub connector `site_dir`)
    aider_runs: int = 0
    usage: dict[str, int] = field(default_factory=lambda: {"input_tokens": 0, "output_tokens": 0, "requests": 0})

    # ------------------------------------------------------------------ lifecycle

    @classmethod
    async def create(cls, connector, site_id: int) -> Workspace:
        from ..connectors.github import GitHubConnector
        from ..connectors.local import LocalConnector

        path = workspaces_root() / f"site{site_id}-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        path.mkdir(parents=True)
        try:
            if isinstance(connector, GitHubConnector):
                await _download_github(connector, path)
                source = f"github:{connector.repo_name}@{connector.base_branch}"
            elif isinstance(connector, LocalConnector):
                await asyncio.to_thread(_copy_local, connector.root, path)
                source = f"local:{connector.root}"
            else:
                raise WorkspaceError("Code edits need a GitHub or local-files connector (WordPress sites are edited "
                                     "through the REST API instead).")
            (path / ".rankcrew").mkdir(exist_ok=True)
            await git(path, "init", "-q")
            (path / ".git" / "info").mkdir(parents=True, exist_ok=True)
            (path / ".git" / "info" / "exclude").write_text("\n".join(IGNORED) + "\n")
            await git(path, "add", "-A", time_limit=300)
            await git(path, "-c", "user.name=Rankcrew", "-c", "user.email=rankcrew@localhost", "commit", "-q",
                      "--allow-empty", "--no-verify", "-m", "baseline", time_limit=300)
        except BaseException:
            shutil.rmtree(path, ignore_errors=True)
            raise
        return cls(path=path, source=source, site_dir=getattr(connector, "site_dir", ""))

    async def cleanup(self) -> None:
        await asyncio.to_thread(shutil.rmtree, self.path, True)

    # ------------------------------------------------------------------ files

    def resolve(self, rel: str) -> Path:
        rel = rel.strip().lstrip("/")
        target = (self.path / rel).resolve()
        if target != self.path and self.path not in target.parents:
            raise WorkspaceError(f"path escapes the repository: {rel}")
        if ".git" in Path(rel).parts:
            raise WorkspaceError("the .git folder is off limits")
        return target

    def read_text(self, rel: str) -> str:
        p = self.resolve(rel)
        if not p.is_file():
            raise WorkspaceError(f"{rel} does not exist")
        try:
            return p.read_text(encoding="utf-8")
        except UnicodeDecodeError as exc:
            raise WorkspaceError(f"{rel} is not a text file") from exc

    # ------------------------------------------------------------------ changes

    async def changed_paths(self) -> list[str]:
        await git(self.path, "add", "-A")
        out = await git(self.path, "diff", "--cached", "--name-only", "HEAD")
        return [p for p in out.splitlines() if p and not p.startswith(".aider")]

    async def diff(self, paths: list[str] | None = None, max_chars: int = 60_000) -> str:
        await git(self.path, "add", "-A")
        out = await git(self.path, "diff", "--cached", "--no-color", "HEAD", "--", *(paths or ["."]))
        return out if len(out) <= max_chars else out[:max_chars] + "\n… (diff truncated)"

    async def diffstat(self) -> str:
        await git(self.path, "add", "-A")
        return (await git(self.path, "diff", "--cached", "--stat", "HEAD")).strip()

    async def changes(self) -> list[FileChange]:
        out: list[FileChange] = []
        total = 0
        for rel in await self.changed_paths():
            try:
                check_editable(rel)
            except PatchError as exc:
                raise WorkspaceError(str(exc)) from exc
            before = await git(self.path, "show", f"HEAD:{rel}", check=False) if await self._in_head(rel) else None
            p = self.path / rel
            after = p.read_text(encoding="utf-8") if p.is_file() else None
            total += len(after or "") + len(before or "")
            if total > MAX_CHANGE_BYTES:
                raise WorkspaceError("the change set is too large to review (over 3 MB)")
            out.append(FileChange(rel, before, after))
        return out

    async def _in_head(self, rel: str) -> bool:
        return bool((await git(self.path, "ls-tree", "--name-only", "HEAD", "--", rel, check=False)).strip())

    async def discard(self, paths: list[str] | None = None) -> None:
        targets = paths or ["."]
        await git(self.path, "reset", "-q", "HEAD", "--", *targets, check=False)
        await git(self.path, "checkout", "-q", "HEAD", "--", *targets, check=False)
        await git(self.path, "clean", "-fdq", "--", *targets, check=False)


def _copy_local(root: Path, dest: Path) -> None:
    limit = get_settings().workspace_max_mb * 1_000_000
    size = 0

    def ignore(directory: str, names: list[str]) -> list[str]:
        nonlocal size
        skipped = [n for n in names if n in SKIP_DIRS or n == ".git"]
        for n in names:
            p = Path(directory) / n
            if n not in skipped and p.is_file():
                size += p.stat().st_size
        if size > limit:
            raise WorkspaceError(f"site folder is larger than {get_settings().workspace_max_mb} MB")
        return skipped

    shutil.copytree(root, dest, ignore=ignore, dirs_exist_ok=True, symlinks=False)


async def _download_github(connector, dest: Path) -> None:
    url = f"https://api.github.com/repos/{connector.repo_name}/tarball/{connector.base_branch}"
    async with httpx.AsyncClient(timeout=300, follow_redirects=True,
                                 headers={"Authorization": f"Bearer {connector._token}",
                                          "Accept": "application/vnd.github+json"}) as client:
        resp = await client.get(url)
    if resp.status_code >= 400:
        raise WorkspaceError(f"cannot download {connector.repo_name}@{connector.base_branch}: HTTP {resp.status_code}")
    limit = get_settings().workspace_max_mb * 1_000_000

    def extract() -> None:
        total = 0
        with tarfile.open(fileobj=io.BytesIO(resp.content), mode="r:gz") as tar:
            for member in tar:
                parts = member.name.split("/", 1)
                if len(parts) < 2 or not parts[1]:
                    continue
                rel = parts[1]
                if any(p in SKIP_DIRS for p in rel.split("/")):
                    continue
                target = (dest / rel).resolve()
                if dest.resolve() not in target.parents:
                    continue  # path traversal guard
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                elif member.isfile():
                    total += member.size
                    if total > limit:
                        raise WorkspaceError(f"repository is larger than {get_settings().workspace_max_mb} MB")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    fh = tar.extractfile(member)
                    if fh is not None:
                        target.write_bytes(fh.read())

    await asyncio.to_thread(extract)


async def purge_stale(max_age_hours: int = 12) -> int:
    """Remove workspaces left behind by crashed tasks."""
    cutoff = time.time() - max_age_hours * 3600
    removed = 0
    for p in workspaces_root().iterdir():
        if p.is_dir() and p.stat().st_mtime < cutoff:
            await asyncio.to_thread(shutil.rmtree, p, True)
            removed += 1
    return removed
