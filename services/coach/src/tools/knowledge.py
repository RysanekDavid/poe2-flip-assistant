"""Hybrid retrieval tool over the curated PoE2 knowledge base."""

import json
from collections.abc import Mapping

from langchain_core.tools import tool

from src.errors import ToolInvalidInput
from src.evidence import evidence_id
from src.retrieval import get_retrieval_service


@tool
def retrieve_knowledge(query: str) -> str:
    """Retrieve stable PoE2 mechanics, crafting, farming, and currency context.

    Do not use for current prices or recent patch news.
    """
    normalized = query.strip()
    if not normalized:
        raise ToolInvalidInput("query must not be empty")
    hits = get_retrieval_service().search(normalized, mode="hybrid", limit=4)
    passages = []
    sources = []
    for hit in hits:
        metadata = hit.document.metadata
        source_id = evidence_id("K", str(metadata["chunk_id"]))
        stamp = _stamp(metadata)
        passages.append(
            {
                "id": source_id,
                "text": hit.document.page_content,
                "heading": metadata.get("heading"),
                "evidence_id": metadata.get("evidence_id"),
                "patch": metadata["patch"],
                "league": metadata["league"],
                "stamped_at": metadata["stamped_at"],
                "score": round(hit.score, 6),
            }
        )
        sources.append(
            {
                "id": source_id,
                "type": "knowledge",
                "title": f"{metadata.get('source')} — {metadata.get('heading')} ({stamp})",
                "url": None,
            }
        )
    return json.dumps({"passages": passages, "sources": sources}, ensure_ascii=False)


def _stamp(metadata: Mapping[str, object]) -> str:
    return f"patch {metadata['patch']}, {metadata['league']}, stamped {metadata['stamped_at']}"
