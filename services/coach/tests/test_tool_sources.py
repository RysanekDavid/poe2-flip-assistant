"""External and persisted tool-source failures are contained narrowly."""

import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import pytest
from langchain_core.messages import AIMessage, ToolMessage

from src.errors import ToolSourceUnavailable
from src.tool_execution import tool_node
from src.tools import market, search

_SOURCE_ERROR_CODES = [
    sqlite3.SQLITE_BUSY,
    sqlite3.SQLITE_LOCKED,
    sqlite3.SQLITE_CANTOPEN,
    sqlite3.SQLITE_IOERR,
    sqlite3.SQLITE_CORRUPT,
    sqlite3.SQLITE_NOTADB,
    sqlite3.SQLITE_READONLY,
]


def test_malformed_web_provider_response_is_source_unavailable() -> None:
    with pytest.raises(ToolSourceUnavailable):
        search._normalized_results({"unexpected": []})


@pytest.mark.asyncio
async def test_locked_market_database_becomes_safe_source_error(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = tmp_path / "market.db"
    database.touch()
    monkeypatch.setattr(market, "get_settings", lambda: SimpleNamespace(poe_db_path=database))

    def locked(*_args: object, **_kwargs: object) -> sqlite3.Connection:
        error = sqlite3.OperationalError("database table is locked")
        error.sqlite_errorcode = sqlite3.SQLITE_LOCKED | (2 << 8)
        raise error

    monkeypatch.setattr(market.sqlite3, "connect", locked)
    state = {
        "request_id": "abcdef0123456789abcdef01",
        "messages": [_market_call()],
    }
    result = await tool_node([market.analyze_market_history])(state)
    message = result["messages"][0]

    assert isinstance(message, ToolMessage)
    assert message.status == "error"
    assert json.loads(str(message.content))["error"]["code"] == "tool_source_unavailable"


@pytest.mark.asyncio
async def test_market_query_programming_error_propagates(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    database = tmp_path / "market.db"
    database.touch()
    monkeypatch.setattr(market, "get_settings", lambda: SimpleNamespace(poe_db_path=database))

    def broken_query(*_args: object, **_kwargs: object) -> sqlite3.Connection:
        error = sqlite3.OperationalError("no such column: typo")
        error.sqlite_errorcode = sqlite3.SQLITE_ERROR
        raise error

    monkeypatch.setattr(market.sqlite3, "connect", broken_query)
    state = {
        "request_id": "abcdef0123456789abcdef01",
        "messages": [_market_call()],
    }

    with pytest.raises(sqlite3.OperationalError, match="no such column"):
        await tool_node([market.analyze_market_history])(state)


@pytest.mark.parametrize("primary_code", _SOURCE_ERROR_CODES)
def test_market_source_error_uses_primary_sqlite_code(primary_code: int) -> None:
    error = sqlite3.OperationalError("redacted database failure")
    error.sqlite_errorcode = primary_code | (7 << 8)

    with pytest.raises(ToolSourceUnavailable):
        market._raise_market_source_error(error)


def _market_call() -> AIMessage:
    return AIMessage(
        content="",
        tool_calls=[
            {
                "name": "analyze_market_history",
                "args": {"items": ["Divine Orb"], "days": 7},
                "id": "call-market",
                "type": "tool_call",
            }
        ],
    )
