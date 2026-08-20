"""Privacy-safe stateless request failure translation."""

import logging
import traceback
from time import monotonic
from typing import Literal, NoReturn

from openai import APIStatusError, BadRequestError

from src.errors import PublicCoachError

logger = logging.getLogger("uvicorn.error")


def raise_timeout(error: BaseException, request_id: str, started: float) -> NoReturn:
    log_request_timing(request_id, started, "timeout")
    raise PublicCoachError(
        "provider_timeout",
        "Coach timed out while checking its sources.",
        504,
        request_id,
        True,
        False,
    ) from error


def raise_bad_request(error: BadRequestError, request_id: str) -> NoReturn:
    _log_redacted_failure("OpenAI rejected Coach request", request_id, error)
    raise PublicCoachError(
        "provider_rejected",
        "The model provider rejected this request.",
        502,
        request_id,
        False,
        False,
    ) from error


def raise_provider_status(error: APIStatusError, request_id: str, started: float) -> NoReturn:
    log_request_timing(request_id, started, "provider_error")
    _log_redacted_failure("Model provider failed Coach request", request_id, error)
    raise PublicCoachError(
        "provider_rejected",
        "The model provider could not complete this request.",
        503,
        request_id,
        error.status_code == 429 or error.status_code >= 500,
        False,
    ) from error


def raise_fatal(
    error: Exception,
    request_id: str,
    started: float,
    code: Literal["contract_violation", "internal"],
) -> NoReturn:
    log_request_timing(request_id, started, code)
    _log_redacted_failure(f"Coach request failed code={code}", request_id, error)
    raise PublicCoachError(
        code,
        "Coach could not complete this answer safely.",
        502,
        request_id,
        False,
        False,
    ) from error


def log_request_timing(request_id: str, started: float, outcome: str) -> None:
    duration_ms = max(0, round((monotonic() - started) * 1000))
    logger.info(
        "coach_timing request_id=%s step=request round=0 duration_ms=%d outcome=%s tool_count=0",
        request_id,
        duration_ms,
        outcome,
    )


def _log_redacted_failure(message: str, request_id: str, error: BaseException) -> None:
    """Log type and traceback frames without serializing exception content."""
    frames = traceback.extract_tb(error.__traceback__)
    locations = ">".join(f"{frame.name}:{frame.lineno}" for frame in frames[-8:])
    logger.error(
        "%s request_id=%s exception=%s frames=%s",
        message,
        request_id,
        type(error).__name__,
        locations or "none",
    )
