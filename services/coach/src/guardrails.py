"""Deterministic input safety rail, enforced once at the HTTP boundary."""

import re
from dataclasses import dataclass

_INJECTION_PATTERNS = (
    re.compile(r"ignore\s+(all\s+)?(previous|prior|system)\s+instructions?", re.I),
    re.compile(
        r"(?:reveal|dump|print|show).{0,40}"
        r"(?:system\s+prompt|developer\s+message|hidden\s+instructions?)",
        re.I,
    ),
    re.compile(
        r"(?:system\s+prompt|developer\s+message|hidden\s+instructions?).{0,40}"
        r"(?:reveal|dump|print|show)",
        re.I,
    ),
    re.compile(r"jailbreak|do\s+anything\s+now", re.I),
    re.compile(
        r"(?:bypass|override|disable).{0,30}(?:guardrails?|safety|instructions?)", re.I
    ),
)
_SECRET_PATTERNS = (
    re.compile(r"POESESSID\s*[=:]\s*\S+", re.I),
    re.compile(r"(?:sk|tvly|lsv2_pt)-[A-Za-z0-9_-]{16,}"),
    re.compile(
        r"\b(?:api[_-]?key|password|secret|token)\b\s*[:=]\s*['\"]?\S{8,}", re.I
    ),
    re.compile(
        r"(?:reveal|show|print|dump|return)\s+(?:me\s+)?"
        r"(?:(?:your|the|stored|server)\s+){1,3}"
        r"(?:api\s*key|poesessid|token|secret)",
        re.I,
    ),
)
_AUTOMATION_PATTERNS = (
    re.compile(r"auto(?:matically)?\s+(buy|purchase|trade|click)", re.I),
    re.compile(r"bot\s+(?:that\s+)?(?:buys|trades|clicks)", re.I),
)


@dataclass(frozen=True)
class GuardDecision:
    """Result of a deterministic input inspection."""

    allowed: bool
    reason: str | None = None


def inspect_input(message: str) -> GuardDecision:
    """Block prompt injection, leaked secrets, and prohibited automation requests."""
    normalized = message.strip()
    if any(pattern.search(normalized) for pattern in _SECRET_PATTERNS):
        return GuardDecision(False, "Do not send session tokens or API keys to this service.")
    if _is_injection(normalized):
        return GuardDecision(False, "Prompt-injection attempt blocked.")
    if any(pattern.search(normalized) for pattern in _AUTOMATION_PATTERNS):
        return GuardDecision(False, "In-game automation is outside this read-only assistant.")
    return GuardDecision(True)


def _is_injection(message: str) -> bool:
    return any(pattern.search(message) is not None for pattern in _INJECTION_PATTERNS)
