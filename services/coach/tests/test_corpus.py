"""The product RAG corpus is loaded from the patch-stamped manifest in the main repository."""

import json
from pathlib import Path

import pytest
from langchain_core.documents import Document
from pydantic import ValidationError

from src.config import APP_ROOT
from src.retrieval import RetrievalHit
from src.retrieval.chunks import load_corpus
from src.retrieval.manifest import MANIFEST_PATH, load_manifest
from src.tools import knowledge

_REQUIRED_PLAYER_KNOWLEDGE = {
    "docs/kb/creator-videos.md",
    "docs/kb/community-reddit.md",
    "docs/research/poe2-bow-crafting-0.5.md",
    "docs/research/poe2-crafting-knowledge.md",
    "docs/research/rare-item-valuation.md",
}


def test_every_manifest_listed_file_exists() -> None:
    manifest = load_manifest(APP_ROOT)

    missing = [entry.path for entry in manifest.corpus if not (APP_ROOT / entry.path).is_file()]

    assert missing == [], f"manifest lists missing knowledge files: {missing}"
    assert {entry.path for entry in manifest.corpus} >= _REQUIRED_PLAYER_KNOWLEDGE


def test_manifest_product_corpus_loads_with_stamps() -> None:
    documents = load_corpus(APP_ROOT)

    assert len(documents) > 20
    sources = {str(document.metadata["source"]) for document in documents}
    assert "docs/kb/drop-sources.md" in sources
    assert sources >= _REQUIRED_PLAYER_KNOWLEDGE
    assert all("[REFUTED]" not in document.page_content for document in documents)
    assert all(document.metadata["patch"] and document.metadata["league"] for document in documents)
    assert all(len(str(document.metadata["stamped_at"])) == 10 for document in documents)


def test_meta_documents_are_never_ingested() -> None:
    sources = {str(document.metadata["source"]) for document in load_corpus(APP_ROOT)}

    assert "docs/kb/README.md" not in sources
    assert not any("audit" in source or "data-source" in source for source in sources)


def test_missing_manifest_listed_file_fails_loudly(tmp_path: Path) -> None:
    _write_manifest(tmp_path, [_entry("docs/kb/gone.md")])

    with pytest.raises(FileNotFoundError, match=r"docs/kb/gone\.md"):
        load_corpus(tmp_path)


def test_manifest_rejects_a_path_listed_twice(tmp_path: Path) -> None:
    entry = _entry("docs/kb/same.md")
    _write_manifest(tmp_path, [entry, entry])

    with pytest.raises(ValidationError, match="more than once"):
        load_manifest(tmp_path)


def test_knowledge_citation_title_carries_the_patch_stamp(monkeypatch: pytest.MonkeyPatch) -> None:
    document = Document(
        page_content="Omen text",
        metadata={
            "source": "docs/kb/desecration-abyss.md",
            "heading": "Omens",
            "evidence_id": "docs/kb/desecration-abyss.md#omens",
            "chunk_id": "docs/kb/desecration-abyss.md#omens#part-1",
            "patch": "0.5.4",
            "league": "Runes of Aldur",
            "stamped_at": "2026-08-02",
        },
    )

    class StubRetrieval:
        def search(self, query: str, *, mode: str, limit: int) -> list[RetrievalHit]:
            return [RetrievalHit(document=document, score=0.5)]

    monkeypatch.setattr(knowledge, "get_retrieval_service", lambda: StubRetrieval())

    payload = json.loads(knowledge.retrieve_knowledge.invoke({"query": "omens"}))

    title = payload["sources"][0]["title"]
    assert "patch 0.5.4" in title
    assert "Runes of Aldur" in title
    assert "stamped 2026-08-02" in title
    assert payload["passages"][0]["patch"] == "0.5.4"


def _entry(path: str) -> dict[str, str]:
    return {
        "path": path,
        "patch": "0.5.4",
        "league": "Runes of Aldur",
        "stamped_at": "2026-08-02",
        "sha256": "0" * 64,
    }


def _write_manifest(root: Path, corpus: list[dict[str, str]]) -> None:
    target = root / MANIFEST_PATH
    target.parent.mkdir(parents=True)
    target.write_text(
        json.dumps({"schema_version": 1, "corpus": corpus, "excluded": []}), encoding="utf-8"
    )
