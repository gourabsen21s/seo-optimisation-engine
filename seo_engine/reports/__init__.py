"""Standalone HTML report rendering (for export and the CLI)."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

from ..core.models import AuditReport

_env = Environment(loader=FileSystemLoader(Path(__file__).parent / "templates"),
                   autoescape=select_autoescape(["html"]), trim_blocks=True, lstrip_blocks=True)


def render_html(report: AuditReport, judgements: list[dict[str, Any]], sections: dict[str, str]) -> str:
    return _env.get_template("report.html").render(
        r=report, judgements=judgements, sections=sections,
        generated=datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC"),
    )
