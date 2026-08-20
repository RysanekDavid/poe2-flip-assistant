"""Stable internal and public failure types for Coach requests."""

from dataclasses import dataclass
from typing import Literal

CoachErrorCode = Literal[
    "tool_invalid_input",
    "tool_no_result",
    "tool_source_unavailable",
    "provider_timeout",
    "provider_rejected",
    "request_rejected",
    "contract_violation",
    "rate_limited",
    "thread_busy",
    "internal",
]


class ContractViolation(RuntimeError):
    """Raised when an agent result cannot satisfy the public response contract."""


class ToolSourceUnavailable(RuntimeError):
    """Raised when a tool's external or persisted source is temporarily unavailable."""


class ToolInvalidInput(ValueError):
    """Raised when model-provided tool arguments violate a domain boundary."""


class ToolNoResult(LookupError):
    """Raised when a valid tool query has no matching evidence."""


@dataclass
class PublicCoachError(Exception):
    """An intentionally client-safe error with recovery instructions."""

    code: CoachErrorCode
    message: str
    status_code: int
    request_id: str
    retryable: bool
    reset_conversation: bool
