"""Customer accounts: sign-up, sign-in, sessions, email verification and password reset.

Passwords are hashed with scrypt (stdlib). Session and email tokens are random 256-bit values; only their SHA-256 is
stored, so a database leak does not hand out working sessions or reset links.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
import secrets
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import delete, select, update

from ..core.config import get_settings
from ..db import Account, AuthToken, Site, User, UserSession, session_scope
from .common import NotFound, ServiceError, now

EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s]+\.[^@\s]{2,}$")
MIN_PASSWORD = 10
MAX_FAILED_LOGINS = 10
LOCKOUT = timedelta(minutes=15)
VERIFY_TTL = timedelta(hours=48)
RESET_TTL = timedelta(hours=1)
# A few of the most common passwords that clear the length floor; anything on this list is refused.
COMMON = {"password123", "1234567890", "qwertyuiop", "password1234", "iloveyou123", "123456789a", "abcdefghij",
          "qwerty1234", "1q2w3e4r5t", "letmein1234", "welcome123", "passw0rd123", "0987654321", "1111111111"}


class AuthError(ServiceError):
    """Wrong credentials, locked account, bad token: mapped to 401/400 by the API."""


class Conflict(ServiceError):
    pass


# ── passwords ────────────────────────────────────────────────────────────────
_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"scrypt${_N}${_R}${_P}${b64(salt)}${b64(dk)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, dk = stored.split("$")
        if algo != "scrypt":
            return False
        want = base64.b64decode(dk)
        got = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p),
                             dklen=len(want))
        return hmac.compare_digest(got, want)
    except (ValueError, TypeError):
        return False


_DUMMY = hash_password(secrets.token_hex(16))  # keeps timing the same when the email is unknown


def check_password_policy(password: str, email: str = "") -> None:
    if len(password) < MIN_PASSWORD:
        raise ServiceError(f"Use at least {MIN_PASSWORD} characters for your password.")
    if len(password) > 200:
        raise ServiceError("That password is too long (200 characters at most).")
    low = password.lower()
    if low in COMMON or (email and low == email.lower()) or len(set(password)) < 4:
        raise ServiceError("That password is too easy to guess. Try a longer phrase.")


def normalize_email(email: str) -> str:
    e = (email or "").strip().lower()
    if not EMAIL_RE.match(e) or len(e) > 320:
        raise ServiceError("Enter a valid email address.")
    return e


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ── principals ───────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class Principal:
    """Who is calling: a signed-in user, or an operator API key (SEO_API_KEYS)."""

    account_id: int
    user_id: int | None
    is_superuser: bool
    email_verified: bool
    via: str  # session | api_key


async def operator_account_id() -> int:
    """The workspace used by operator API keys (created on first use)."""
    async with session_scope() as s:
        acc = await s.scalar(select(Account).where(Account.kind == "operator").order_by(Account.id).limit(1))
        if acc is None:
            acc = Account(name="Operator", kind="operator")
            s.add(acc)
            await s.flush()
        return acc.id


# ── sign-up / sign-in ────────────────────────────────────────────────────────
async def signup(email: str, password: str, name: str = "", company: str = "") -> User:
    from . import credits

    cfg = get_settings()
    if not cfg.signups_enabled:
        raise ServiceError("Sign-ups are closed right now.")
    email = normalize_email(email)
    check_password_policy(password, email)
    name = (name or "").strip()[:200]
    async with session_scope() as s:
        if await s.scalar(select(User.id).where(User.email == email)):
            raise Conflict("An account with this email already exists. Sign in instead.")
        acc = Account(name=(company or "").strip()[:200] or (f"{name}'s workspace" if name else email.split("@")[0]))
        s.add(acc)
        await s.flush()
        user = User(account_id=acc.id, email=email, name=name, password_hash=hash_password(password), role="owner",
                    is_superuser=email in cfg.admin_email_list)
        s.add(user)
        await s.flush()
        account_id = acc.id
    if cfg.signup_credits > 0:
        await credits.add(account_id, cfg.signup_credits * 1000, "signup", ref=f"signup:{account_id}",
                          note="Welcome credits")
    return user


async def authenticate(email: str, password: str) -> User:
    """Check credentials with lockout after repeated failures. Raises AuthError with a generic message."""
    generic = AuthError("Email or password is incorrect.")
    try:
        email = normalize_email(email)
    except ServiceError:
        raise generic from None
    async with session_scope() as s:
        user = await s.scalar(select(User).where(User.email == email))
        if user is None:
            verify_password(password, _DUMMY)
            raise generic
        if user.locked_until and user.locked_until > now():
            raise AuthError("Too many failed attempts. Try again in a few minutes or reset your password.")
        ok = verify_password(password, user.password_hash)
        if not ok:
            # Commit the failure before raising: raising inside this block would roll it back.
            user.failed_logins += 1
            if user.failed_logins >= MAX_FAILED_LOGINS:
                user.locked_until, user.failed_logins = now() + LOCKOUT, 0
    if not ok:
        raise generic
    async with session_scope() as s:
        user = await s.get(User, user.id)
        acc = await s.get(Account, user.account_id)
        if acc is None or acc.status != "active":
            raise AuthError("This account is suspended. Contact support.")
        user.failed_logins, user.locked_until, user.last_login_at = 0, None, now()
        if user.email in get_settings().admin_email_list:
            user.is_superuser = True
        return user


async def create_session(user_id: int, ip: str | None, user_agent: str | None) -> str:
    token = secrets.token_urlsafe(32)
    async with session_scope() as s:
        s.add(UserSession(token_hash=_hash_token(token), user_id=user_id, ip=(ip or "")[:64],
                          user_agent=(user_agent or "")[:300],
                          expires_at=now() + timedelta(days=get_settings().session_days)))
    return token


async def principal_for_session(token: str) -> Principal | None:
    if not token or len(token) > 200:
        return None
    th = _hash_token(token)
    async with session_scope() as s:
        row = await s.get(UserSession, th)
        if row is None or row.expires_at <= now():
            return None
        user = await s.get(User, row.user_id)
        if user is None:
            return None
        acc = await s.get(Account, user.account_id)
        if acc is None or acc.status != "active":
            return None
        if now() - row.last_seen_at > timedelta(minutes=10):
            row.last_seen_at = now()
        return Principal(account_id=user.account_id, user_id=user.id, is_superuser=user.is_superuser,
                         email_verified=user.email_verified_at is not None, via="session")


async def end_session(token: str) -> None:
    async with session_scope() as s:
        await s.execute(delete(UserSession).where(UserSession.token_hash == _hash_token(token)))


async def end_all_sessions(user_id: int, keep_token: str | None = None) -> None:
    async with session_scope() as s:
        q = delete(UserSession).where(UserSession.user_id == user_id)
        if keep_token:
            q = q.where(UserSession.token_hash != _hash_token(keep_token))
        await s.execute(q)


# ── one-time tokens ──────────────────────────────────────────────────────────
async def issue_token(user_id: int, purpose: str) -> str:
    token = secrets.token_urlsafe(32)
    ttl = VERIFY_TTL if purpose == "verify_email" else RESET_TTL
    async with session_scope() as s:
        # Only the newest link of each kind works.
        await s.execute(delete(AuthToken).where(AuthToken.user_id == user_id, AuthToken.purpose == purpose))
        s.add(AuthToken(token_hash=_hash_token(token), user_id=user_id, purpose=purpose, expires_at=now() + ttl))
    return token


async def consume_token(token: str, purpose: str) -> int:
    async with session_scope() as s:
        row = await s.get(AuthToken, _hash_token(token or ""))
        if row is None or row.purpose != purpose or row.used_at is not None or row.expires_at <= now():
            raise AuthError("This link is invalid or has expired. Request a new one.")
        row.used_at = now()
        return row.user_id


async def verify_email(token: str) -> User:
    user_id = await consume_token(token, "verify_email")
    async with session_scope() as s:
        user = await s.get(User, user_id)
        if user.email_verified_at is None:
            user.email_verified_at = now()
        return user


async def reset_password(token: str, password: str) -> User:
    check_password_policy(password)  # before the link is used up, so a weak choice can be corrected
    user_id = await consume_token(token, "reset_password")
    async with session_scope() as s:
        user = await s.get(User, user_id)
        check_password_policy(password, user.email)
        user.password_hash = hash_password(password)
        user.failed_logins, user.locked_until = 0, None
        # Following a reset link proves control of the inbox.
        user.email_verified_at = user.email_verified_at or now()
    await end_all_sessions(user_id)
    return user


async def change_password(user_id: int, current: str, new: str, keep_token: str | None) -> None:
    async with session_scope() as s:
        user = await s.get(User, user_id)
        if user is None or not verify_password(current, user.password_hash):
            raise AuthError("Your current password is incorrect.")
        check_password_policy(new, user.email)
        user.password_hash = hash_password(new)
    await end_all_sessions(user_id, keep_token=keep_token)


# ── reads / profile ──────────────────────────────────────────────────────────
async def get_user(user_id: int) -> User:
    async with session_scope() as s:
        user = await s.get(User, user_id)
    if user is None:
        raise NotFound("user not found")
    return user


async def user_by_email(email: str) -> User | None:
    try:
        email = normalize_email(email)
    except ServiceError:
        return None
    async with session_scope() as s:
        return await s.scalar(select(User).where(User.email == email))


async def get_account(account_id: int) -> Account:
    async with session_scope() as s:
        acc = await s.get(Account, account_id)
    if acc is None:
        raise NotFound("account not found")
    return acc


async def update_profile(user_id: int, name: str | None, account_name: str | None) -> None:
    async with session_scope() as s:
        user = await s.get(User, user_id)
        if name is not None:
            user.name = name.strip()[:200]
        if account_name is not None and account_name.strip() and user.role == "owner":
            await s.execute(update(Account).where(Account.id == user.account_id)
                            .values(name=account_name.strip()[:200]))


async def delete_account(user_id: int, password: str) -> None:
    """Owner-only: removes the workspace, its sites and every member. Irreversible."""
    async with session_scope() as s:
        user = await s.get(User, user_id)
        if user is None or not verify_password(password, user.password_hash):
            raise AuthError("Your password is incorrect.")
        if user.role != "owner":
            raise ServiceError("Only the workspace owner can delete it.")
        acc = await s.get(Account, user.account_id)
        if acc.kind == "operator":
            raise ServiceError("The operator workspace cannot be deleted.")
        account_id = acc.id
        site_ids = list(await s.scalars(select(Site.id).where(Site.account_id == account_id)))
    from . import sites as site_service

    for sid in site_ids:  # also purges each site's memories and knowledge index
        await site_service.delete_site(sid)
    async with session_scope() as s:
        acc = await s.get(Account, account_id)
        if acc is not None:
            await s.delete(acc)
