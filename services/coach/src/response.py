"""Convert LangGraph messages into the public chat response."""

import json
import re
from collections.abc import Sequence

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage

from src.guardrails import enforce_disclaimer
from src.schemas import EvidenceSource

_CITATION = re.compile(r"\[([MLKW][0-9a-f]{12})\]")


def final_answer(messages: Sequence[BaseMessage]) -> str:
    """Return the last textual AI response and enforce the safety boundary."""
    for message in reversed(messages):
        if isinstance(message, AIMessage) and not message.tool_calls:
            content = _text_content(message.content)
            if content:
                return enforce_disclaimer(content)
    raise RuntimeError("Agent completed without a final textual response")


def turn_trace(messages: Sequence[BaseMessage]) -> tuple[list[str], list[EvidenceSource]]:
    """Extract tools and evidence produced after the most recent human message."""
    turn = _latest_turn(messages)
    tools: list[str] = []
    sources: dict[str, EvidenceSource] = {}
    for message in turn:
        if not isinstance(message, ToolMessage):
            continue
        if message.name and message.name not in tools:
            tools.append(message.name)
        for source in _parse_sources(message.content):
            sources[source.id] = source
    cited_ids = _final_cited_ids(messages)
    if cited_ids - sources.keys():
        _add_prior_cited_sources(messages, cited_ids, sources)
    return tools, list(sources.values())


def citations_are_valid(answer: str, sources: Sequence[EvidenceSource]) -> bool:
    """Reject invented citations and require one when evidence was surfaced."""
    cited_ids = set(_CITATION.findall(answer))
    available_ids = {source.id for source in sources}
    return cited_ids <= available_ids and (not available_ids or bool(cited_ids))


def _final_cited_ids(messages: Sequence[BaseMessage]) -> set[str]:
    for message in reversed(messages):
        if isinstance(message, AIMessage) and not message.tool_calls:
            return set(_CITATION.findall(_text_content(message.content)))
    return set()


def _add_prior_cited_sources(
    messages: Sequence[BaseMessage],
    cited_ids: set[str],
    sources: dict[str, EvidenceSource],
) -> None:
    for message in messages:
        if not isinstance(message, ToolMessage):
            continue
        for source in _parse_sources(message.content):
            if source.id in cited_ids:
                sources[source.id] = source


def _latest_turn(messages: Sequence[BaseMessage]) -> Sequence[BaseMessage]:
    for index in range(len(messages) - 1, -1, -1):
        if isinstance(messages[index], HumanMessage):
            return messages[index:]
    return messages


def _parse_sources(content: object) -> list[EvidenceSource]:
    raw = _text_content(content)
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, dict) or not isinstance(payload.get("sources"), list):
        return []
    return [EvidenceSource.model_validate(item) for item in payload["sources"]]


def _text_content(content: object) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, dict) and isinstance(block.get("text"), str):
            parts.append(block["text"])
    return "\n".join(parts).strip()
