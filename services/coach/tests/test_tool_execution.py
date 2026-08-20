"""Expected tool failures remain answerable while programming defects fail loudly."""

import json
import logging

import pytest
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.tools import tool

from src.errors import ToolInvalidInput, ToolNoResult
from src.tool_execution import tool_node


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("raised", "code"),
    [
        (ToolInvalidInput("bad input"), "tool_invalid_input"),
        (ToolNoResult("missing"), "tool_no_result"),
    ],
)
async def test_expected_tool_failure_becomes_safe_tool_message(
    raised: Exception, code: str
) -> None:
    @tool
    def lookup(query: str) -> str:
        """Test lookup."""
        raise raised

    result = await tool_node([lookup])(_state("lookup", "private query"))
    message = result["messages"][0]

    assert isinstance(message, ToolMessage)
    assert json.loads(str(message.content))["error"]["code"] == code
    assert "private query" not in str(message.content)


@pytest.mark.asyncio
async def test_unexpected_tool_failure_propagates_without_logging_arguments(
    caplog: pytest.LogCaptureFixture,
) -> None:
    secret = "private-tool-argument"

    @tool
    def broken(query: str) -> str:
        """Test defect."""
        raise RuntimeError(f"programming defect: {query}")

    caplog.set_level(logging.INFO, logger="uvicorn.error")
    with pytest.raises(RuntimeError):
        await tool_node([broken])(_state("broken", secret))

    assert "tool=broken" in caplog.text
    assert "exception=RuntimeError" in caplog.text
    assert secret not in caplog.text


@pytest.mark.asyncio
async def test_body_value_error_is_not_contained() -> None:
    @tool
    def broken(query: str) -> str:
        """Raise a programming ValueError after valid schema parsing."""
        raise ValueError(f"unexpected body bug: {query}")

    with pytest.raises(ValueError, match="unexpected body bug"):
        await tool_node([broken])(_state("broken", "valid input"))


@pytest.mark.asyncio
async def test_schema_validation_is_contained_as_invalid_input() -> None:
    @tool
    def lookup(query: str) -> str:
        """Accept a schema-validated string."""
        return query

    state = _state("lookup", "valid input")
    state["messages"][-1].tool_calls[0]["args"] = {"unexpected": True}
    result = await tool_node([lookup])(state)
    message = result["messages"][0]

    assert isinstance(message, ToolMessage)
    assert json.loads(str(message.content))["error"]["code"] == "tool_invalid_input"


def _state(name: str, query: str) -> dict[str, object]:
    return {
        "request_id": "abcdef0123456789abcdef01",
        "messages": [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": name,
                        "args": {"query": query},
                        "id": "call-test",
                        "type": "tool_call",
                    }
                ],
            )
        ],
    }
