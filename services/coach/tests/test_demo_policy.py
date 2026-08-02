"""Release-scripted Coach turn must match an exact evidence contract."""

import pytest

from src.demo_policy import DEMO_PROMPT, validate_demo_answer, validate_required_tools
from src.schemas import EvidenceSource

ANSWER = (
    "Omen of Light removes only a Desecrated modifier. Omen of Sinistral Annulment "
    "restricts removal to a prefix modifier. The evidence cannot prove the exact Time-Lost "
    "over-cap interaction."
)
SOURCE = EvidenceSource(
    id="K0123456789ab",
    type="knowledge",
    title="desecration-abyss — deterministic scope",
    url=None,
)


def test_demo_requires_exact_tool_set() -> None:
    validate_required_tools(["retrieve_knowledge"], ["retrieve_knowledge"])

    with pytest.raises(RuntimeError, match="exactly match"):
        validate_required_tools(
            ["retrieve_knowledge"], ["retrieve_knowledge", "fetch_live_prices"]
        )


def test_demo_requires_exact_knowledge_scope() -> None:
    validate_demo_answer(DEMO_PROMPT, ANSWER, [SOURCE])
    wrong = SOURCE.model_copy(update={"title": "economy-meta — current prices"})

    with pytest.raises(RuntimeError, match="audited scope"):
        validate_demo_answer(DEMO_PROMPT, ANSWER, [wrong])


def test_demo_rejects_forbidden_topics() -> None:
    with pytest.raises(RuntimeError, match="forbidden topic"):
        validate_demo_answer(DEMO_PROMPT, ANSWER + " Current price is unknown.", [SOURCE])


def test_demo_rejects_swapped_omen_effects() -> None:
    swapped = (
        "Omen of Light removes only a prefix modifier. Omen of Sinistral Annulment "
        "removes only a Desecrated modifier. The evidence cannot prove the exact "
        "Time-Lost interaction."
    )

    with pytest.raises(RuntimeError, match="wrong Omen"):
        validate_demo_answer(DEMO_PROMPT, swapped, [SOURCE])
