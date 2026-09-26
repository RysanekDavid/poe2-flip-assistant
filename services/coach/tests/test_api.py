"""Internal API, deterministic routing, and optional-tool tests."""

import asyncio
import logging
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage
from openai import APITimeoutError, BadRequestError
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


class TimeoutAgent:
    """Fail exactly as the OpenAI SDK does after its configured read deadline."""

    async def ainvoke(
        self, values: dict[str, object], config: dict[str, object]
    ) -> dict[str, object]:
        request = httpx.Request("POST", "https://api.openai.com/v1/responses")
        raise APITimeoutError(request=request)


class CapturingAgent:
    """Capture trusted history and request context without invoking a provider."""

    def __init__(self) -> None:
        self.messages: list[object] = []
        self.league: object = None

    async def ainvoke(
        self, values: dict[str, object], config: dict[str, object]
    ) -> dict[str, object]:
        self.messages = list(values["messages"])
        self.league = values.get("league")
        return {"messages": [*self.messages, AIMessage(content="History answer")]}


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
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
    app = create_app(settings=settings, agent_factory=lambda _settings: FakeAgent())

    with TestClient(app) as client:
        health = client.get("/health")
        chat = client.post("/chat", json={"message": "Hi", "thread_id": THREAD_ID})

    assert health.status_code == 200
    assert health.json()["status"] == "ok"
    assert health.json()["model_configured"] is True
    assert health.json()["item_data_ready"] is True
    assert health.json()["web_search_ready"] is False
    assert health.json()["recommendations_ready"] is False
    assert health.json()["status"] == "ok"
    assert chat.status_code == 200
    assert "Local answer" in chat.json()["answer"]
    assert "search_recent_poe2" not in {tool.name for tool in get_tools(settings)}


@pytest.mark.parametrize(
    "history",
    [
        [{"role": "assistant", "content": "wrong first role"}],
        [
            {"role": "user", "content": "one"},
            {"role": "user", "content": "wrong alternation"},
        ],
        [
            {"role": role, "content": f"message-{index}"}
            for index, role in enumerate(["user", "assistant"] * 8)
        ],
    ],
)
def test_chat_rejects_untrusted_history_shapes(
    history: list[dict[str, str]],
    market_db: Path,
    item_catalog_manifest: Path,
    tmp_path: Path,
) -> None:
    settings = _test_settings(market_db, item_catalog_manifest, tmp_path)
    app = create_app(settings=settings, agent_factory=lambda _s: FakeAgent())

    with TestClient(app) as client:
        response = client.post(
            "/chat", json={"message": "Hi", "thread_id": THREAD_ID, "history": history}
        )

    assert response.status_code == 422


def test_chat_passes_last_seven_completed_turns_before_current_prompt(
    market_db: Path,
    item_catalog_manifest: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    settings = _test_settings(market_db, item_catalog_manifest, tmp_path)
    agent = CapturingAgent()
    app = create_app(settings=settings, agent_factory=lambda _s: agent)
    history = [
        {"role": role, "content": f"history-{index}"}
        for index, role in enumerate(["user", "assistant"] * 7)
    ]

    with TestClient(app) as client:
        response = client.post(
            "/chat",
            json={"message": "current", "thread_id": THREAD_ID, "history": history},
        )

    assert response.status_code == 200
    assert len(agent.messages) == 15
    assert [type(message) for message in agent.messages] == [
        *[HumanMessage, AIMessage] * 7,
        HumanMessage,
    ]
    assert agent.messages[-1].content == "current"
    assert not list(tmp_path.rglob("coach-checkpoints.db"))


def test_chat_rejects_an_over_long_league(
    market_db: Path, item_catalog_manifest: Path, tmp_path: Path
) -> None:
    settings = _test_settings(market_db, item_catalog_manifest, tmp_path)
    app = create_app(settings=settings, agent_factory=lambda _s: FakeAgent())

    with TestClient(app) as client:
        response = client.post(
            "/chat",
            json={"message": "Hi", "thread_id": THREAD_ID, "league": "L" * 61},
        )

    assert response.status_code == 422


def test_chat_without_openai_key_returns_actionable_503(
    market_db: Path, item_catalog_manifest: Path, tmp_path: Path
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=None,
        configured_db_path=market_db,
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
    app = create_app(settings=settings, agent_factory=lambda _settings: FakeAgent())

    with TestClient(app) as client:
        response = client.post("/chat", json={"message": "Hi", "thread_id": THREAD_ID})

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "internal"


def test_health_is_degraded_without_item_catalog(market_db: Path, tmp_path: Path) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_item_catalog_path=tmp_path / "missing-manifest.json",
        corpus_dir=APP_ROOT,
    )
    app = create_app(settings=settings, agent_factory=lambda _settings: FakeAgent())

    with TestClient(app) as client:
        health = client.get("/health")

    assert health.status_code == 200
    assert health.json()["status"] == "degraded"
    assert health.json()["item_data_ready"] is False


def test_orphaned_responses_tool_call_is_stateless_and_retryable(
    market_db: Path,
    item_catalog_manifest: Path,
    tmp_path: Path,
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
    agent = BadRequestAgent("No tool output found for function call call_test.")
    app = create_app(settings=settings, agent_factory=lambda _settings: agent)
    prompt = (
        "I want a Dueling Wand for Blood Mage with spell damage, +all spell skills, "
        "maximum mana, extra cold damage, spell critical chance, and cast speed. "
        "How do I craft it?"
    )

    with TestClient(app) as client:
        failed = client.post("/chat", json={"message": prompt, "thread_id": THREAD_ID})
        recovered = client.post("/chat", json={"message": prompt, "thread_id": THREAD_ID})

    assert failed.status_code == 502
    assert failed.json()["error"]["reset_conversation"] is False
    assert recovered.status_code == 200
    assert recovered.json()["answer"].startswith("Recovered answer")


def test_unrelated_openai_bad_request_remains_a_502(
    market_db: Path, item_catalog_manifest: Path, tmp_path: Path
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
    agent = BadRequestAgent("Unsupported parameter")
    app = create_app(settings=settings, agent_factory=lambda _settings: agent)

    with TestClient(app) as client:
        response = client.post("/chat", json={"message": "Hi", "thread_id": THREAD_ID})

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "provider_rejected"


def test_missing_previous_response_is_stateless_provider_rejection(
    market_db: Path,
    item_catalog_manifest: Path,
    tmp_path: Path,
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
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
    app = create_app(settings=settings, agent_factory=lambda _settings: agent)
    with TestClient(app) as client:
        response = client.post("/chat", json={"message": "Hi", "thread_id": THREAD_ID})

    assert response.status_code == 502
    assert response.json()["error"]["reset_conversation"] is False


def test_provider_timeout_returns_stateless_504(
    market_db: Path,
    item_catalog_manifest: Path,
    tmp_path: Path,
) -> None:
    settings = _test_settings(market_db, item_catalog_manifest, tmp_path)
    app = create_app(settings=settings, agent_factory=lambda _s: TimeoutAgent())
    with TestClient(app) as client:
        response = client.post("/chat", json={"message": "Hi", "thread_id": THREAD_ID})

    assert response.status_code == 504
    assert response.json()["error"]["code"] == "provider_timeout"
    assert response.json()["error"]["reset_conversation"] is False


def test_successful_request_uses_configured_total_deadline(
    market_db: Path,
    item_catalog_manifest: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = _test_settings(market_db, item_catalog_manifest, tmp_path)
    app = create_app(settings=settings, agent_factory=lambda _s: FakeAgent())
    real_timeout = asyncio.timeout
    deadlines: list[float] = []

    def track_timeout(seconds: float) -> asyncio.Timeout:
        deadlines.append(seconds)
        return real_timeout(seconds)

    monkeypatch.setattr(asyncio, "timeout", track_timeout)
    with TestClient(app) as client:
        response = client.post("/chat", json={"message": "Hi", "thread_id": THREAD_ID})

    assert response.status_code == 200
    assert deadlines == [140.0]


def test_request_timing_log_omits_prompt_and_thread(
    market_db: Path,
    item_catalog_manifest: Path,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    settings = _test_settings(market_db, item_catalog_manifest, tmp_path)
    app = create_app(settings=settings, agent_factory=lambda _s: FakeAgent())
    private_prompt = "my-private-build-note"
    caplog.set_level(logging.INFO, logger="uvicorn.error")

    with TestClient(app) as client:
        response = client.post("/chat", json={"message": private_prompt, "thread_id": THREAD_ID})

    assert response.status_code == 200
    assert "coach_timing" in caplog.text
    assert private_prompt not in caplog.text
    assert THREAD_ID not in caplog.text


def _test_settings(market_db: Path, item_catalog_manifest: Path, tmp_path: Path) -> Settings:
    return Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
