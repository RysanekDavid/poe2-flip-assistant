"""Convert LangGraph messages into the public chat response."""

import json
import re
from collections.abc import Sequence

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage

from src.schemas import EvidenceSource, TurnUsage

_CITATION = re.compile(r"\[([MLKWD][0-9a-f]{12})\]")


def final_answer(messages: Sequence[BaseMessage]) -> str:
    """Return the last textual AI response."""
    for message in reversed(messages):
        if isinstance(message, AIMessage) and not message.tool_calls:
            content = _text_content(message.content)
            if content:
                return content
    raise RuntimeError("Agent completed without a final textual response")


def turn_trace(
    messages: Sequence[BaseMessage],
) -> tuple[list[str], list[EvidenceSource]]:
    """Extract tools and evidence produced after the most recent human message.

    The graph is stateless: prior turns are replayed as plain dialogue without tool messages,
    so only this turn's evidence exists and only it may be cited.
    """
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
    return tools, list(sources.values())


def citations_are_valid(answer: str, sources: Sequence[EvidenceSource]) -> bool:
    """Reject invented citations and require one when evidence was surfaced."""
    cited_ids = set(_CITATION.findall(answer))
    available_ids = {source.id for source in sources}
    return cited_ids <= available_ids and (not available_ids or bool(cited_ids))


def turn_usage(messages: Sequence[BaseMessage], *, duration_ms: int) -> TurnUsage:
    """Sum provider token usage over this turn's model calls; content is never read."""
    input_tokens = output_tokens = total_tokens = model_calls = 0
    for message in _latest_turn(messages):
        if not isinstance(message, AIMessage) or message.usage_metadata is None:
            continue
        usage = message.usage_metadata
        model_calls += 1
        input_tokens += usage["input_tokens"]
        output_tokens += usage["output_tokens"]
        total_tokens += usage["total_tokens"]
    return TurnUsage(
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        model_calls=model_calls,
        duration_ms=max(0, duration_ms),
    )


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
