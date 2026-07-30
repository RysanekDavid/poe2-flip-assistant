"""Internal API and optional-tool tests."""

from pathlib import Path

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from pydantic import SecretStr

from src.api import create_app
from src.config import APP_ROOT, Settings
from src.tools import get_tools

THREAD_ID = "00000000-0000-4000-8000-000000000001"


class FakeAgent:
    """Minimal graph used to verify the HTTP boundary without model calls."""

    async def ainvoke(
        self, values: dict[str, object], config: dict[str, object]
    ) -> dict[str, object]:
        return {"messages": [*values["messages"], AIMessage(content="Local answer")]}


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


def test_internal_api_works_without_tavily(market_db: Path, tmp_path: Path) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        tavily_api_key=None,
        configured_db_path=market_db,
        configured_checkpoint_path=tmp_path / "checkpoints.db",
        corpus_dir=APP_ROOT,
    )
    app = create_app(settings=settings, agent_factory=lambda _cp, _settings: FakeAgent())

    with TestClient(app) as client:
        health = client.get("/health")
        chat = client.post("/chat", json={"message": "Hi", "thread_id": THREAD_ID})

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["model_ready"] is True
    assert health.json()["web_search_ready"] is False
    assert chat.status_code == 200
    assert "Local answer" in chat.json()["answer"]
    assert "search_recent_poe2" not in {tool.name for tool in get_tools(settings)}


def test_chat_without_openai_key_returns_actionable_503(
    market_db: Path, tmp_path: Path
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=None,
        configured_db_path=market_db,
        configured_checkpoint_path=tmp_path / "checkpoints.db",
        corpus_dir=APP_ROOT,
    )
    app = create_app(settings=settings, agent_factory=lambda _cp, _settings: FakeAgent())

    with TestClient(app) as client:
        response = client.post(
            "/chat", json={"message": "Hi", "thread_id": THREAD_ID}
        )

    assert response.status_code == 503
    assert "OPENAI_API_KEY" in response.json()["detail"]
