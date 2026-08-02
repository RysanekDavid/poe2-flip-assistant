"""Deterministic product-only checks for the documented Demo Day turn."""

from src.config import APP_ROOT
from src.demo_policy import (
    DEMO_PROMPT,
    deterministic_demo_answer,
    required_tools,
    validate_demo_answer,
    validate_required_tools,
)
from src.response import citations_are_valid
from src.retrieval.chunks import load_corpus
from src.schemas import EvidenceSource


def test_demo_prompt_requires_only_knowledge_tool() -> None:
    assert required_tools(DEMO_PROMPT) == ("retrieve_knowledge",)
    validate_required_tools(["retrieve_knowledge"], ["retrieve_knowledge"])


def test_demo_evidence_contains_both_scopes_and_explicit_limitation() -> None:
    chunks = [
        document
        for document in load_corpus(APP_ROOT)
        if document.metadata.get("heading")
        == "Omen of Light vs Sinistral Annulment — deterministic scope"
    ]
    content = "\n".join(document.page_content for document in chunks)

    assert "remove only **Desecrated modifiers**" in content
    assert "remove only **prefix modifiers**" in content
    assert "must not guarantee that exact interaction" in content
    assert "https://www.poe2wiki.net/wiki/Omen_of_Light" in content
    assert "https://www.poe2wiki.net/wiki/Omen_of_Sinistral_Annulment" in content


def test_demo_answer_contract_requires_cited_knowledge_and_limitation() -> None:
    source = EvidenceSource(
        id="K0123456789ab",
        type="knowledge",
        title="desecration-abyss — deterministic scope",
        url=None,
    )
    answer = deterministic_demo_answer(DEMO_PROMPT, [source])

    assert answer is not None
    assert citations_are_valid(answer, [source])
    validate_demo_answer(DEMO_PROMPT, answer, [source])
