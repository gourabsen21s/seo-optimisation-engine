"""API dependencies: who is calling, and may they touch this resource?

Two ways in:
- a browser session cookie (customers), with a custom-header check on unsafe methods against CSRF;
- an operator API key from SEO_API_KEYS (X-API-Key / Bearer / ?api_key=), which acts as a platform operator;
- a customer API key (`rc_…`, created in Account → API keys), which acts for that one workspace.

Tenant isolation: `require_resource_access` resolves any site / job / audit / task / fix id in the path to its site
and refuses resources that belong to another account. Operators may access everything.
"""

from __future__ import annotations

import hmac
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Query, Request, status
from sqlalchemy import select

from ..core.config import get_settings
from ..db import Audit, Fix, Job, Site, Task, session_scope
from ..services.accounts import Principal, operator_account_id, principal_for_session

SESSION_COOKIE = "rc_session"
CSRF_HEADER = "x-requested-with"
UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


def _api_key(request: Request, api_key: str | None) -> str | None:
    supplied = request.headers.get("x-api-key") or api_key
    auth = request.headers.get("authorization", "")
    if not supplied and auth.lower().startswith("bearer "):
        supplied = auth[7:]
    return supplied


async def current_principal(request: Request, api_key: str | None = Query(default=None, include_in_schema=False)
                            ) -> Principal:
    cached = getattr(request.state, "principal", None)
    if cached is not None:
        return cached
    settings = get_settings()
    principal: Principal | None = None
    supplied = _api_key(request, api_key)
    if supplied:
        keys = settings.api_key_list
        if supplied.startswith("rc_"):
            # A customer API key: acts for that workspace only. Header only: keys in URLs end up in logs.
            from ..services.team import principal_for_key

            if api_key and api_key.startswith("rc_"):
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Send API keys in the Authorization header")

            principal = await principal_for_key(supplied)
            if principal is None:
                raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
        elif keys and any(hmac.compare_digest(supplied, k) for k in keys):
            principal = Principal(account_id=await operator_account_id(), user_id=None, is_superuser=True,
                                  email_verified=True, via="api_key")
        else:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid API key")
    else:
        token = request.cookies.get(SESSION_COOKIE)
        if token:
            principal = await principal_for_session(token)
        if principal is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in to continue")
        # Cookies are sent by the browser automatically, so unsafe requests must also carry a header a
        # cross-site form or image tag cannot set.
        if request.method in UNSAFE and request.headers.get(CSRF_HEADER) != "rankcrew":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing request header")
    request.state.principal = principal
    return principal


async def require_superuser(p: Principal = Depends(current_principal)) -> Principal:
    if not p.is_superuser or not p.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only platform operators can do that")
    return p


async def require_user(p: Principal = Depends(current_principal)) -> Principal:
    if p.user_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This needs a signed-in user, not an API key")
    return p


async def require_owner(p: Principal = Depends(require_user)) -> Principal:
    """A signed-in owner of the workspace (members can use the crew but not change where its messages go)."""
    from ..services.accounts import get_user

    if (await get_user(p.user_id)).role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only a workspace owner can do that")
    return p


async def _site_of(request: Request) -> int | None:
    """The site that owns whichever resource the path names (None if the path names no resource)."""
    pp = request.path_params
    async with session_scope() as s:
        if "site_id" in pp:
            return int(pp["site_id"])
        if "job_id" in pp:
            return await s.scalar(select(Job.site_id).where(Job.id == int(pp["job_id"]))) or -1
        if "audit_id" in pp:
            return await s.scalar(select(Audit.site_id).where(Audit.id == int(pp["audit_id"]))) or -1
        if "task_id" in pp:
            return await s.scalar(select(Task.site_id).where(Task.id == int(pp["task_id"]))) or -1
        if "fix_id" in pp:
            return await s.scalar(select(Fix.site_id).where(Fix.id == str(pp["fix_id"]))) or -1
    return None


async def require_resource_access(request: Request, p: Principal = Depends(current_principal)) -> Principal:
    try:
        site_id = await _site_of(request)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found") from None
    if site_id is None or p.is_superuser:
        return p
    async with session_scope() as s:
        owner = await s.scalar(select(Site.account_id).where(Site.id == site_id))
    if owner is None or owner != p.account_id:
        # 404, not 403: do not confirm that another account's resource exists.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")
    return p


async def owned_site_ids(p: Principal) -> set[int] | None:
    """Sites the principal may touch; None means all (operators)."""
    if p.is_superuser:
        return None
    async with session_scope() as s:
        return set(await s.scalars(select(Site.id).where(Site.account_id == p.account_id)))


# ── rate limiting ────────────────────────────────────────────────────────────
class RateLimiter:
    """Sliding-window limiter, per process. Account lockout (stored in the database) backs it up across workers."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str, limit: int, window: float) -> None:
        t = time.monotonic()
        q = self._hits[key]
        while q and t - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts. Wait a few minutes and try again.")
        q.append(t)
        if len(self._hits) > 50_000:  # bound memory under a flood of distinct keys: drop the least recent half
            # ponytail: per-process and in memory; move to Redis when running several API workers.
            stale = sorted(self._hits, key=lambda k: self._hits[k][-1] if self._hits[k] else 0.0)
            for k in stale[: len(stale) // 2]:
                del self._hits[k]


limiter = RateLimiter()


def client_ip(request: Request) -> str:
    # uvicorn applies X-Forwarded-For only from SEO_FORWARDED_ALLOW_IPS (your proxy), so this is the real client
    # behind a trusted proxy and cannot be spoofed by callers.
    return request.client.host if request.client else "?"


async def require_credits(request: Request, p: Principal = Depends(current_principal)) -> Principal:
    """Before starting paid work on a site: the account must be verified, active and in credit."""
    from ..services import credits

    site_id = request.path_params.get("site_id")
    account_id = p.account_id
    if site_id is not None:
        async with session_scope() as s:
            account_id = await s.scalar(select(Site.account_id).where(Site.id == int(site_id)))
    await credits.ensure(account_id, user_verified=p.email_verified if p.via == "session" else None)
    return p
