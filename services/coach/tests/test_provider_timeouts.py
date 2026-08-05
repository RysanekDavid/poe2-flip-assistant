"""External evidence providers must use bounded network calls without retries."""

from pathlib import Path

import pytest
from langchain_core.documents import Document
from pydantic import SecretStr

from src.config import Settings
from src.retrieval.service import RetrievalService
from src.tools.search import search_recent_poe2


def test_embeddings_use_model_timeout_without_sdk_retries(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-openai-key"),
        corpus_dir=tmp_path,
    )
    service = RetrievalService(settings)
    captured: dict[str, object] = {}
    document = Document(
        page_content="evidence",
        metadata={"evidence_id": "K0123456789ab", "chunk_id": "chunk-1"},
    )

    class FakeEmbeddings:
        def __init__(self, **kwargs: object) -> None:
            captured.update(kwargs)

    class FakeVectorStore:
        @classmethod
        def from_documents(cls, **kwargs: object) -> object:
            return object()

    monkeypatch.setattr(service, "_ensure_local_index_unlocked", lambda: [document])
    monkeypatch.setattr("src.retrieval.service.OpenAIEmbeddings", FakeEmbeddings)
    monkeypatch.setattr("src.retrieval.service.QdrantVectorStore", FakeVectorStore)

    service._ensure_indexes()

    assert captured["timeout"] == 45.0
    assert captured["max_retries"] == 0


def test_tavily_search_uses_model_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-openai-key"),
        tavily_api_key=SecretStr("test-tavily-key"),
    )
    captured: dict[str, object] = {}

    class FakeTavilyClient:
        def __init__(self, *, api_key: str) -> None:
            assert api_key == "test-tavily-key"

        def search(self, **kwargs: object) -> dict[str, object]:
            captured.update(kwargs)
            return {"results": []}

    monkeypatch.setattr("src.tools.search.get_settings", lambda: settings)
    monkeypatch.setattr("src.tools.search.TavilyClient", FakeTavilyClient)

    result = search_recent_poe2.invoke({"query": "current patch"})

    assert result == '{"results": [], "sources": []}'
    assert captured["timeout"] == 45.0
