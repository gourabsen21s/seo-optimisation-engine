"""Workspace members, invitations and customer API keys.

A user belongs to exactly one workspace. Owners invite people by email; the invitee sets a password from the
emailed link and joins the workspace (no second workspace, no extra sign-up credits). API keys act for the
workspace, not for a person, and are shown once.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from ..db import Account, ApiKey, Invite, User, UserSession, session_scope
from .accounts import AuthError, Conflict, Principal, check_password_policy, hash_password, normalize_email
from .common import Forbidden, NotFound, ServiceError, now

INVITE_TTL = timedelta(days=7)
MAX_MEMBERS = 50
MAX_KEYS = 20
KEY_PREFIX = "rc_"


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def _owner(user_id: int) -> User:
    async with session_scope() as s:
        user = await s.get(User, user_id)
        acc = await s.get(Account, user.account_id) if user else None
    if user is None or user.role != "owner":
        raise Forbidden("Only a workspace owner can do that.")
    if acc is None or acc.kind != "customer":
        # Operators are added with `seo-engine create-admin` and use SEO_API_KEYS; a plain member or key in the
        # operator workspace would inherit its unmetered, server-side powers.
        raise ServiceError("The operator workspace has no team invitations or API keys. Add operators with "
                           "`seo-engine create-admin`.")
    return user


async def _acting_owner(s, user_id: int) -> User:
    """The acting owner, inside the caller's transaction, with the workspace's owner rows locked: concurrent role
    changes and removals then run one after another and cannot leave a workspace without an owner."""
    account_id = await s.scalar(select(User.account_id).where(User.id == user_id))
    owners = {u.id: u for u in await s.scalars(select(User).where(User.account_id == account_id,
                                                                  User.role == "owner").with_for_update())}
    if user_id not in owners:
        raise Forbidden("Only a workspace owner can do that.")
    return owners[user_id]


async def _revoke_grants(s, user_id: int) -> None:
    """What someone leaving (or losing ownership) handed out stops working with them: their API keys and the
    invitations they sent."""
    await s.execute(update(ApiKey).where(ApiKey.created_by == user_id, ApiKey.revoked_at.is_(None))
                    .values(revoked_at=now()))
    for inv in await s.scalars(select(Invite).where(Invite.invited_by == user_id, Invite.accepted_at.is_(None))):
        await s.delete(inv)


# ── members ──────────────────────────────────────────────────────────────────
async def members(account_id: int) -> dict[str, Any]:
    async with session_scope() as s:
        users = list(await s.scalars(select(User).where(User.account_id == account_id).order_by(User.id)))
        invites = list(await s.scalars(select(Invite).where(Invite.account_id == account_id,
                                                            Invite.accepted_at.is_(None),
                                                            Invite.expires_at > now()).order_by(Invite.id.desc())))
    return {
        "members": [{"id": u.id, "email": u.email, "name": u.name, "role": u.role,
                     "email_verified": u.email_verified_at is not None, "last_login_at": u.last_login_at,
                     "created_at": u.created_at} for u in users],
        "invites": [{"id": i.id, "email": i.email, "role": i.role, "created_at": i.created_at,
                     "expires_at": i.expires_at} for i in invites],
    }


async def invite(owner_id: int, email: str, role: str = "member") -> tuple[Invite, str]:
    """Create (or refresh) an invitation. Returns the invite and the raw token for the email link."""
    owner = await _owner(owner_id)
    if owner.email_verified_at is None:  # invitations are emails sent in our name: prove your own address first
        raise ServiceError("Confirm your own email address before inviting teammates.")
    email = normalize_email(email)
    if role not in ("member", "owner"):
        raise ServiceError("Role must be member or owner.")
    token = secrets.token_urlsafe(32)
    async with session_scope() as s:
        if await s.scalar(select(User.id).where(User.email == email)):
            raise Conflict("That person already has a Rankcrew account. Each email can belong to one workspace.")
        count = await s.scalar(select(func.count()).select_from(User).where(User.account_id == owner.account_id))
        pending = await s.scalar(select(func.count()).select_from(Invite).where(
            Invite.account_id == owner.account_id, Invite.accepted_at.is_(None), Invite.expires_at > now(),
            Invite.email != email))
        if (count or 0) + (pending or 0) >= MAX_MEMBERS:
            raise ServiceError(f"A workspace can have up to {MAX_MEMBERS} members.")
        old = list(await s.scalars(select(Invite).where(Invite.account_id == owner.account_id, Invite.email == email,
                                                        Invite.accepted_at.is_(None))))
        for o in old:  # only the newest link works
            await s.delete(o)
        inv = Invite(account_id=owner.account_id, email=email, role=role, token_hash=_hash(token),
                     invited_by=owner.id, expires_at=now() + INVITE_TTL)
        s.add(inv)
        await s.flush()
    return inv, token


async def revoke_invite(owner_id: int, invite_id: int) -> None:
    owner = await _owner(owner_id)
    async with session_scope() as s:
        inv = await s.get(Invite, invite_id)
        if inv is None or inv.account_id != owner.account_id:
            raise NotFound("Invitation not found.")
        await s.delete(inv)


async def _valid_invite(s, token: str) -> tuple[Invite, Account]:
    inv = await s.scalar(select(Invite).where(Invite.token_hash == _hash(token or "")))
    if inv is None or inv.accepted_at is not None or inv.expires_at <= now():
        raise AuthError("This invitation is invalid or has expired. Ask for a new one.")
    acc = await s.get(Account, inv.account_id)
    if acc is None or acc.status != "active" or acc.kind != "customer":
        raise AuthError("This workspace is suspended. Contact its owner.")
    # The invitation is only as good as the person who sent it: they must still be an owner there.
    inviter = await s.get(User, inv.invited_by) if inv.invited_by else None
    if inviter is None or inviter.account_id != inv.account_id or inviter.role != "owner":
        raise AuthError("This invitation is no longer valid. Ask for a new one.")
    return inv, acc


async def invite_info(token: str) -> dict[str, Any]:
    async with session_scope() as s:
        inv, acc = await _valid_invite(s, token)
        inviter = await s.get(User, inv.invited_by)
    return {"email": inv.email, "workspace": acc.name, "role": inv.role, "invited_by": inviter.name or inviter.email}


async def accept_invite(token: str, name: str, password: str) -> User:
    """Create the invitee's user in the inviting workspace. Following the link proves the email address."""
    async with session_scope() as s:
        inv, _ = await _valid_invite(s, token)
        email = inv.email
    check_password_policy(password, email)
    try:
        async with session_scope() as s:
            inv, _ = await _valid_invite(s, token)
            # Claim the invitation atomically: of two simultaneous accepts, only one matches.
            claimed = await s.execute(update(Invite).where(Invite.id == inv.id, Invite.accepted_at.is_(None))
                                      .values(accepted_at=now()))
            if claimed.rowcount != 1:
                raise AuthError("This invitation has already been used.")
            if await s.scalar(select(User.id).where(User.email == email)):
                raise Conflict("An account with this email already exists. Sign in instead.")
            user = User(account_id=inv.account_id, email=email, name=(name or "").strip()[:200],
                        password_hash=hash_password(password), role=inv.role, email_verified_at=now())
            s.add(user)
            await s.flush()
    except IntegrityError:
        raise Conflict("An account with this email already exists. Sign in instead.") from None
    return user


async def remove_member(owner_id: int, user_id: int) -> None:
    await _owner(owner_id)
    if user_id == owner_id:
        raise ServiceError("You cannot remove yourself. Transfer ownership or delete the workspace instead.")
    async with session_scope() as s:
        owner = await _acting_owner(s, owner_id)
        user = await s.get(User, user_id)
        if user is None or user.account_id != owner.account_id:
            raise NotFound("Member not found.")
        await _revoke_grants(s, user.id)
        await s.delete(user)  # sessions and tokens cascade


async def set_role(owner_id: int, user_id: int, role: str) -> None:
    await _owner(owner_id)
    if role not in ("member", "owner"):
        raise ServiceError("Role must be member or owner.")
    async with session_scope() as s:
        owner = await _acting_owner(s, owner_id)
        user = await s.get(User, user_id)
        if user is None or user.account_id != owner.account_id:
            raise NotFound("Member not found.")
        if user.role == "owner" and role != "owner":
            others = await s.scalar(select(func.count()).select_from(User).where(
                User.account_id == owner.account_id, User.role == "owner", User.id != user.id))
            if not others:
                raise ServiceError("A workspace needs at least one owner. Make someone else an owner first.")
            await _revoke_grants(s, user.id)  # members cannot hold keys or pending invitations
        user.role = role


# ── API keys ─────────────────────────────────────────────────────────────────
async def list_keys(account_id: int) -> list[dict[str, Any]]:
    async with session_scope() as s:
        keys = list(await s.scalars(select(ApiKey).where(ApiKey.account_id == account_id, ApiKey.revoked_at.is_(None))
                                    .order_by(ApiKey.id.desc())))
        names = {uid: nm or em for uid, nm, em in (await s.execute(
            select(User.id, User.name, User.email).where(User.account_id == account_id))).all()}
    return [{"id": k.id, "name": k.name, "prefix": k.prefix, "created_at": k.created_at,
             "last_used_at": k.last_used_at, "created_by": names.get(k.created_by)} for k in keys]


async def create_key(owner_id: int, name: str) -> tuple[dict[str, Any], str]:
    owner = await _owner(owner_id)
    name = (name or "").strip()[:100] or "API key"
    async with session_scope() as s:
        count = await s.scalar(select(func.count()).select_from(ApiKey).where(
            ApiKey.account_id == owner.account_id, ApiKey.revoked_at.is_(None)))
        if (count or 0) >= MAX_KEYS:
            raise ServiceError(f"A workspace can have up to {MAX_KEYS} active API keys.")
        raw = KEY_PREFIX + secrets.token_urlsafe(32)
        key = ApiKey(account_id=owner.account_id, created_by=owner.id, name=name, prefix=raw[:10], key_hash=_hash(raw))
        s.add(key)
        await s.flush()
        info = {"id": key.id, "name": key.name, "prefix": key.prefix, "created_at": key.created_at, "last_used_at": None}
    return info, raw


async def revoke_key(owner_id: int, key_id: int) -> None:
    owner = await _owner(owner_id)
    async with session_scope() as s:
        key = await s.get(ApiKey, key_id)
        if key is None or key.account_id != owner.account_id or key.revoked_at is not None:
            raise NotFound("API key not found.")
        key.revoked_at = now()


async def principal_for_key(raw: str) -> Principal | None:
    if not raw.startswith(KEY_PREFIX) or len(raw) > 200:
        return None
    async with session_scope() as s:
        key = await s.scalar(select(ApiKey).where(ApiKey.key_hash == _hash(raw)))
        if key is None or key.revoked_at is not None:
            return None
        acc = await s.get(Account, key.account_id)
        if acc is None or acc.status != "active":
            return None
        if key.last_used_at is None or now() - key.last_used_at > timedelta(minutes=10):
            key.last_used_at = now()
        verified = bool(await s.scalar(select(func.count()).select_from(User).where(
            User.account_id == acc.id, User.email_verified_at.is_not(None))))
        return Principal(account_id=acc.id, user_id=None, is_superuser=False, email_verified=verified, via="account_key")


# ── housekeeping ─────────────────────────────────────────────────────────────
async def purge_expired() -> int:
    """Delete expired sessions, one-time tokens and invitations (run by the scheduler)."""
    from sqlalchemy import delete

    from ..db import AuthToken

    t = now()
    async with session_scope() as s:
        n = 0
        for q in (delete(UserSession).where(UserSession.expires_at <= t),
                  delete(AuthToken).where(AuthToken.expires_at <= t - timedelta(days=1)),
                  delete(Invite).where(Invite.expires_at <= t - timedelta(days=30))):
            n += (await s.execute(q)).rowcount or 0
    return n
