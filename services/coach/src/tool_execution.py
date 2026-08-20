"""Execute tool calls with narrow expected-failure containment and private logging."""

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable, Sequence
from time import monotonic

import httpx
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import BaseTool
from openai import APIConnectionError, APITimeoutError
from pydantic import BaseModel, ValidationError
from tavily.errors import (
    BadRequestError as TavilyBadRequestError,
)
from tavily.errors import (
    ForbiddenError as TavilyForbiddenError,
)
from tavily.errors import (
    InvalidAPIKeyError as TavilyInvalidAPIKeyError,
)
from tavily.errors import (
    TimeoutError as TavilyTimeoutError,
)
from tavily.errors import (
    UsageLimitExceededError as TavilyUsageLimitExceededError,
)

from src.errors import CoachErrorCode, ToolInvalidInput, ToolNoResult, ToolSourceUnavailable

logger = logging.getLogger("uvicorn.error")
ToolCall = dict[str, object]


def tool_node(
    tools: Sequence[BaseTool],
) -> Callable[[dict[str, object]], Awaitable[dict[str, object]]]:
    """Build a node that contains only explicitly classified domain failures."""
    registry = {tool.name: tool for tool in tools}

    async def execute(state: dict[str, object]) -> dict[str, object]:
        calls = _pending_calls(state)
        messages = await asyncio.gather(
            *(_execute_one(registry, call, _request_id(state)) for call in calls)
        )
        return {"messages": messages}

    return execute


async def _execute_one(
    registry: dict[str, BaseTool], call: ToolCall, request_id: str
) -> ToolMessage:
    name = str(call.get("name", "unknown"))
    started = monotonic()
    outcome = "ok"
    exception_name = "none"
    try:
        tool = registry.get(name)
        if tool is None:
            raise RuntimeError(f"Model requested unregistered tool {name!r}")
        _validate_call(tool, call)
        result = await tool.ainvoke(call)
        if not isinstance(result, ToolMessage):
            raise RuntimeError("Tool returned an invalid message type")
        return result
    except asyncio.CancelledError:
        outcome = "cancelled"
        exception_name = "CancelledError"
        raise
    except Exception as error:
        classified = _classify_expected(error)
        if classified is None:
            outcome = "error"
            exception_name = type(error).__name__
            raise
        outcome = classified
        exception_name = type(error).__name__
        return _safe_error_message(call, name, classified)
    finally:
        _log_tool(request_id, name, started, outcome, exception_name)


def _classify_expected(error: Exception) -> CoachErrorCode | None:
    if isinstance(error, ToolInvalidInput):
        return "tool_invalid_input"
    if isinstance(error, ToolNoResult):
        return "tool_no_result"
    if isinstance(
        error,
        (
            ToolSourceUnavailable,
            FileNotFoundError,
            httpx.TimeoutException,
            httpx.NetworkError,
            APITimeoutError,
            APIConnectionError,
            TavilyTimeoutError,
            TavilyUsageLimitExceededError,
            TavilyForbiddenError,
            TavilyInvalidAPIKeyError,
            TavilyBadRequestError,
        ),
    ):
        return "tool_source_unavailable"
    return None


def _validate_call(tool: BaseTool, call: ToolCall) -> None:
    """Validate only invocation arguments before executing any tool body."""
    args = call.get("args")
    schema = tool.tool_call_schema
    if (
        not isinstance(args, dict)
        or not isinstance(schema, type)
        or not issubclass(schema, BaseModel)
    ):
        raise RuntimeError("Tool exposes an unsupported invocation schema")
    try:
        schema.model_validate(args)
    except ValidationError as error:
        raise ToolInvalidInput("Tool arguments failed schema validation") from error


def _safe_error_message(call: ToolCall, name: str, code: CoachErrorCode) -> ToolMessage:
    messages = {
        "tool_invalid_input": (
            "The tool rejected its input. Explain the limitation without guessing."
        ),
        "tool_no_result": (
            "The requested evidence was not found. Explain that no result was available."
        ),
        "tool_source_unavailable": (
            "The tool source is temporarily unavailable. Give only supported partial guidance."
        ),
    }
    content = json.dumps({"ok": False, "error": {"code": code, "message": messages[code]}})
    return ToolMessage(
        content=content,
        name=name,
        tool_call_id=str(call.get("id", "missing")),
        status="error",
    )


def _pending_calls(state: dict[str, object]) -> list[ToolCall]:
    messages = state.get("messages")
    if not isinstance(messages, list) or not messages or not isinstance(messages[-1], AIMessage):
        raise RuntimeError("Tool node received no pending model tool calls")
    return list(messages[-1].tool_calls)


def _request_id(state: dict[str, object]) -> str:
    value = state.get("request_id")
    return value if isinstance(value, str) else "missing"


def _log_tool(
    request_id: str, name: str, started: float, outcome: str, exception_name: str
) -> None:
    duration_ms = max(0, round((monotonic() - started) * 1000))
    logger.info(
        "coach_tool request_id=%s tool=%s duration_ms=%d outcome=%s exception=%s",
        request_id,
        name,
        duration_ms,
        outcome,
        exception_name,
    )
