"""Internal-link edits, code workspaces (with a stand-in for Aider), code_change apply + rollback."""

from __future__ import annotations

import stat

import pytest

from seo_engine.agent.llm import LLMConfig
from seo_engine.code import inspect as code_inspect
from seo_engine.code.aider import model_args, run_aider
from seo_engine.code.workspace import Workspace, WorkspaceError
from seo_engine.connectors.local import LocalConnector
from seo_engine.core.config import get_settings
from seo_engine.fixes.htmlpatch import PatchError
from seo_engine.fixes.links import insert_link, remove_link
from seo_engine.fixes.models import FixAction, FixKind

DOC = """<html><body><nav><p>Sourdough starter guide</p></nav>
<article><h2>Sourdough starter basics</h2>
<p>A healthy <strong>sourdough starter</strong> needs flour. Feed your sourdough starter daily.</p>
<p>See <a href="/other">sourdough starter tips</a>.</p></article></body></html>"""


def test_insert_and_remove_internal_link():
    out = insert_link(DOC, "https://site.test/starter/", "sourdough starter")
    # first eligible occurrence: inside <strong> within the article paragraph — not the nav or the heading
    assert '<strong><a href="https://site.test/starter/" data-seo-engine="internal-link">sourdough starter</a></strong>' in out
    assert out.count("data-seo-engine") == 1 and "<nav><p>Sourdough starter guide</p></nav>" in out
    with pytest.raises(PatchError, match="already links"):
        insert_link(out, "https://site.test/starter/", "sourdough starter")
    assert remove_link(out, "https://site.test/starter/", "sourdough starter") == DOC
    with pytest.raises(PatchError, match="not found"):
        insert_link(DOC, "https://site.test/x/", "rye bread")


async def test_static_connector_applies_link_and_rollback(site_copy):
    conn = LocalConnector(str(site_copy))
    page = next(p for p in site_copy.rglob("*.html") if "<p" in p.read_text())
    text = page.read_text()
    import re

    para = re.search(r"<p[^>]*>([^<]{20,})", text)
    assert para, "fixture needs a paragraph"
    anchor = " ".join(para.group(1).split()[:2])
    url = "http://127.0.0.1:8765/" + page.relative_to(site_copy).as_posix().removesuffix("index.html")
    fix = FixAction(kind=FixKind.ADD_INTERNAL_LINK, title="link", target_url=url,
                    payload={"href": "http://127.0.0.1:8765/about/", "anchor_text": anchor})
    [res] = await conn.apply([fix], dry_run=False)
    assert res.ok, res.message
    assert 'data-seo-engine="internal-link"' in page.read_text()
    undo = FixAction(kind=FixKind.REMOVE_INTERNAL_LINK, title="undo", target_url=url, payload=fix.payload)
    [res] = await conn.apply([undo], dry_run=False)
    assert res.ok and page.read_text() == text


@pytest.fixture
def fake_aider(tmp_path, monkeypatch):
    """A stand-in for the aider CLI: appends a marker to every --file and creates llms-new.txt."""
    script = tmp_path / "aider"
    script.write_text("""#!/usr/bin/env python3
import sys, pathlib
args = sys.argv[1:]
files = [args[i + 1] for i, a in enumerate(args) if a == "--file"]
for f in files:
    p = pathlib.Path(f)
    p.write_text(p.read_text() + "\\n<!-- edited by fake aider -->\\n")
pathlib.Path("llms-new.txt").write_text("User-agent: *\\nAllow: /\\n")
print("Applied edit to", ", ".join(files))
print("Tokens: 1.2k sent, 300 received. Cost: $0.01 message")
""")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setattr(get_settings(), "aider_path", str(script))
    return script


def test_model_args_mapping(monkeypatch):
    args, env = model_args(LLMConfig(model="anthropic:claude-opus-5", api_key="sk"))
    assert args == ["--model", "anthropic/claude-opus-5"] and env == {"ANTHROPIC_API_KEY": "sk"}
    args, env = model_args(LLMConfig(model="ollama:llama3.3", base_url="http://h:11434/v1"))
    assert args[1] == "ollama_chat/llama3.3" and env["OLLAMA_API_BASE"] == "http://h:11434"
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(WorkspaceError, match="No API key"):
        model_args(LLMConfig(model="openai:gpt-5"))
    with pytest.raises(WorkspaceError):
        model_args(LLMConfig(model="test"))


async def test_workspace_aider_code_change_and_rollback(site_copy, fake_aider):
    (site_copy / "package.json").write_text('{"dependencies": {"astro": "^5"}, "scripts": {"build": "astro build"}}')
    conn = LocalConnector(str(site_copy))
    ws = await Workspace.create(conn, site_id=1)
    try:
        info = code_inspect.detect(ws)
        assert info["framework"] == "Astro" and info["scripts"] == {"build": "astro build"}
        html = code_inspect.find_files(ws, "*.html")
        assert html and "index.html" in html
        hits = await code_inspect.grep(ws, "<title", glob="*.html", regex=False)
        assert hits and hits[0]["path"].endswith(".html")
        read = code_inspect.read_numbered(ws, "index.html", 1, 5)
        assert read["content"].lstrip().startswith("1\t")
        outline = code_inspect.outline(ws, "index.html")
        assert outline["lines"] > 0 and outline["syntax_ok"] in (True, False)
        assert "index.html" in code_inspect.route_candidates(ws, "http://127.0.0.1:8765/")
        with pytest.raises(WorkspaceError):
            ws.resolve("../../etc/passwd")

        res = await run_aider(ws, "Add a marker comment to the home page", LLMConfig(model="anthropic:x", api_key="k"),
                              files=["index.html"])
        assert res["exit_code"] == 0 and res["usage"] == {"input_tokens": 1200, "output_tokens": 300}
        assert set(await ws.changed_paths()) == {"index.html", "llms-new.txt"}
        changes = {c.path: c for c in await ws.changes()}
        assert changes["llms-new.txt"].before is None and "fake aider" in changes["index.html"].after
        diff = await ws.diff()
        assert "+<!-- edited by fake aider -->" in diff

        from seo_engine.workforce.agents import TaskResult
        from seo_engine.workforce.runner import _code_change_fix

        class _Task:
            id, title = 7, "Mark the home page"

        fix, note = await _code_change_fix(ws, _Task(), TaskResult(summary="Added a marker"))
        assert fix.kind == FixKind.CODE_CHANGE and note["code_change"]["files"] == sorted(changes)
    finally:
        await ws.cleanup()
    assert not ws.path.exists()

    original = (site_copy / "index.html").read_text()
    [res] = await conn.apply([fix], dry_run=False)
    assert res.ok, res.message
    assert "fake aider" in (site_copy / "index.html").read_text() and (site_copy / "llms-new.txt").exists()

    # applying the same change again conflicts (the file no longer matches `before`)
    [res] = await conn.apply([fix], dry_run=True)
    assert not res.ok and "changed since" in res.message

    # rollback = swap before/after for every file (new files are deleted)
    inverse = FixAction(kind=FixKind.CODE_CHANGE, title="revert",
                        payload={"files": [{"path": f["path"], "before": f["after"], "after": f["before"]}
                                           for f in fix.payload["files"]]})
    [res] = await conn.apply([inverse], dry_run=False)
    assert res.ok and (site_copy / "index.html").read_text() == original and not (site_copy / "llms-new.txt").exists()


async def test_code_change_refuses_protected_paths(site_copy):
    conn = LocalConnector(str(site_copy))
    fix = FixAction(kind=FixKind.CODE_CHANGE, title="bad",
                    payload={"files": [{"path": ".github/workflows/ci.yml", "before": None, "after": "x"}]})
    [res] = await conn.apply([fix], dry_run=True)
    assert not res.ok and "protected" in res.message
