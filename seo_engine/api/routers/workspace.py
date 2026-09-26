"""Workspace members, invitations and API keys (owner-managed)."""

from __future__ import annotations

import logging
import re
from typing import Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field

from ...services import accounts
from ...services import team as team_service
from ...services.accounts import Principal
from ..deps import current_principal, limiter, require_user

log = logging.getLogger(__name__)
router = APIRouter(tags=["workspace"])
_LINKISH = re.compile(r"(https?:|www\.|[a-z0-9-]+\.(?:com|net|org|io|co|app|xyz|info|biz|me|ly)\b)", re.I)


def _plain(text: str) -> str:
    """User-chosen text for an email: no line breaks, no links, short."""
    return _LINKISH.sub("[link removed]", " ".join((text or "").split()))[:80]


class InviteIn(BaseModel):
    email: str = Field(max_length=320)
    role: Literal["member", "owner"] = "member"


class RoleIn(BaseModel):
    role: Literal["member", "owner"]


class KeyIn(BaseModel):
    name: str = Field(default="", max_length=100)


@router.get("/workspace/members")
async def members(p: Principal = Depends(current_principal)):
    return await team_service.members(p.account_id)


@router.post("/workspace/invites", status_code=201)
async def invite(body: InviteIn, request: Request, p: Principal = Depends(require_user)):
    from .auth import _email_link

    limiter.hit(f"invite:{p.user_id}", 30, 3600)
    limiter.hit(f"invite-day:{p.account_id}", 60, 86400)  # invitations are emails sent in our name
    inv, token = await team_service.invite(p.user_id, body.email, body.role)
    inviter = await accounts.get_user(p.user_id)
    acc = await accounts.get_account(p.account_id)
    # The workspace name is chosen by the inviter: keep it out of the subject and show it as plain, link-free text.
    dev = await _email_link(request, inv.email, "You're invited to a team on Rankcrew",
                            f"{inviter.email} invited you to join the workspace \"{_plain(acc.name)}\" on "
                            "Rankcrew. Open this link to set a password (it works for 7 days):",
                            f"/invite?token={token}")
    return {"id": inv.id, "email": inv.email, "role": inv.role, "dev_invite_url": dev}


@router.delete("/workspace/invites/{invite_id}", status_code=204)
async def revoke_invite(invite_id: int, p: Principal = Depends(require_user)):
    await team_service.revoke_invite(p.user_id, invite_id)
    return Response(status_code=204)


@router.patch("/workspace/members/{user_id}")
async def set_role(user_id: int, body: RoleIn, p: Principal = Depends(require_user)):
    await team_service.set_role(p.user_id, user_id, body.role)
    return await team_service.members(p.account_id)


@router.delete("/workspace/members/{user_id}", status_code=204)
async def remove(user_id: int, p: Principal = Depends(require_user)):
    await team_service.remove_member(p.user_id, user_id)
    return Response(status_code=204)


@router.get("/workspace/api-keys")
async def keys(p: Principal = Depends(current_principal)):
    return await team_service.list_keys(p.account_id)


@router.post("/workspace/api-keys", status_code=201)
async def create_key(body: KeyIn, p: Principal = Depends(require_user)):
    info, raw = await team_service.create_key(p.user_id, body.name)
    log.info("api key %s created for account %s", info["prefix"], p.account_id)
    return {**info, "key": raw}


@router.delete("/workspace/api-keys/{key_id}", status_code=204)
async def revoke_key(key_id: int, p: Principal = Depends(require_user)):
    await team_service.revoke_key(p.user_id, key_id)
    return Response(status_code=204)
