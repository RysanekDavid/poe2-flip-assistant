"""Hybrid retrieval tool over the curated PoE2 knowledge base."""

import json

from langchain_core.tools import tool

from src.retrieval import get_retrieval_service
from src.tools.evidence import evidence_id


@tool
def retrieve_knowledge(query: str) -> str:
    """Retrieve stable PoE2 mechanics, crafting, farming, and currency context.

    Do not use for current prices or recent patch news.
    """
    normalized = query.strip()
    if not normalized:
        raise ValueError("query must not be empty")
    hits = get_retrieval_service().search(normalized, mode="hybrid", limit=4)
    passages = []
    sources = []
    for hit in hits:
        metadata = hit.document.metadata
        source_id = evidence_id("K", str(metadata["chunk_id"]))
        passages.append(
            {
                "id": source_id,
                "text": hit.document.page_content,
                "heading": metadata.get("heading"),
                "evidence_id": metadata.get("evidence_id"),
                "score": round(hit.score, 6),
            }
        )
        sources.append(
            {
                "id": source_id,
                "type": "knowledge",
                "title": f"{metadata.get('source')} — {metadata.get('heading')}",
                "url": None,
            }
        )
    return json.dumps({"passages": passages, "sources": sources}, ensure_ascii=False)
