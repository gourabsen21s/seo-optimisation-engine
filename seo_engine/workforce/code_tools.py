"""The Web Engineer's tools: navigate the site's repository like a developer, delegate the actual multi-file
edits to Aider, verify, and review the diff. Everything happens in a disposable workspace; nothing reaches the
live site until the resulting `code_change` fix is reviewed and applied (GitHub → pull request)."""

from __future__ import annotations

from typing import Any

from pydantic_ai import FunctionToolset, ModelRetry, RunContext

from ..code import inspect as code_inspect
from ..code.aider import run_aider
from ..code.verify import run_script
from ..code.workspace import Workspace, WorkspaceError
from ..connectors.base import ConnectorError
from ..services import budget
from ..services.integrations import get_integrations
from ..services.sites import connector_for, get_site
from .tools import EmployeeDeps

code_tools: FunctionToolset[EmployeeDeps] = FunctionToolset()


async def workspace(ctx: RunContext[EmployeeDeps]) -> Workspace:
    if ctx.deps.workspace is None:
        site = await get_site(ctx.deps.site_id)
        if not site.connector_type:
            raise ModelRetry("This site has no connector. Code edits need a GitHub or local-files connector — ask the "
                             "owner to connect the repository (ask_human).")
        try:
            connector = connector_for(site)
        except ConnectorError as exc:
            raise ModelRetry(f"Connector error: {exc}") from exc
        await ctx.deps.log("Preparing a workspace copy of the repository")
        try:
            ctx.deps.workspace = await Workspace.create(connector, site.id)
        except WorkspaceError as exc:
            raise ModelRetry(str(exc)) from exc
    return ctx.deps.workspace



@code_tools.tool
async def repo_overview(ctx: RunContext[EmployeeDeps]) -> dict[str, Any]:
    """Start here: framework, package manager, npm scripts, top-level folders and where SEO tags usually live."""
    ws = await workspace(ctx)
    return {"source": ws.source, "site_dir": ws.site_dir, **code_inspect.detect(ws)}


@code_tools.tool
async def find_files(ctx: RunContext[EmployeeDeps], pattern: str) -> list[str]:
    """Glob for files, e.g. "**/*.astro", "src/app/**/page.tsx", "*head*"."""
    return code_inspect.find_files(await workspace(ctx), pattern)


@code_tools.tool
async def search_code(ctx: RunContext[EmployeeDeps], pattern: str, glob: str = "", regex: bool = True) -> list[dict]:
    """Search the repository (ripgrep). Returns path, line and text. Search for a page's current title, meta
    description or H1 text to find where it is defined."""
    try:
        return await code_inspect.grep(await workspace(ctx), pattern, glob=glob, regex=regex)
    except WorkspaceError as exc:
        raise ModelRetry(str(exc)) from exc


@code_tools.tool
async def read_file(ctx: RunContext[EmployeeDeps], path: str, offset: int = 1, limit: int = 400) -> dict[str, Any]:
    """Read a file with line numbers. For large files use file_outline first, then read the relevant range."""
    try:
        return code_inspect.read_numbered(await workspace(ctx), path, offset, limit)
    except WorkspaceError as exc:
        raise ModelRetry(str(exc)) from exc


@code_tools.tool
async def file_outline(ctx: RunContext[EmployeeDeps], path: str) -> dict[str, Any]:
    """Structure of a file (components, functions, classes, exports, headings) with line ranges — tree-sitter."""
    try:
        return code_inspect.outline(await workspace(ctx), path)
    except WorkspaceError as exc:
        raise ModelRetry(str(exc)) from exc


@code_tools.tool
async def find_page_source(ctx: RunContext[EmployeeDeps], url: str) -> dict[str, Any]:
    """Locate the source files that render a live URL: routing-convention candidates plus files containing the
    page's current title / H1 (from the crawl)."""
    ws = await workspace(ctx)
    out: dict[str, Any] = {"url": url, "route_candidates": code_inspect.route_candidates(ws, url)}
    try:
        page = ctx.deps.page(url)
    except ModelRetry:
        page = None
    probes = [t for t in ([page.title] if page and page.title else []) + (page.h1[:1] if page else []) if t]
    matches: list[dict] = []
    for text in probes:
        snippet = text.split("|")[0].split(" - ")[0].strip()[:80]
        if len(snippet) >= 6:
            matches += await code_inspect.grep(ws, snippet, regex=False, limit=15)
    out["text_matches"] = matches[:25]
    return out


@code_tools.tool
async def implement_change(ctx: RunContext[EmployeeDeps], instruction: str, files: list[str],
                           read_only_files: list[str] | None = None) -> dict[str, Any]:
    """Make code edits with Aider (an expert coding agent). Give a precise, self-contained instruction: what to
    change, where, exact new values, and constraints ("keep the existing layout", "don't touch other routes").
    `files` = files Aider may edit (it can also create new ones you name); `read_only_files` = context it should
    read but not change. Returns the files changed, a diff summary and Aider's notes. Call repeatedly to refine."""
    ws = await workspace(ctx)
    if len(instruction) < 20:
        raise ModelRetry("Write a precise, detailed instruction (what, where, exact values, constraints).")
    if not files:
        raise ModelRetry("List the files to edit (use find_page_source / search_code to find them).")
    remaining = await budget.ensure_budget(ctx.deps.site_id, ctx.deps.employee_id)
    if remaining is not None and remaining < 20_000:
        return {"error": "Not enough LLM budget left today for a code edit."}
    await ctx.deps.log(f"Editing {', '.join(files[:4])}{'…' if len(files) > 4 else ''} with Aider")
    try:
        res = await run_aider(ws, instruction, ctx.deps.cfg, files=files, read_only=read_only_files or [])
    except WorkspaceError as exc:
        raise ModelRetry(str(exc)) from exc
    await budget.record(ctx.deps.site_id, f"{ctx.deps.employee_id}:aider", ctx.deps.cfg.model, res["usage"])
    changed = await ws.changed_paths()
    problems = {p: code_inspect.syntax_errors(ws, p) for p in changed}
    return {"exit_code": res["exit_code"], "changed_files": changed, "diffstat": await ws.diffstat(),
            "syntax_problems": {p: lines for p, lines in problems.items() if lines},
            "aider_notes": res["output"][-3000:]}


@code_tools.tool
async def review_changes(ctx: RunContext[EmployeeDeps], paths: list[str] | None = None) -> dict[str, Any]:
    """The full diff of everything changed so far (or of specific paths). Always review before finishing."""
    ws = await workspace(ctx)
    return {"changed_files": await ws.changed_paths(), "diff": await ws.diff(paths)}


@code_tools.tool
async def discard_changes(ctx: RunContext[EmployeeDeps], paths: list[str] | None = None) -> str:
    """Undo changes to specific files (or everything) in the workspace."""
    ws = await workspace(ctx)
    await ws.discard(paths)
    return f"Discarded changes to {', '.join(paths) if paths else 'all files'}."


@code_tools.tool
async def run_site_check(ctx: RunContext[EmployeeDeps], script: str = "build") -> dict[str, Any]:
    """Run the site's own package.json script (build / lint / typecheck / test) to verify the change compiles.
    Only available when the owner enabled code execution."""
    if not (await get_integrations()).code_execution_enabled:
        return {"skipped": "Code execution is disabled (Workspace settings → Integrations). Rely on review_changes "
                           "and syntax checks."}
    ws = await workspace(ctx)
    await ctx.deps.log(f"Running `{script}` to verify the change")
    try:
        return await run_script(ws, script)
    except WorkspaceError as exc:
        return {"ok": False, "error": str(exc)}
