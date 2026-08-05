"""Model transport configuration regressions."""

import logging
from pathlib import Path

import pytest
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from langchain_core.tools import tool
from pydantic import SecretStr, ValidationError

from src.agent import (
    AgentState,
    _log_timing,
    _model_request,
    _route_after_tools,
    build_agent,
    build_chat_model,
)
from src.config import Settings


def test_agent_uses_responses_api_for_reasoning_tool_round_trips() -> None:
    settings = Settings(_env_file=None, openai_api_key=SecretStr("test-key"))

    model = build_chat_model(settings)

    assert model.use_responses_api is True
    assert model.reasoning == {"effort": "medium"}
    assert model.output_version == "responses/v1"
    assert model.use_previous_response_id is False
    assert model.store is True
    assert model.request_timeout == 45.0
    assert model.max_retries == 0


def test_timeout_budget_tracks_configured_tool_rounds() -> None:
    settings = Settings(_env_file=None, max_tool_iterations=1)

    assert settings.request_timeout_seconds == 45.0
    assert settings.total_request_timeout_seconds == 140.0
    assert settings.max_tool_iterations == 1
    assert settings.chat_model == "gpt-5.4-mini"
    legacy = Settings(
        _env_file=None,
        request_timeout_seconds=20,
        total_request_timeout_seconds=70,
        max_tool_iterations=2,
    )
    assert legacy.request_timeout_seconds == 20
    assert legacy.total_request_timeout_seconds == 70
    with pytest.raises(ValidationError, match="cover every model call"):
        Settings(
            _env_file=None,
            request_timeout_seconds=45,
            max_tool_iterations=2,
            total_request_timeout_seconds=139,
        )


def test_second_tool_round_forces_final_model_without_another_tool_node() -> None:
    messages: list[BaseMessage] = [HumanMessage(content="complex request")]
    for round_number in (1, 2):
        messages.extend(
            [
                AIMessage(
                    content="",
                    tool_calls=[
                        {
                            "name": "lookup_poe2_game_data",
                            "args": {"query": f"round-{round_number}"},
                            "id": f"call-{round_number}",
                            "type": "tool_call",
                        }
                    ],
                ),
                ToolMessage(
                    content="{}",
                    name="lookup_poe2_game_data",
                    tool_call_id=f"call-{round_number}",
                ),
            ]
        )
        if round_number == 1:
            assert _route_after_tools(_state(messages)) == "agent"

    assert _route_after_tools(_state(messages)) == "final"


@pytest.mark.asyncio
async def test_compiled_graph_runs_two_tool_rounds_then_unbound_final_model(
    item_catalog_manifest: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = {"bound": 0, "final": 0, "tools": 0}

    @tool
    def scripted_lookup(query: str) -> str:
        """Return deterministic evidence for a graph budget test."""
        calls["tools"] += 1
        return '{"sources":[]}'

    class ScriptedModel:
        def __init__(self, *, bound: bool = False) -> None:
            self.bound = bound

        def bind_tools(self, tools: object, *, strict: bool) -> "ScriptedModel":
            assert strict is True
            return ScriptedModel(bound=True)

        async def ainvoke(self, messages: object, **kwargs: object) -> AIMessage:
            if not self.bound:
                calls["final"] += 1
                return AIMessage(content="forced final answer")
            calls["bound"] += 1
            round_number = calls["bound"]
            if round_number > 2:
                raise AssertionError("compiled graph exceeded the tool-round budget")
            call_id = f"call-{round_number}"
            return AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "scripted_lookup",
                        "args": {"query": f"round-{round_number}"},
                        "id": call_id,
                        "type": "tool_call",
                    }
                ],
                response_metadata={"id": f"resp_round_{round_number}"},
            )

    settings = Settings(
        _env_file=None,
        openai_api_key=SecretStr("test-key"),
        configured_item_catalog_path=item_catalog_manifest,
    )
    monkeypatch.setattr("src.agent.get_tools", lambda _settings: [scripted_lookup])
    monkeypatch.setattr("src.agent.build_chat_model", lambda _settings: ScriptedModel())
    graph = build_agent(None, settings)

    result = await graph.ainvoke(
        {"messages": [HumanMessage(content="complex request")], "request_id": "test-request"},
        {"recursion_limit": 8},
    )

    assert calls == {"bound": 2, "final": 1, "tools": 2}
    assert result["messages"][-1].content == "forced final answer"


def test_timing_log_never_serializes_conversation_or_tool_arguments(
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.INFO, logger="uvicorn.error")
    secret = "private-prompt-and-tool-argument"
    state = _state(
        [
            HumanMessage(content=secret),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "lookup_poe2_game_data",
                        "args": {"query": secret},
                        "id": "call-private",
                        "type": "tool_call",
                    }
                ],
            ),
        ]
    )

    _log_timing(state, "tools", 1, 0.0, "ok", 1)

    assert secret not in caplog.text
    assert "request_id=opaque-test-request" in caplog.text
    assert "step=tools round=1" in caplog.text
    assert "outcome=ok tool_count=1" in caplog.text


def test_followup_payload_links_tool_output_to_previous_response() -> None:
    settings = Settings(_env_file=None, openai_api_key=SecretStr("test-key"))
    model = build_chat_model(settings)
    tool_call_id = "call_retrieve_knowledge"
    response_id = "resp_reasoning_turn"
    messages, previous_response_id = _model_request(
        AgentState(
            messages=_reasoning_tool_messages(response_id, tool_call_id),
            blocked=False,
            item_incomplete=False,
            item_inspection=None,
            required_tools=["retrieve_knowledge"],
        )
    )

    payload = model._get_request_payload(messages, previous_response_id=previous_response_id)

    assert payload["previous_response_id"] == response_id
    assert payload["reasoning"] == {"effort": "medium"}
    assert payload["input"] == [
        {
            "content": (
                "This turn must call these tools before answering: retrieve_knowledge. "
                "For retrieve_knowledge, pass the user's complete current question as the "
                "query. Do not call any other tool."
            ),
            "role": "system",
            "type": "message",
        },
        {
            "type": "function_call_output",
            "output": '{"sources":[{"id":"K0123456789ab"}]}',
            "call_id": tool_call_id,
        },
    ]


def test_ninth_turn_starts_a_bounded_provider_chain() -> None:
    settings = Settings(_env_file=None, openai_api_key=SecretStr("test-key"))
    model = build_chat_model(settings)
    history: list[BaseMessage] = []
    for turn in range(1, 10):
        history.extend(
            [
                HumanMessage(content=f"human-turn-{turn:02d}"),
                AIMessage(
                    content=f"assistant-turn-{turn:02d}",
                    response_metadata={"id": f"resp_turn_{turn:02d}"},
                ),
            ]
        )
    history.append(HumanMessage(content="current-turn-10"))

    messages, previous_response_id = _model_request(_state(history))
    payload = model._get_request_payload(messages)
    serialized = str(payload["input"])

    assert previous_response_id is None
    assert "previous_response_id" not in payload
    assert "human-turn-01" not in serialized
    assert "assistant-turn-01" not in serialized
    assert "human-turn-03" in serialized
    assert "current-turn-10" in serialized


def _state(messages: list[BaseMessage], required_tools: list[str] | None = None) -> AgentState:
    return AgentState(
        messages=messages,
        blocked=False,
        item_incomplete=False,
        item_inspection=None,
        required_tools=required_tools or [],
        request_id="opaque-test-request",
    )


def _reasoning_tool_messages(response_id: str, tool_call_id: str) -> list[BaseMessage]:
    return [
        HumanMessage(content="Use verified knowledge."),
        AIMessage(
            content=[
                {"type": "reasoning", "id": "rs_reasoning_turn", "summary": []},
                {
                    "type": "function_call",
                    "id": "fc_retrieve_knowledge",
                    "call_id": tool_call_id,
                    "name": "retrieve_knowledge",
                    "arguments": '{"query":"Use verified knowledge."}',
                    "status": "completed",
                },
            ],
            tool_calls=[
                {
                    "name": "retrieve_knowledge",
                    "args": {"query": "Use verified knowledge."},
                    "id": tool_call_id,
                    "type": "tool_call",
                }
            ],
            response_metadata={"id": response_id},
        ),
        ToolMessage(
            content='{"sources":[{"id":"K0123456789ab"}]}',
            name="retrieve_knowledge",
            tool_call_id=tool_call_id,
        ),
    ]
