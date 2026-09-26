"""Health flags the deploy gate relies on, and the non-blocking knowledge warm-up."""

import asyncio
import logging
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from pydantic import SecretStr

from src.api import create_app
from src.config import APP_ROOT, Settings
from src.tools.market_readiness import market_readiness


class FakeAgent:
    async def ainvoke(
        self, values: dict[str, object], config: dict[str, object]
    ) -> dict[str, object]:
        return {"messages": [*values["messages"], AIMessage(content="Local answer")]}


def test_agent_build_failure_is_reported_not_hidden(
    market_db: Path, item_catalog_manifest: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """A strict tool-schema or import defect must fail the deploy gate, not every user turn."""

    def broken_factory(_settings: Settings) -> FakeAgent:
        raise ValueError("strict schema rejected: additionalProperties")

    caplog.set_level(logging.ERROR, logger="uvicorn.error")
    settings = _settings(market_db, item_catalog_manifest)
    app = create_app(settings=settings, agent_factory=broken_factory)

    with TestClient(app) as client:
        health = client.get("/health").json()

    assert health["agent_ready"] is False
    assert health["status"] == "degraded"
    assert "coach_agent_build outcome=error exception=ValueError" in caplog.text


def test_agent_ready_builds_the_graph_once(market_db: Path, item_catalog_manifest: Path) -> None:
    builds = {"count": 0}

    def counting_factory(_settings: Settings) -> FakeAgent:
        builds["count"] += 1
        return FakeAgent()

    app = create_app(
        settings=_settings(market_db, item_catalog_manifest), agent_factory=counting_factory
    )
    with TestClient(app) as client:
        first = client.get("/health").json()
        client.get("/health")

    assert first["agent_ready"] is True
    assert first["status"] == "ok"
    assert builds["count"] == 1


def test_real_agent_graph_builds_without_a_model_call(
    market_db: Path, item_catalog_manifest: Path
) -> None:
    """build_agent (ChatOpenAI client, strict bind_tools, compile) is network-free."""
    app = create_app(settings=_settings(market_db, item_catalog_manifest))

    with TestClient(app) as client:
        assert client.get("/health").json()["agent_ready"] is True


def test_market_schema_and_freshness_are_reported_separately(
    market_db: Path, item_catalog_manifest: Path, tmp_path: Path
) -> None:
    stale = (datetime.now(UTC) - timedelta(hours=2)).isoformat()
    with sqlite3.connect(market_db) as connection:
        connection.execute("UPDATE item_spark SET updated_at = ?", (stale,))
    app = create_app(settings=_settings(market_db, item_catalog_manifest), agent_factory=_fake)

    with TestClient(app) as client:
        health = client.get("/health").json()

    assert health["market_schema_ready"] is True
    assert health["market_fresh"] is False
    assert health["market_ready"] is False
    missing = market_readiness(tmp_path / "typo.db")
    assert (missing.schema_ready, missing.fresh) == (False, False)


def test_missing_snapshot_index_is_a_schema_defect(market_db: Path) -> None:
    with sqlite3.connect(market_db) as connection:
        connection.execute("DROP INDEX idx_snapshots_item_time")

    assert market_readiness(market_db).schema_ready is False


@pytest.mark.parametrize("fails", [False, True])
def test_knowledge_warmup_runs_in_background_and_never_blocks_startup(
    fails: bool,
    market_db: Path,
    item_catalog_manifest: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    calls = {"count": 0}

    def warmer() -> None:
        calls["count"] += 1
        if fails:
            raise RuntimeError("embedding provider unavailable")

    caplog.set_level(logging.INFO, logger="uvicorn.error")
    settings = _settings(market_db, item_catalog_manifest).model_copy(
        update={"warm_knowledge_on_start": True}
    )
    app = create_app(settings=settings, agent_factory=_fake, knowledge_warmer=warmer)

    with TestClient(app) as client:
        task = app.state.knowledge_warmup
        assert task is not None
        client.portal.call(asyncio.wait_for, _await(task), 5)
        assert client.get("/health").status_code == 200

    assert calls["count"] == 1
    expected = "outcome=error" if fails else "outcome=ok"
    assert f"coach_knowledge_warmup {expected}" in caplog.text


async def _await(task: "asyncio.Task[None]") -> None:
    await task


def _fake(_settings: Settings) -> FakeAgent:
    return FakeAgent()


def _settings(market_db: Path, item_catalog_manifest: Path) -> Settings:
    return Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
