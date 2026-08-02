"""Bounded text search over item-facing RePoE sources."""

import re
from typing import Any

_SEARCH_SOURCES = (
    "base_items",
    "mods",
    "augments",
    "skills",
    "skill_gems",
    "uniques",
    "item_classes",
    "keywords",
    "tags",
    "tag_details",
    "stats_by_file",
)


def search_records(
    sources: dict[str, Any], query: str, limit: int
) -> list[dict[str, Any]]:
    """Return the strongest exact, substring, then all-token matches."""
    hits: list[tuple[int, str, str, Any]] = []
    for source_name in _SEARCH_SOURCES:
        for record_id, record in _records(sources.get(source_name)):
            score = _record_score(query, record_id, record)
            if score > 0:
                hits.append((score, source_name, record_id, record))
    hits.sort(key=lambda hit: (-hit[0], hit[1], hit[2]))
    return [
        {"source": source, "id": record_id, "data": record}
        for _, source, record_id, record in hits[:limit]
    ]


def _records(source: object) -> list[tuple[str, Any]]:
    if isinstance(source, dict):
        return list(source.items())
    if isinstance(source, list):
        return [(str(index), record) for index, record in enumerate(source)]
    return []


def _record_score(query: str, record_id: str, record: object) -> int:
    texts = [record_id, *_flatten_strings(record)]
    normalized = [" ".join(text.casefold().split()) for text in texts]
    if query in normalized:
        return 100
    if any(query in text for text in normalized):
        return 50
    words = set(re.findall(r"[a-z0-9]+", " ".join(normalized)))
    return 10 if all(token in words for token in query.split()) else 0


def _flatten_strings(value: object, depth: int = 0) -> list[str]:
    if depth > 4:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [
            text
            for child in value.values()
            for text in _flatten_strings(child, depth + 1)
        ]
    if isinstance(value, list):
        return [text for child in value for text in _flatten_strings(child, depth + 1)]
    return []
