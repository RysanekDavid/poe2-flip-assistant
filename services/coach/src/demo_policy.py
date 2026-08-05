"""Deterministic safety contract for the documented Demo Day Coach turn."""

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
    """Identify the scripted scope even when the model forwards only the core question."""
    normalized = _normalized(query)
    return all(
        term in normalized for term in ("omen of light", "omen of sinistral annulment", "time-lost")
    )


def validate_required_tools(required: object, used: Sequence[str]) -> None:
    """Reject only scripted turns that ignored deterministic routing requirements."""
    if required is None:
        return
    if not isinstance(required, list) or not all(isinstance(name, str) for name in required):
        raise RuntimeError("Agent returned an invalid required-tools contract")
    expected = set(required)
    if not expected:
        return
    actual = set(used)
    if expected != actual or len(used) != len(actual):
        raise RuntimeError(
            "Agent tool trace did not exactly match the required tools: "
            f"expected {sorted(expected)}, got {sorted(actual)}"
        )


def deterministic_demo_answer(message: str, sources: Sequence[EvidenceSource]) -> str | None:
    """Synthesize the scripted answer from the single audited evidence source."""
    if not required_tools(message):
        return None
    source = _validated_demo_source(sources)
    citation = f"[{source.id}]"
    return (
        "**Verified tooltip scope**\n\n"
        "- **Omen of Light:** Use it when the intended Annulment target is a "
        f"Desecrated modifier; it limits removal to Desecrated modifiers. {citation}\n"
        "- **Omen of Sinistral Annulment:** Use it only when removing a prefix is "
        "acceptable; it limits removal to prefix modifiers and does not select a "
        f"particular prefix. {citation}\n"
        "- **Time-Lost limitation:** The audited evidence does not establish that "
        'removing the temporary "+1 Suffix Modifier allowed" prefix preserves an '
        f"over-cap suffix set, so that exact sequence remains unverified. {citation}\n\n"
        "Verify prices in-game before trading."
    )


def validate_demo_answer(message: str, answer: str, sources: Sequence[EvidenceSource]) -> None:
    """Reject any drift from the server-owned answer for the scripted demo turn."""
    expected = deterministic_demo_answer(message, sources)
    if expected is not None and answer != expected:
        raise RuntimeError("Demo answer drifted from the deterministic evidence contract")


def _validated_demo_source(sources: Sequence[EvidenceSource]) -> EvidenceSource:
    if len(sources) != 1 or sources[0].type != "knowledge":
        raise RuntimeError("Demo answer requires exactly one knowledge source")
    source = sources[0]
    title = source.title.casefold()
    if "desecration-abyss" not in title or "deterministic scope" not in title:
        raise RuntimeError("Demo answer cited evidence outside the audited scope")
    return source


def _normalized(value: str) -> str:
    return " ".join(value.casefold().replace("\u2011", "-").split())
