"""Command-line interface:  seo-engine --help"""

from __future__ import annotations

import asyncio
import json
import secrets
import subprocess
import sys
from pathlib import Path

import typer
from cryptography.fernet import Fernet
from rich.console import Console
from rich.table import Table

app = typer.Typer(help="Rankcrew — your autonomous SEO team", no_args_is_help=True)
console = Console()


def _project_root() -> Path:
    for candidate in (Path.cwd(), Path(__file__).resolve().parents[1]):
        if (candidate / "alembic.ini").is_file():
            return candidate
    raise typer.BadParameter("alembic.ini not found — run from the project directory")


@app.command()
def audit(url: str, max_pages: int = typer.Option(200, help="Maximum pages to crawl"),
          json_out: Path | None = typer.Option(None, "--json", help="Write the full report as JSON"),
          html_out: Path | None = typer.Option(None, "--html", help="Write a standalone HTML report"),
          ignore_robots: bool = typer.Option(False, help="Crawl pages disallowed by robots.txt")):
    """Audit a site once (no database needed) and print the results."""
    from .audit.runner import run_audit
    from .core.config import get_settings
    from .core.logging import configure_logging
    from .core.requirements import SECTIONS
    from .reports import render_html

    configure_logging()
    settings = get_settings().model_copy(update={"max_pages": max_pages})

    async def progress(msg: str):
        console.print(f"[dim]•[/] {msg}")

    report, _ = asyncio.run(run_audit(url, settings, obey_robots=not ignore_robots, progress=progress))
    console.print(f"\n[bold]Overall {report.overall_score}[/]  SEO {report.seo_score}  "
                  f"AdSense readiness {report.adsense_score}\n")
    table = Table("Severity", "Req", "Finding", "Affected")
    colors = {"critical": "red", "high": "dark_orange", "medium": "yellow", "low": "cyan", "info": "dim"}
    for f in report.findings:
        table.add_row(f"[{colors[f.severity]}]{f.severity}[/]", f"R{f.requirement}" if f.requirement else "",
                      f.title, str(len(f.urls)) if f.urls else "")
    console.print(table)
    if json_out:
        json_out.write_text(report.model_dump_json(indent=2))
        console.print(f"JSON report → {json_out}")
    if html_out:
        html_out.write_text(render_html(report, [], SECTIONS))
        console.print(f"HTML report → {html_out}")


@app.command()
def serve(host: str = "0.0.0.0", port: int = 8000, reload: bool = False, workers: int = 1):
    """Run the API + web UI."""
    import uvicorn

    uvicorn.run("seo_engine.api.app:app", host=host, port=port, reload=reload, workers=workers,
                proxy_headers=True, forwarded_allow_ips="*")


@app.command()
def worker():
    """Run the background job worker + scheduler (requires SEO_REDIS_URL)."""
    from .core.config import get_settings

    if not get_settings().redis_url:
        console.print("[red]SEO_REDIS_URL is not set[/] — without Redis, jobs run inside `seo-engine serve`.")
        raise typer.Exit(1)
    raise SystemExit(subprocess.call([sys.executable, "-m", "arq", "seo_engine.workers.worker.WorkerSettings"]))


@app.command()
def migrate(revision: str = "head"):
    """Apply database migrations (Alembic)."""
    root = _project_root()
    raise SystemExit(subprocess.call([sys.executable, "-m", "alembic", "-c", str(root / "alembic.ini"),
                                      "upgrade", revision], cwd=root))


@app.command("gen-secrets")
def gen_secrets():
    """Print a fresh SEO_SECRET_KEY and API key for your .env file."""
    console.print(f"SEO_SECRET_KEY={Fernet.generate_key().decode()}")
    console.print(f"SEO_API_KEYS={secrets.token_urlsafe(32)}")


@app.command()
def tick():
    """Run one scheduler pass now (enqueue due audits/cycles)."""
    from .workers.scheduler import tick as _tick

    console.print(json.dumps(asyncio.run(_tick())))


@app.command("create-admin")
def create_admin(email: str, password: str = typer.Option(..., prompt=True, hide_input=True, confirmation_prompt=True),
                 name: str = ""):
    """Create a platform operator (or promote an existing user). Operators manage platform settings."""
    from sqlalchemy import func, update

    from .db import User, session_scope
    from .services import accounts
    from .services.common import now

    async def run():
        existing = await accounts.user_by_email(email)
        if existing is None:
            user = await accounts.signup(email, password, name)
            user_id = user.id
        else:
            user_id = existing.id
        async with session_scope() as s:
            await s.execute(update(User).where(User.id == user_id)
                            .values(is_superuser=True, email_verified_at=func.coalesce(User.email_verified_at, now())))
        return user_id

    console.print(f"Operator ready: {email} (user {asyncio.run(run())})")


@app.command("grant-credits")
def grant_credits(email: str, credits: float, note: str = "Granted by operator"):
    """Add credits to the workspace of the user with this email (negative to remove)."""
    from .services import accounts
    from .services import credits as credit_service

    async def run():
        user = await accounts.user_by_email(email)
        if user is None:
            raise typer.BadParameter(f"no user with email {email}")
        mc = round(credits * credit_service.MC)
        if mc > 0:
            return await credit_service.add(user.account_id, mc, "grant", note=note)
        return await credit_service.charge(user.account_id, -mc, "adjustment", note=note)

    console.print(f"New balance: {credit_service.fmt(asyncio.run(run()) or 0)} credits")


if __name__ == "__main__":
    app()
