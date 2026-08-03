"""Internal API, deterministic routing, and optional-tool tests."""

import json
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, ToolMessage
from openai import BadRequestError
from pydantic import SecretStr

from src.api import AgentProvider, create_app
from src.config import APP_ROOT, Settings
from src.demo_policy import DEMO_PROMPT
from src.tools import get_tools

THREAD_ID = "00000000-0000-4000-8000-000000000001"


class FakeAgent:
    """Minimal graph used to verify the HTTP boundary without model calls."""

    async def ainvoke(
        self, values: dict[str, object], config: dict[str, object]
    ) -> dict[str, object]:
        return {"messages": [*values["messages"], AIMessage(content="Local answer")]}


class DemoAgent:
    """Mock a correctly routed knowledge turn without an external model."""

    async def ainvoke(
        self, values: dict[str, object], config: dict[str, object]
    ) -> dict[str, object]:
        source = {
            "id": "K0123456789ab",
            "type": "knowledge",
            "title": "desecration-abyss — deterministic scope",
            "url": None,
        }
        answer = (
            "Omen of Light targets the revealed Desecrated mods, while Omen of Sinistral "
            "Annulment limits removal to prefix mods. The evidence does not establish "
            "that this over-cap Time\u2014Lost interaction is safe. "
            "[K0123456789ab]"
        )
        tool = ToolMessage(
            content=json.dumps({"sources": [source]}),
            name="retrieve_knowledge",
            tool_call_id="demo-tool-call",
        )
        return {
            "messages": [*values["messages"], tool, AIMessage(content=answer)],
            "required_tools": ["retrieve_knowledge"],
        }


class BadRequestAgent:
    """Raise one provider 400, then allow the same thread to continue."""

    def __init__(self, message: str, body: dict[str, object] | None = None) -> None:
        self.calls = 0
        self.message = message
        self.body = body or {}

    async def ainvoke(
        self, values: dict[str, object], config: dict[str, object]
    ) -> dict[str, object]:
        self.calls += 1
        if self.calls == 1:
            request = httpx.Request("POST", "https://api.openai.com/v1/responses")
            response = httpx.Response(400, request=request)
            raise BadRequestError(self.message, response=response, body=self.body)
        return {"messages": [*values["messages"], AIMessage(content="Recovered answer")]}


def test_blank_optional_keys_are_not_configured() -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key="",
        tavily_api_key=" ",
        langsmith_api_key="",
    )

    assert settings.openai_api_key is None
    assert settings.tavily_api_key is None
    assert settings.langsmith_api_key is None


def test_internal_api_works_without_tavily(
    market_db: Path, item_catalog_manifest: Path, tmp_path: Path
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        tavily_api_key=None,
        configured_db_path=market_db,
        configured_checkpoint_path=tmp_path / "checkpoints.db",
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
    app = create_app(settings=settings, agent_factory=lambda _cp, _settings: FakeAgent())

    with TestClient(app) as client:
        health = client.get("/health")
        chat = client.post("/chat", json={"message": "Hi", "thread_id": THREAD_ID})

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["model_configured"] is True
    assert health.json()["item_data_ready"] is True
    assert health.json()["web_search_ready"] is False
    assert chat.status_code == 200
    assert "Local answer" in chat.json()["answer"]
    assert "search_recent_poe2" not in {tool.name for tool in get_tools(settings)}


def test_chat_without_openai_key_returns_actionable_503(
    market_db: Path, item_catalog_manifest: Path, tmp_path: Path
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=None,
        configured_db_path=market_db,
        configured_checkpoint_path=tmp_path / "checkpoints.db",
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
    app = create_app(settings=settings, agent_factory=lambda _cp, _settings: FakeAgent())

    with TestClient(app) as client:
        response = client.post("/chat", json={"message": "Hi", "thread_id": THREAD_ID})

    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]


def test_health_is_degraded_without_item_catalog(market_db: Path, tmp_path: Path) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_checkpoint_path=tmp_path / "checkpoints.db",
        configured_item_catalog_path=tmp_path / "missing-manifest.json",
        corpus_dir=APP_ROOT,
    )
    app = create_app(settings=settings, agent_factory=lambda _cp, _settings: FakeAgent())

    with TestClient(app) as client:
        health = client.get("/health")

    assert health.status_code == 200
    assert health.json()["status"] == "degraded"
    assert health.json()["item_data_ready"] is False


def test_demo_prompt_enforces_mocked_tool_source_and_disclaimer(
    market_db: Path, item_catalog_manifest: Path, tmp_path: Path
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_checkpoint_path=tmp_path / "checkpoints.db",
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
    app = create_app(settings=settings, agent_factory=lambda _cp, _s: DemoAgent())

    with TestClient(app) as client:
        response = client.post("/chat", json={"message": DEMO_PROMPT, "thread_id": THREAD_ID})

    assert response.status_code == 200
    payload = response.json()
    assert payload["tools_used"] == ["retrieve_knowledge"]
    assert payload["processors_used"] == []
    assert payload["sources"][0]["type"] == "knowledge"
    assert "exact sequence remains unverified" in payload["answer"]
    assert "this over-cap Time—Lost interaction is safe" not in payload["answer"]
    assert "Verify prices in-game" in payload["answer"]


def test_orphaned_responses_tool_call_resets_conversation(
    market_db: Path,
    item_catalog_manifest: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_checkpoint_path=tmp_path / "checkpoints.db",
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
    agent = BadRequestAgent("No tool output found for function call call_test.")
    app = create_app(settings=settings, agent_factory=lambda _cp, _settings: agent)
    deleted: list[str] = []

    async def track_delete(_provider: AgentProvider, thread_id: str) -> None:
        deleted.append(thread_id)

    monkeypatch.setattr(AgentProvider, "delete_thread", track_delete)
    prompt = (
        "I want a Dueling Wand for Blood Mage with spell damage, +all spell skills, "
        "maximum mana, extra cold damage, spell critical chance, and cast speed. "
        "How do I craft it?"
    )

    with TestClient(app) as client:
        failed = client.post("/chat", json={"message": prompt, "thread_id": THREAD_ID})
        recovered = client.post("/chat", json={"message": prompt, "thread_id": THREAD_ID})

    assert failed.status_code == 409
    assert "Conversation state was reset" in failed.json()["detail"]
    assert recovered.status_code == 200
    assert recovered.json()["answer"].startswith("Recovered answer")
    assert deleted == [THREAD_ID]


def test_unrelated_openai_bad_request_remains_a_502(
    market_db: Path, item_catalog_manifest: Path, tmp_path: Path
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_checkpoint_path=tmp_path / "checkpoints.db",
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
    agent = BadRequestAgent("Unsupported parameter")
    app = create_app(settings=settings, agent_factory=lambda _cp, _settings: agent)

    with TestClient(app) as client:
        response = client.post("/chat", json={"message": "Hi", "thread_id": THREAD_ID})

    assert response.status_code == 502
    assert "Agent execution failed" in response.json()["detail"]


def test_missing_previous_response_resets_conversation(
    market_db: Path,
    item_catalog_manifest: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_checkpoint_path=tmp_path / "checkpoints.db",
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
    message = "Previous response with id 'resp_expired' not found."
    body = {
        "error": {
            "message": message,
            "type": "invalid_request_error",
            "param": "previous_response_id",
            "code": None,
        }
    }
    agent = BadRequestAgent(message, body)
    app = create_app(settings=settings, agent_factory=lambda _cp, _settings: agent)
    deleted: list[str] = []

    async def track_delete(_provider: AgentProvider, thread_id: str) -> None:
        deleted.append(thread_id)

    monkeypatch.setattr(AgentProvider, "delete_thread", track_delete)
    with TestClient(app) as client:
        response = client.post("/chat", json={"message": "Hi", "thread_id": THREAD_ID})

    assert response.status_code == 409
    assert "Conversation state was reset" in response.json()["detail"]
    assert deleted == [THREAD_ID]
