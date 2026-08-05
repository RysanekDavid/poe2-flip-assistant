"""Dense baseline and BM25/RRF hybrid retrieval over the same corpus."""

import re
import threading
from dataclasses import dataclass
from functools import lru_cache

from langchain_core.documents import Document
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore, RetrievalMode
from rank_bm25 import BM25Okapi

from src.config import Settings, get_settings
from src.retrieval.chunks import load_corpus

_TOKEN = re.compile(r"[a-z0-9+'-]+", re.I)


@dataclass(frozen=True)
class RetrievalHit:
    """One ranked knowledge chunk with stable evidence metadata."""

    document: Document
    score: float


class RetrievalService:
    """Own the shared corpus, Qdrant dense index, and BM25 index."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._lock = threading.Lock()
        self._documents: list[Document] | None = None
        self._dense: QdrantVectorStore | None = None
        self._bm25: BM25Okapi | None = None

    @property
    def ready(self) -> bool:
        """Build and validate the local lexical index without external services."""
        try:
            with self._lock:
                self._ensure_local_index_unlocked()
            return True
        except (OSError, RuntimeError, ValueError):
            return False

    def search(self, query: str, *, mode: str = "hybrid", limit: int = 4) -> list[RetrievalHit]:
        """Search the dense baseline or the improved BM25/RRF hybrid retriever."""
        if mode not in {"dense", "hybrid"}:
            raise ValueError(f"Unsupported retrieval mode: {mode}")
        if not query.strip():
            raise ValueError("Retrieval query must not be empty")
        self._ensure_indexes()
        candidate_limit = max(limit * 5, 20)
        dense = _unique_evidence(self._dense_ranked(query, candidate_limit))
        if mode == "dense":
            hits = [RetrievalHit(document=doc, score=1 / rank) for rank, doc in enumerate(dense, 1)]
            return hits[:limit]
        return self._hybrid_ranked(query, dense, limit)

    def _ensure_indexes(self) -> None:
        if self._dense is not None:
            return
        with self._lock:
            if self._dense is not None:
                return
            documents = self._ensure_local_index_unlocked()
            embeddings = OpenAIEmbeddings(
                model=self._settings.embedding_model,
                api_key=self._settings.require_openai_key(),
                timeout=self._settings.request_timeout_seconds,
                max_retries=0,
            )
            self._dense = QdrantVectorStore.from_documents(
                documents=documents,
                embedding=embeddings,
                location=":memory:",
                collection_name=self._settings.qdrant_collection,
                retrieval_mode=RetrievalMode.DENSE,
            )

    def _ensure_local_index_unlocked(self) -> list[Document]:
        documents = self._load_documents_unlocked()
        evidence_ids = [_evidence_key(document) for document in documents]
        chunk_ids = [str(document.metadata.get("chunk_id", "")) for document in documents]
        if not evidence_ids or not all(evidence_ids) or not all(chunk_ids):
            raise RuntimeError("Knowledge corpus has missing evidence or chunk IDs")
        if len(chunk_ids) != len(set(chunk_ids)):
            raise RuntimeError("Knowledge corpus has duplicate chunk IDs")
        if self._bm25 is None:
            self._bm25 = BM25Okapi([_tokens(doc.page_content) for doc in documents])
        return documents

    def _load_documents_unlocked(self) -> list[Document]:
        if self._documents is None:
            self._documents = load_corpus(self._settings.corpus_dir)
        return self._documents

    def _dense_ranked(self, query: str, limit: int) -> list[Document]:
        if self._dense is None:
            raise RuntimeError("Dense index was not initialized")
        return self._dense.similarity_search(query, k=limit)

    def _hybrid_ranked(self, query: str, dense: list[Document], limit: int) -> list[RetrievalHit]:
        if self._documents is None or self._bm25 is None:
            raise RuntimeError("Hybrid indexes were not initialized")
        bm25_scores = self._bm25.get_scores(_tokens(query))
        bm25_order = sorted(range(len(bm25_scores)), key=bm25_scores.__getitem__, reverse=True)
        candidates = [self._documents[index] for index in bm25_order]
        bm25_docs = _unique_evidence(candidates)[: max(limit * 5, 20)]
        scores = _rrf_scores(dense, bm25_docs)
        documents: dict[str, Document] = {}
        for document in [*dense, *bm25_docs]:
            documents.setdefault(_evidence_key(document), document)
        ranked_ids = sorted(scores, key=scores.__getitem__, reverse=True)[:limit]
        return [RetrievalHit(document=documents[key], score=scores[key]) for key in ranked_ids]


def _rrf_scores(dense: list[Document], bm25: list[Document]) -> dict[str, float]:
    scores: dict[str, float] = {}
    for weight, documents in ((0.6, dense), (0.4, bm25)):
        for rank, document in enumerate(documents, start=1):
            key = _evidence_key(document)
            scores[key] = scores.get(key, 0.0) + weight / (60 + rank)
    return scores


def _unique_evidence(documents: list[Document]) -> list[Document]:
    unique: dict[str, Document] = {}
    for document in documents:
        unique.setdefault(_evidence_key(document), document)
    return list(unique.values())


def _evidence_key(document: Document) -> str:
    return str(document.metadata["evidence_id"])


def _tokens(text: str) -> list[str]:
    return [match.group(0).lower() for match in _TOKEN.finditer(text)]


@lru_cache(maxsize=1)
def get_retrieval_service() -> RetrievalService:
    """Return the process-wide lazy retrieval service."""
    return RetrievalService(get_settings())
