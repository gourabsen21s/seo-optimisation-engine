"""Accounts: sign-up, sign-in, sessions, email verification and password reset."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from ...core.config import get_settings
from ...integrations.notify import send_email
from ...services import accounts, billing, credits
from ...services.accounts import Principal
from ...services.integrations import get_integrations
from ..deps import CSRF_HEADER, SESSION_COOKIE, client_ip, current_principal, limiter, require_user

log = logging.getLogger(__name__)
router = APIRouter(tags=["auth"])


def csrf(request: Request) -> None:
    """Public form posts (sign-in, sign-up…) must come from our own frontend, not a cross-site form."""
    if request.headers.get(CSRF_HEADER) != "rankcrew":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Missing request header")


class SignupIn(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=200)
    name: str = Field(default="", max_length=200)
    company: str = Field(default="", max_length=200)
    accept_terms: bool = False


class LoginIn(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=200)


class EmailIn(BaseModel):
    email: str = Field(max_length=320)


class TokenIn(BaseModel):
    token: str = Field(max_length=200)


class ResetIn(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(max_length=200)


class PasswordIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(max_length=200)


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    account_name: str | None = Field(default=None, max_length=200)


class DeleteIn(BaseModel):
    password: str = Field(max_length=200)


def dev_links() -> bool:
    """Return account links in API responses (local development without a mail server). Never in production."""
    cfg = get_settings()
    return cfg.dev_links and cfg.environment in ("development", "test")


async def _base_url(request: Request) -> str | None:
    """Where links in emails point: the configured public URL. The request's Origin / Host headers are only
    trusted in explicit dev-link mode, or anyone could mint reset emails that link to their own domain."""
    public = (await get_integrations()).public_url or get_settings().public_url
    if public:
        return public.rstrip("/")
    if dev_links():
        return (request.headers.get("origin") or str(request.base_url)).rstrip("/")
    log.error("SEO_PUBLIC_URL is not set; cannot put links in account emails")
    return None


async def _email_link(request: Request, to: str, subject: str, intro: str, path: str) -> str | None:
    """Send a link email. Outside production, also return the link when no mail server is configured."""
    base = await _base_url(request)
    if base is None:
        return None
    link = f"{base}{path}"
    body = f"{intro}\n\n{link}\n\nIf you did not ask for this, you can ignore this email.\n\nRankcrew"
    try:
        sent = await send_email(to, subject, body)
    except Exception as exc:  # a mail outage must not break sign-up
        log.error("sending %r to %s failed: %s", subject, to, exc)
        sent = False
    if not sent and dev_links():
        log.warning("No SMTP server configured. Link for %s: %s", to, link)
        return link
    return None


def _set_cookie(response: Response, request: Request, token: str) -> None:
    secure = get_settings().secure_cookies or request.url.scheme == "https"
    response.set_cookie(SESSION_COOKIE, token, max_age=get_settings().session_days * 86400, httponly=True,
                        secure=secure, samesite="lax", path="/")


async def _me(p: Principal) -> dict:
    acc = await accounts.get_account(p.account_id)
    user = await accounts.get_user(p.user_id) if p.user_id else None
    cfg = get_settings()
    return {
        "user": None if user is None else {
            "id": user.id, "email": user.email, "name": user.name, "role": user.role,
            "email_verified": user.email_verified_at is not None, "created_at": user.created_at,
        },
        "account": {"id": acc.id, "name": acc.name, "kind": acc.kind, "credits": acc.balance_mc / credits.MC,
                    "metered": acc.kind == "customer"},
        "is_superuser": p.is_superuser,
        "via": p.via,
        "require_verification": cfg.require_email_verification,
        "billing_enabled": billing.enabled(),
    }


@router.post("/auth/signup", status_code=201, dependencies=[Depends(csrf)])
async def signup(body: SignupIn, request: Request, response: Response):
    limiter.hit(f"signup:{client_ip(request)}", 10, 3600)
    if not body.accept_terms:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please accept the terms to create an account.")
    user = await accounts.signup(body.email, body.password, body.name, body.company)
    token = await accounts.create_session(user.id, client_ip(request), request.headers.get("user-agent"))
    _set_cookie(response, request, token)
    link_token = await accounts.issue_token(user.id, "verify_email")
    dev_link = await _email_link(request, user.email, "Confirm your email for Rankcrew",
                                 "Welcome to Rankcrew. Confirm your email to let the crew start work:",
                                 f"/verify-email?token={link_token}")
    p = await accounts.principal_for_session(token)
    return {**(await _me(p)), "dev_verify_url": dev_link}


@router.post("/auth/login", dependencies=[Depends(csrf)])
async def login(body: LoginIn, request: Request, response: Response):
    ip = client_ip(request)
    limiter.hit(f"login:ip:{ip}", 30, 900)
    limiter.hit(f"login:email:{body.email.strip().lower()}", 10, 900)
    user = await accounts.authenticate(body.email, body.password)
    token = await accounts.create_session(user.id, ip, request.headers.get("user-agent"))
    _set_cookie(response, request, token)
    return await _me(await accounts.principal_for_session(token))


@router.post("/auth/logout", status_code=204)
async def logout(request: Request, response: Response, _: Principal = Depends(current_principal)):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        await accounts.end_session(token)
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = 204
    return response


@router.get("/auth/me")
async def me(p: Principal = Depends(current_principal)):
    return await _me(p)


@router.post("/auth/verify-email", dependencies=[Depends(csrf)])
async def verify_email(body: TokenIn, request: Request):
    limiter.hit(f"verify:{client_ip(request)}", 30, 3600)
    user = await accounts.verify_email(body.token)
    return {"ok": True, "email": user.email}


@router.post("/auth/resend-verification")
async def resend(request: Request, p: Principal = Depends(require_user)):
    limiter.hit(f"resend:{p.user_id}", 5, 3600)
    user = await accounts.get_user(p.user_id)
    if user.email_verified_at:
        return {"ok": True, "already_verified": True}
    token = await accounts.issue_token(user.id, "verify_email")
    dev_link = await _email_link(request, user.email, "Confirm your email for Rankcrew",
                                 "Confirm your email to let the crew start work:", f"/verify-email?token={token}")
    return {"ok": True, "dev_verify_url": dev_link}


@router.post("/auth/forgot-password", dependencies=[Depends(csrf)])
async def forgot(body: EmailIn, request: Request):
    limiter.hit(f"forgot:ip:{client_ip(request)}", 10, 3600)
    limiter.hit(f"forgot:email:{body.email.strip().lower()}", 3, 3600)
    user = await accounts.user_by_email(body.email)
    dev_link = None
    if user is not None:
        token = await accounts.issue_token(user.id, "reset_password")
        dev_link = await _email_link(request, user.email, "Reset your Rankcrew password",
                                     "Someone asked to reset the password for this email. The link works for one hour:",
                                     f"/reset-password?token={token}")
    # Same answer either way, so this endpoint cannot be used to discover who has an account.
    return {"ok": True, "dev_reset_url": dev_link}


@router.post("/auth/reset-password", dependencies=[Depends(csrf)])
async def reset(body: ResetIn, request: Request, response: Response):
    limiter.hit(f"reset:{client_ip(request)}", 20, 3600)
    user = await accounts.reset_password(body.token, body.password)
    token = await accounts.create_session(user.id, client_ip(request), request.headers.get("user-agent"))
    _set_cookie(response, request, token)
    return await _me(await accounts.principal_for_session(token))


class AcceptIn(BaseModel):
    token: str = Field(max_length=200)
    name: str = Field(default="", max_length=200)
    password: str = Field(max_length=200)
    accept_terms: bool = False


@router.get("/auth/invite")
async def invite_info(token: str, request: Request):
    from ...services import team

    limiter.hit(f"invite-info:{client_ip(request)}", 60, 3600)
    return await team.invite_info(token)


@router.post("/auth/accept-invite", dependencies=[Depends(csrf)])
async def accept_invite(body: AcceptIn, request: Request, response: Response):
    from ...services import team

    limiter.hit(f"accept:{client_ip(request)}", 20, 3600)
    if not body.accept_terms:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Please accept the terms to join.")
    user = await team.accept_invite(body.token, body.name, body.password)
    token = await accounts.create_session(user.id, client_ip(request), request.headers.get("user-agent"))
    _set_cookie(response, request, token)
    return await _me(await accounts.principal_for_session(token))


@router.post("/auth/change-password")
async def change_password(body: PasswordIn, request: Request, p: Principal = Depends(require_user)):
    limiter.hit(f"change:{p.user_id}", 10, 3600)
    await accounts.change_password(p.user_id, body.current_password, body.new_password,
                                   keep_token=request.cookies.get(SESSION_COOKIE))
    return {"ok": True}


@router.patch("/auth/profile")
async def profile(body: ProfileIn, p: Principal = Depends(require_user)):
    await accounts.update_profile(p.user_id, body.name, body.account_name)
    return await _me(p)


@router.post("/auth/delete-account", status_code=204)
async def delete_account(body: DeleteIn, response: Response, p: Principal = Depends(require_user)):
    limiter.hit(f"delete:{p.user_id}", 5, 3600)
    await accounts.delete_account(p.user_id, body.password)
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.status_code = 204
    return response
