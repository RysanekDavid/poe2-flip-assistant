"""The product RAG corpus is loaded directly from the main repository."""

from src.config import APP_ROOT
from src.retrieval.chunks import load_corpus


def test_allowlisted_product_corpus_loads() -> None:
    documents = load_corpus(APP_ROOT)

    assert len(documents) > 20
    sources = {str(document.metadata["source"]) for document in documents}
    assert "docs/kb/drop-sources.md" in sources
    assert "docs/research/poe2-crafting-knowledge.md" in sources
    assert all("[REFUTED]" not in document.page_content for document in documents)

