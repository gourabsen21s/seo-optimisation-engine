"""Security helpers: SSRF protection for outbound fetches and encryption of stored credentials."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import ipaddress
import json
import socket
from typing import Any
from urllib.parse import urlsplit

from cryptography.fernet import Fernet, InvalidToken


class UnsafeURLError(ValueError):
    pass


def _is_public(ip: str) -> bool:
    addr = ipaddress.ip_address(ip)
    return not (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_reserved
                or addr.is_unspecified)


async def assert_public_url(url: str, allow_private: bool = False) -> None:
    parts = urlsplit(url)
    if parts.scheme not in ("http", "https"):
        raise UnsafeURLError(f"Unsupported scheme: {parts.scheme!r}")
    if not parts.hostname:
        raise UnsafeURLError("URL has no host")
    if allow_private:
        return
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(parts.hostname, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeURLError(f"Cannot resolve {parts.hostname}: {exc}") from exc
    for info in infos:
        if not _is_public(info[4][0]):
            raise UnsafeURLError(f"{parts.hostname} resolves to a non-public address")


class SecretBox:
    """Fernet encryption for connector credentials and API keys stored in the database."""

    def __init__(self, secret_key: str):
        if not secret_key:
            raise RuntimeError("SEO_SECRET_KEY is not set — refusing to store credentials unencrypted")
        try:
            self._fernet = Fernet(secret_key.encode())
        except ValueError:
            # Accept any passphrase by deriving a valid Fernet key from it.
            derived = base64.urlsafe_b64encode(hashlib.sha256(secret_key.encode()).digest())
            self._fernet = Fernet(derived)

    def encrypt(self, data: dict[str, Any]) -> str:
        return self._fernet.encrypt(json.dumps(data).encode()).decode()

    def decrypt(self, token: str | None) -> dict[str, Any]:
        if not token:
            return {}
        try:
            return json.loads(self._fernet.decrypt(token.encode()))
        except InvalidToken as exc:
            raise RuntimeError("Cannot decrypt stored credentials — was SEO_SECRET_KEY changed?") from exc


def mask(value: str) -> str:
    if not value:
        return ""
    return value[:3] + "•" * 8 + value[-2:] if len(value) > 8 else "•" * len(value)
