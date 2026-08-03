"""Model transport configuration regressions."""

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, ToolMessage
from pydantic import SecretStr

from src.agent import AgentState, _model_request, build_chat_model
from src.config import Settings


def test_agent_uses_responses_api_for_reasoning_tool_round_trips() -> None:
    settings = Settings(_env_file=None, openai_api_key=SecretStr("test-key"))

    model = build_chat_model(settings)

    assert model.use_responses_api is True
    assert model.reasoning == {"effort": "medium"}
    assert model.output_version == "responses/v1"
    assert model.use_previous_response_id is False
    assert model.store is True


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

    payload = model._get_request_payload(
        messages, previous_response_id=previous_response_id
    )

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


def _state(
    messages: list[BaseMessage], required_tools: list[str] | None = None
) -> AgentState:
    return AgentState(
        messages=messages,
        blocked=False,
        item_incomplete=False,
        item_inspection=None,
        required_tools=required_tools or [],
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
