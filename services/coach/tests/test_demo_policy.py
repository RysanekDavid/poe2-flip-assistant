"""Release-scripted Coach turn must match an exact evidence contract."""

import pytest

from src.demo_policy import (
    DEMO_PROMPT,
    deterministic_demo_answer,
    validate_demo_answer,
    validate_required_tools,
)
from src.response import citations_are_valid
from src.schemas import EvidenceSource

SOURCE = EvidenceSource(
    id="K0123456789ab",
    type="knowledge",
    title="desecration-abyss — deterministic scope",
    url=None,
)


def test_demo_requires_exact_tool_set() -> None:
    validate_required_tools(["retrieve_knowledge"], ["retrieve_knowledge"])
    with pytest.raises(RuntimeError, match="exactly match"):
        validate_required_tools(["retrieve_knowledge"], ["retrieve_knowledge", "fetch_live_prices"])


def test_demo_answer_is_deterministic_and_cited() -> None:
    answer = deterministic_demo_answer(DEMO_PROMPT, [SOURCE])

    assert answer is not None
    assert "Omen of Light" in answer and "Desecrated modifiers" in answer
    assert "Omen of Sinistral Annulment" in answer and "prefix modifiers" in answer
    assert "exact sequence remains unverified" in answer
    assert "Verify prices in-game before trading." in answer
    assert citations_are_valid(answer, [SOURCE])
    validate_demo_answer(DEMO_PROMPT, answer, [SOURCE])


def test_demo_rejects_answer_drift() -> None:
    answer = deterministic_demo_answer(DEMO_PROMPT, [SOURCE])
    assert answer is not None

    with pytest.raises(RuntimeError, match="drifted"):
        validate_demo_answer(DEMO_PROMPT, answer + " It always works.", [SOURCE])


def test_demo_requires_one_audited_source() -> None:
    wrong = SOURCE.model_copy(update={"title": "economy-meta — current prices"})
    with pytest.raises(RuntimeError, match="audited scope"):
        deterministic_demo_answer(DEMO_PROMPT, [wrong])
    with pytest.raises(RuntimeError, match="exactly one"):
        deterministic_demo_answer(DEMO_PROMPT, [SOURCE, SOURCE])


def test_non_demo_answer_is_not_overridden() -> None:
    assert deterministic_demo_answer("How does Breach work?", [SOURCE]) is None
    validate_demo_answer("How does Breach work?", "Free-form model answer", [SOURCE])
