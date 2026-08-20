"""Internal proxy identity verification regressions."""

import hashlib
import hmac

import pytest
from fastapi import Request
from pydantic import SecretStr

from src.config import Settings
from src.request_auth import ACTOR_HEADER, InvalidProxyIdentity, actor_id


def test_signed_actor_is_verified_without_exposing_user_id() -> None:
    secret = "shared-test-secret"
    actor = hmac.new(secret.encode(), b"actor:42", hashlib.sha256).hexdigest()
    signature = hmac.new(secret.encode(), f"v1:{actor}".encode(), hashlib.sha256).hexdigest()
    token = f"v1.{actor}.{signature}"
    request = Request(
        {"type": "http", "headers": [(ACTOR_HEADER.lower().encode(), token.encode())]}
    )
    settings = Settings(_env_file=None, coach_proxy_secret=SecretStr(secret))

    assert actor_id(request, settings) == actor
    assert "42" not in token


def test_invalid_actor_fails_closed_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("src.config._PRODUCTION", True)
    request = Request({"type": "http", "headers": []})
    settings = Settings(_env_file=None, coach_proxy_secret=SecretStr("shared-test-secret"))

    with pytest.raises(InvalidProxyIdentity):
        actor_id(request, settings)


def test_non_ascii_signature_fails_as_identity_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("src.config._PRODUCTION", True)
    token = f"v1.{'a' * 43}.{'é' * 64}"
    request = Request(
        {"type": "http", "headers": [(ACTOR_HEADER.lower().encode(), token.encode())]}
    )
    settings = Settings(_env_file=None, coach_proxy_secret=SecretStr("shared-test-secret"))

    with pytest.raises(InvalidProxyIdentity):
        actor_id(request, settings)
