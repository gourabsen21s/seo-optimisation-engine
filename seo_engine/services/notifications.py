"""Per-account notification preferences.

Each customer account keeps its own channels (Slack / JSON webhook) and email recipients, encrypted on the account
row. Email goes out through the platform's SMTP server (configured by the operator in platform settings).
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select

from ..db import Account, User, session_scope
from .common import NotFound, secret_box
from .integrations import EVENTS, get_integrations


class AccountNotify(BaseModel):
    email_members: bool = True  # email every member of the account
    extra_emails: list[str] = Field(default_factory=list)
    slack_webhook_url: str = ""
    notify_webhook_url: str = ""
    events: list[str] = Field(default_factory=lambda: list(EVENTS))


class AccountNotifyUpdate(BaseModel):
    email_members: bool | None = None
    extra_emails: list[str] | None = Field(default=None, max_length=10)
    slack_webhook_url: str | None = None  # None = keep, "" = clear
    notify_webhook_url: str | None = None
    events: list[str] | None = None


async def get(account_id: int) -> AccountNotify:
    async with session_scope() as s:
        acc = await s.get(Account, account_id)
    if acc is None:
        raise NotFound("account not found")
    return AccountNotify(**secret_box().decrypt(acc.notify_secret)) if acc.notify_secret else AccountNotify()


async def update(account_id: int, upd: AccountNotifyUpdate) -> AccountNotify:
    from .accounts import normalize_email

    cur = (await get(account_id)).model_dump()
    for k, v in upd.model_dump(exclude_unset=True).items():
        if v is None:
            continue
        if k == "events":
            v = [e for e in v if e in EVENTS]
        elif k == "extra_emails":
            v = sorted({normalize_email(e) for e in v if e.strip()})
        elif isinstance(v, str):
            v = v.strip()
            if v and not v.startswith("https://"):
                from .common import ServiceError

                raise ServiceError("Webhook URLs must start with https://")
        cur[k] = v
    async with session_scope() as s:
        acc = await s.get(Account, account_id)
        acc.notify_secret = secret_box().encrypt(cur)
    return AccountNotify(**cur)


async def public(account_id: int) -> dict[str, Any]:
    n = await get(account_id)
    platform = await get_integrations()
    return {
        "email_members": n.email_members, "extra_emails": n.extra_emails, "events": n.events,
        "slack_webhook_set": bool(n.slack_webhook_url), "notify_webhook_set": bool(n.notify_webhook_url),
        "email_available": bool(platform.smtp_host), "all_events": list(EVENTS),
    }


async def recipients(account_id: int, n: AccountNotify | None = None) -> list[str]:
    n = n or await get(account_id)
    emails = set(n.extra_emails)
    if n.email_members:
        async with session_scope() as s:
            emails |= set(await s.scalars(select(User.email).where(User.account_id == account_id,
                                                                    User.email_verified_at.is_not(None))))
    return sorted(emails)


async def channel_config(account_id: int):
    """The platform config with this account's channels swapped in (SMTP stays the platform's)."""
    n = await get(account_id)
    platform = await get_integrations()
    to = await recipients(account_id, n)
    return n, platform.model_copy(update={"slack_webhook_url": n.slack_webhook_url,
                                          "notify_webhook_url": n.notify_webhook_url,
                                          "notify_email": ", ".join(to), "notify_events": n.events})
