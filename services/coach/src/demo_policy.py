"""Deterministic safety contract for the documented Demo Day Coach turn."""

import re
from collections.abc import Sequence

from src.schemas import EvidenceSource

DEMO_PROMPT = (
    "On a desecrated Time-Lost jewel, when should I use Omen of Light versus Omen of "
    "Sinistral Annulment? Use only verified knowledge-base evidence; do not discuss drop "
    "sources or current prices."
)


def required_tools(message: str) -> tuple[str, ...]:
    """Return mandatory tools for stable, release-scripted prompts."""
    return ("retrieve_knowledge",) if _normalized(message) == _normalized(DEMO_PROMPT) else ()


def is_demo_knowledge_query(query: str) -> bool:
    """Identify the scripted scope even when the model only forwards the core question."""
    normalized = _normalized(query)
    return all(
        term in normalized
        for term in ("omen of light", "omen of sinistral annulment", "time-lost")
    )


def validate_required_tools(required: object, used: Sequence[str]) -> None:
    """Reject a model turn that ignored deterministic routing requirements."""
    if required is None:
        return
    if not isinstance(required, list) or not all(isinstance(name, str) for name in required):
        raise RuntimeError("Agent returned an invalid required-tools contract")
    expected = set(required)
    actual = set(used)
    if expected != actual or len(used) != len(actual):
        raise RuntimeError(
            "Agent tool trace did not exactly match the required tools: "
            f"expected {sorted(expected)}, got {sorted(actual)}"
        )


def validate_demo_answer(
    message: str, answer: str, sources: Sequence[EvidenceSource]
) -> None:
    """Enforce the two tooltip scopes and the unsupported Time-Lost limitation."""
    if not required_tools(message):
        return
    lowered = answer.casefold()
    required_claims = (
        "omen of light",
        "desecrated modifier",
        "omen of sinistral annulment",
        "prefix modifier",
        "cannot",
        "time-lost",
    )
    if not all(claim in lowered for claim in required_claims):
        raise RuntimeError("Demo answer omitted a required scope or limitation")
    associations = (
        re.compile(
            r"omen of light(?:(?!omen of sinistral annulment).){0,200}"
            r"desecrated modifier",
            re.DOTALL,
        ),
        re.compile(
            r"omen of sinistral annulment(?:(?!omen of light).){0,200}"
            r"prefix modifier",
            re.DOTALL,
        ),
    )
    if not all(pattern.search(lowered) for pattern in associations):
        raise RuntimeError("Demo answer assigned an effect to the wrong Omen")
    if any(term in lowered for term in ("drop source", "drops from", "current price")):
        raise RuntimeError("Demo answer discussed a forbidden topic")
    if not sources or any(source.type != "knowledge" for source in sources):
        raise RuntimeError("Demo answer included non-knowledge evidence")
    expected_source = "desecration-abyss"
    expected_heading = "deterministic scope"
    if any(
        expected_source not in source.title.casefold()
        or expected_heading not in source.title.casefold()
        for source in sources
    ):
        raise RuntimeError("Demo answer cited evidence outside the audited scope")


def _normalized(value: str) -> str:
    return " ".join(value.casefold().split())
