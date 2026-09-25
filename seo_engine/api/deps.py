"""API dependencies: API-key authentication."""

from __future__ import annotations

import hmac

from fastapi import HTTPException, Query, Request, status

from ..core.config import get_settings


async def require_api_key(request: Request, api_key: str | None = Query(default=None, include_in_schema=False)) -> None:
    settings = get_settings()
    keys = settings.api_key_list
    if not keys:
        if settings.environment == "production":
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "SEO_API_KEYS is not configured")
        return  # development: open
    supplied = request.headers.get("x-api-key") or api_key
    auth = request.headers.get("authorization", "")
    if not supplied and auth.lower().startswith("bearer "):
        supplied = auth[7:]
    if not supplied or not any(hmac.compare_digest(supplied, k) for k in keys):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or missing API key")
