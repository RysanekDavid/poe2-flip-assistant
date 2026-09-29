"""lookup_entity tool contract and the entities field of the chat response."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.utils.function_calling import convert_to_openai_tool
from pydantic import SecretStr

from src.api import create_app
from src.config import APP_ROOT, Settings
from src.errors import ToolInvalidInput, ToolNoResult
from src.schemas import ChatResponse
from src.tools.entities import build_entity_tool

THREAD_ID = "00000000-0000-4000-8000-000000000001"
CATALOG_PATH = Settings(_env_file=None).entity_catalog_path
LIVE_SOURCE = "L0123456789ab"


class LivePriceAgent:
    """One fetch_live_prices result, then an answer that mentions items in prose and in code."""

    async def ainvoke(
        self, values: dict[str, object], config: dict[str, object]
    ) -> dict[str, object]:
        payload = {
            "unit": "Divine Orb",
            "items": [
                {
                    "item_name": "Omen of Light",
                    "value_div": 2.5,
                    "fetched_at": "2026-09-29 10:00:00",
                    "id": LIVE_SOURCE,
                },
            ],
            "sources": [{"id": LIVE_SOURCE, "type": "live", "title": "Local poll", "url": None}],
        }
        tool = ToolMessage(
            content=json.dumps(payload), name="fetch_live_prices", tool_call_id="call-1"
        )
        answer = (
            f"Omen of Light is 2.5 Divine Orbs [{LIVE_SOURCE}]; about 3 div with fees. "
            "Ignore `Greater Exalted Orb` in code."
        )
        return {"messages": [*values["messages"], tool, AIMessage(content=answer)]}


def test_chat_response_carries_annotated_entities(
    market_db: Path, item_catalog_manifest: Path
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_item_catalog_path=item_catalog_manifest,
        corpus_dir=APP_ROOT,
    )
    app = create_app(settings=settings, agent_factory=lambda _settings: LivePriceAgent())
    with TestClient(app) as client:
        response = client.post("/chat", json={"message": "Omen price?", "thread_id": THREAD_ID})

    assert response.status_code == 200
    body = ChatResponse.model_validate(response.json())
    assert [entity.id for entity in body.entities] == ["omen-of-light", "divine"]
    omen, divine = body.entities
    assert omen.mentions == ["Omen of Light"]
    assert omen.price_div == 2.5
    assert omen.price_at == "2026-09-29T10:00:00Z"
    assert omen.icon_url and omen.icon_url.startswith("https://web.poecdn.com/gen/image/")
    assert omen.summary and "Orb of Annulment" in omen.summary
    assert divine.mentions == ["Divine Orbs", "3 div"]
    assert divine.price_div is None
    assert set(response.json()["entities"][0]) == {
        "id",
        "name",
        "kind",
        "icon_url",
        "summary",
        "directions",
        "poe2db_url",
        "mentions",
        "price_div",
        "price_at",
    }
    assert response.json()["unlinked_mentions"] == []


def test_chat_start_up_fails_loudly_without_an_entity_catalog(
    market_db: Path, item_catalog_manifest: Path, tmp_path: Path
) -> None:
    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_db_path=market_db,
        configured_item_catalog_path=item_catalog_manifest,
        configured_entity_catalog_path=tmp_path / "missing.json.gz",
        corpus_dir=APP_ROOT,
    )
    app = create_app(settings=settings, agent_factory=lambda _settings: LivePriceAgent())
    with pytest.raises(RuntimeError, match="Entity catalog"), TestClient(app):
        pass


def test_lookup_entity_returns_one_card_with_evidence() -> None:
    tool = build_entity_tool(CATALOG_PATH)

    exact = json.loads(tool.invoke({"name": "fracturing orb"}))
    plural = json.loads(tool.invoke({"name": "Omens of Light"}))
    fuzzy = json.loads(tool.invoke({"name": "Fracturing Orbb"}))

    assert exact["entity"]["id"] == "fracturing-orb"
    assert exact["exact"] is True
    assert "Fracture a random modifier" in exact["entity"]["summary"]
    assert exact["sources"][0]["type"] == "game_data"
    assert exact["sources"][0]["id"] == exact["evidence_id"]
    assert exact["evidence_id"].startswith("D")
    assert plural["entity"]["id"] == "omen-of-light"
    assert fuzzy["entity"]["id"] == "fracturing-orb"
    assert fuzzy["exact"] is False


def test_lookup_entity_fails_loudly_on_unknown_or_blank_names() -> None:
    tool = build_entity_tool(CATALOG_PATH)
    with pytest.raises(ToolNoResult):
        tool.invoke({"name": "Completely Imaginary Widget"})
    with pytest.raises(ToolInvalidInput):
        tool.invoke({"name": " x "})


def test_lookup_entity_schema_is_strict() -> None:
    provider_tool = convert_to_openai_tool(build_entity_tool(CATALOG_PATH), strict=True)
    schema = provider_tool["function"]["parameters"]
    assert schema["additionalProperties"] is False
    assert schema["required"] == ["name"]
