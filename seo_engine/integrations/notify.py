"""Owner notifications: Slack incoming webhook, a generic JSON webhook, and email (SMTP).

Delivery never raises into the caller — a failed notification must not fail a task or a cycle.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import TYPE_CHECKING, Any

import httpx

from ..research.http import client as http_client
from ..services.common import now

if TYPE_CHECKING:
    from ..services.integrations import IntegrationsConfig

log = logging.getLogger(__name__)


def _send_email(cfg: IntegrationsConfig, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, cfg.smtp_from or cfg.smtp_user or cfg.notify_email, cfg.notify_email
    msg.set_content(body)
    ctx = ssl.create_default_context()
    if cfg.smtp_port == 465:
        with smtplib.SMTP_SSL(cfg.smtp_host, cfg.smtp_port, context=ctx, timeout=20) as s:
            if cfg.smtp_user:
                s.login(cfg.smtp_user, cfg.smtp_password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(cfg.smtp_host, cfg.smtp_port, timeout=20) as s:
            s.starttls(context=ctx)
            if cfg.smtp_user:
                s.login(cfg.smtp_user, cfg.smtp_password)
            s.send_message(msg)


async def send(cfg: IntegrationsConfig, title: str, body: str, *, url: str | None = None, level: str = "info",
               event: str = "test", site: str | None = None) -> list[str]:
    """Send to every configured channel. Returns the channels that accepted the message; raises only if every
    configured channel failed (so the settings "test" button can show the error)."""
    delivered, errors = [], []
    link = f"\n{url}" if url else ""
    async with http_client(timeout=15) as client:
        if cfg.slack_webhook_url:
            icon = {"warning": ":warning:", "error": ":rotating_light:"}.get(level, ":robot_face:")
            text = f"{icon} *{title}*" + (f" · {site}" if site else "") + f"\n{body}" + (f"\n<{url}|Open in Rankcrew>" if url else "")
            try:
                r = await client.post(cfg.slack_webhook_url, json={"text": text})
                r.raise_for_status()
                delivered.append("slack")
            except httpx.HTTPError as exc:
                errors.append(f"slack: {exc}")
        if cfg.notify_webhook_url:
            payload: dict[str, Any] = {"event": event, "title": title, "body": body, "url": url, "level": level,
                                       "site": site, "at": now().isoformat()}
            try:
                r = await client.post(cfg.notify_webhook_url, json=payload)
                r.raise_for_status()
                delivered.append("webhook")
            except httpx.HTTPError as exc:
                errors.append(f"webhook: {exc}")
    if cfg.email_configured:
        try:
            await asyncio.to_thread(_send_email, cfg, f"[Rankcrew] {title}", f"{body}{link}")
            delivered.append("email")
        except (OSError, smtplib.SMTPException) as exc:
            errors.append(f"email: {exc}")
    if errors and not delivered:
        raise RuntimeError("; ".join(errors))
    for e in errors:
        log.warning("notification channel failed: %s", e)
    return delivered


async def notify_event(event: str, title: str, body: str, *, site_id: int | None = None, path: str = "",
                       level: str = "info") -> list[str]:
    """Fire-and-forget notification for a platform event, honouring the owner's event preferences."""
    try:
        from ..db import Site, session_scope
        from ..services.integrations import get_integrations

        cfg = await get_integrations()
        if not cfg.notifications_configured or event not in cfg.notify_events:
            return []
        site_name = None
        if site_id is not None:
            async with session_scope() as s:
                site = await s.get(Site, site_id)
            site_name = site.name if site else None
            path = path or f"/sites/{site_id}/overview"
        url = f"{cfg.public_url.rstrip('/')}{path}" if cfg.public_url else None
        return await send(cfg, title, body[:3000], url=url, level=level, event=event, site=site_name)
    except Exception as exc:  # never break the caller
        log.warning("notify_event(%s) failed: %s", event, exc)
        return []
