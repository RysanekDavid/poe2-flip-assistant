"""Authenticate the internal Next.js-to-Coach request boundary."""

import hashlib
import hmac
import re

from fastapi import Request

from src.config import Settings

REQUEST_ID_HEADER = "X-Coach-Request-Id"
ACTOR_HEADER = "X-Coach-Actor"
_REQUEST_ID = re.compile(r"^[a-f0-9]{24,32}$")
_ACTOR = re.compile(r"^[A-Za-z0-9_-]{32,64}$")
_SIGNATURE = re.compile(r"^[a-f0-9]{64}$")


class InvalidProxyIdentity(PermissionError):
    """Raised when the trusted proxy identity headers are missing or invalid."""


def request_id(request: Request, settings: Settings) -> str:
    """Validate the proxy-generated correlation identifier."""
    value = request.headers.get(REQUEST_ID_HEADER, "")
    if _REQUEST_ID.fullmatch(value):
        return value
    if settings.production:
        raise InvalidProxyIdentity("Missing or invalid Coach request identity")
    return "local000000000000000000000"


def actor_id(request: Request, settings: Settings) -> str:
    """Return a verified opaque actor key for rate limiting."""
    value = request.headers.get(ACTOR_HEADER, "")
    parts = value.split(".")
    if (
        len(parts) == 3
        and parts[0] == "v1"
        and _ACTOR.fullmatch(parts[1])
        and _SIGNATURE.fullmatch(parts[2])
    ):
        expected = hmac.new(
            settings.require_proxy_secret().encode(),
            f"v1:{parts[1]}".encode(),
            hashlib.sha256,
        ).hexdigest()
        if hmac.compare_digest(parts[2], expected):
            return parts[1]
    if settings.production:
        raise InvalidProxyIdentity("Missing or invalid Coach actor identity")
    return "local-development-actor"
