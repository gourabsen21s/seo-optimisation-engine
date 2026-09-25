"""Apply fixes to a static site stored in a GitHub repository by opening a pull request (PyGithub)."""

from __future__ import annotations

import asyncio
import io
import tarfile
from datetime import UTC, datetime
from typing import Any

import httpx
from github import Auth, Github, GithubException
from github.Repository import Repository

from ..fixes.models import FixAction, FixResult
from ..generators.profile import SiteProfile
from .base import ConnectorError
from .static_site import MAX_FILE_BYTES, StaticSiteConnector, is_text_path

SNAPSHOT_MAX_BYTES = 60_000_000


class GitHubConnector(StaticSiteConnector):
    """Commits every change to a new branch and opens one PR. With `auto_merge`, merges it too (autopilot)."""

    name = "github"

    def __init__(self, repo: str, token: str, base_branch: str = "main", site_dir: str = "",
                 drafts_dir: str = "seo-drafts", auto_merge: bool = False, profile: SiteProfile | None = None):
        super().__init__(site_dir, drafts_dir, profile)
        self.repo_name, self.base_branch, self.auto_merge = repo, base_branch, auto_merge
        self._gh = Github(auth=Auth.Token(token), per_page=100)
        self._repo: Repository | None = None
        self._cache: dict[str, str | None] = {}
        self._files: list[str] | None = None
        self._token = token

    def _get_repo(self) -> Repository:
        if self._repo is None:
            try:
                self._repo = self._gh.get_repo(self.repo_name)
            except GithubException as exc:
                raise ConnectorError(f"cannot access {self.repo_name}: {exc.data}") from exc
        return self._repo

    def _read_sync(self, path: str) -> str | None:
        try:
            content = self._get_repo().get_contents(path, ref=self.base_branch)
        except GithubException as exc:
            if exc.status == 404:
                return None
            raise
        if isinstance(content, list):
            return None
        return content.decoded_content.decode("utf-8")

    async def read(self, path: str) -> str | None:
        if path not in self._cache:
            if self._files is not None and path not in self._files:
                return None if is_text_path(path) else await asyncio.to_thread(self._read_sync, path)
            self._cache[path] = await asyncio.to_thread(self._read_sync, path)
        return self._cache[path]

    async def list_files(self) -> list[str]:
        """Download the base branch once as a tarball (one request) and index its text files."""
        if self._files is not None:
            return self._files
        url = f"https://api.github.com/repos/{self.repo_name}/tarball/{self.base_branch}"
        async with httpx.AsyncClient(timeout=120, follow_redirects=True,
                                     headers={"Authorization": f"Bearer {self._token}",
                                              "Accept": "application/vnd.github+json"}) as client:
            resp = await client.get(url)
        if resp.status_code >= 400:
            raise ConnectorError(f"cannot download {self.repo_name}@{self.base_branch}: HTTP {resp.status_code}")
        if len(resp.content) > SNAPSHOT_MAX_BYTES:
            raise ConnectorError("repository is too large to index (over 60 MB compressed)")

        def extract() -> list[str]:
            files = []
            with tarfile.open(fileobj=io.BytesIO(resp.content), mode="r:gz") as tar:
                for member in tar:
                    if not member.isfile() or member.size > MAX_FILE_BYTES:
                        continue
                    rel = member.name.split("/", 1)[1] if "/" in member.name else member.name
                    if not is_text_path(rel):
                        continue
                    fh = tar.extractfile(member)
                    if fh is None:
                        continue
                    try:
                        self._cache[rel] = fh.read().decode("utf-8")
                    except UnicodeDecodeError:
                        continue
                    files.append(rel)
            return sorted(files)

        self._files = await asyncio.to_thread(extract)
        return self._files

    async def test(self) -> dict[str, Any]:
        def _t():
            repo = self._get_repo()
            if not repo.permissions.push:
                raise ConnectorError("token lacks push permission")
            return {"ok": True, "repo": repo.full_name, "default_branch": repo.default_branch}

        return await asyncio.to_thread(_t)

    def _commit_and_pr(self, files: dict[str, tuple[str | None, str | None]], summary: list[str]) -> str:
        repo = self._get_repo()
        branch = f"rankcrew/{datetime.now(UTC):%Y%m%d-%H%M%S}"
        base_sha = repo.get_branch(self.base_branch).commit.sha
        repo.create_git_ref(ref=f"refs/heads/{branch}", sha=base_sha)
        for path, (before, content) in files.items():
            msg = f"seo: update {path}"
            if content is None:
                if before is not None:
                    existing = repo.get_contents(path, ref=branch)
                    repo.delete_file(path, f"seo: remove {path}", existing.sha, branch=branch)
            elif before is None:
                repo.create_file(path, msg, content, branch=branch)
            else:
                existing = repo.get_contents(path, ref=branch)
                repo.update_file(path, msg, content, existing.sha, branch=branch)
        body = "Automated SEO changes from Rankcrew:\n\n" + "\n".join(f"- {s}" for s in summary)
        pr = repo.create_pull(title=f"SEO fixes ({len(summary)})", body=body, head=branch, base=self.base_branch)
        if self.auto_merge:
            pr.merge(merge_method="squash")
        return pr.html_url

    async def apply(self, fixes: list[FixAction], dry_run: bool = True) -> list[FixResult]:
        files, results = await self.plan_changes(fixes)
        if dry_run or not files:
            return results
        summary = [f.title for f in fixes if any(r.fix_id == f.id and r.ok for r in results)]
        try:
            url = await asyncio.to_thread(self._commit_and_pr, files, summary)
        except GithubException as exc:
            for r in results:
                if r.ok:
                    r.ok, r.message = False, f"GitHub error: {exc.data}"
            return results
        for r in results:
            if r.ok:
                r.message += f" — {'merged' if self.auto_merge else 'PR'}: {url}"
        return results
