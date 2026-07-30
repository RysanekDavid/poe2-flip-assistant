"""LangGraph orchestration for the PoE2 coach."""

from collections.abc import Sequence
from typing import Literal

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode, tools_condition

from src.config import Settings
from src.guardrails import inspect_input
from src.prompts import system_prompt
from src.tools import get_tools


class AgentState(MessagesState):
    """Conversation messages plus the deterministic guard result."""

    blocked: bool


def build_agent(checkpointer: object, settings: Settings) -> CompiledStateGraph:
    """Compile the shallow guard → agent ⇄ tools graph."""
    tools = get_tools(settings)
    model = ChatOpenAI(
        model=settings.chat_model,
        api_key=settings.require_openai_key(),
        use_responses_api=True,
        output_version="responses/v1",
        timeout=settings.request_timeout_seconds,
        max_retries=2,
    )
    model_with_tools = model.bind_tools(tools, strict=True)

    async def guard(state: AgentState) -> dict[str, object]:
        message = _last_human_text(state)
        decision = inspect_input(message)
        if decision.allowed:
            return {"blocked": False}
        return {"blocked": True, "messages": [AIMessage(content=decision.reason or "Blocked.")]}

    async def call_model(state: AgentState) -> dict[str, object]:
        messages = [SystemMessage(content=system_prompt()), *_recent_messages(state["messages"])]
        response = await model_with_tools.ainvoke(messages)
        return {"messages": [response]}

    builder = StateGraph(AgentState)
    builder.add_node("guard", guard)
    builder.add_node("agent", call_model)
    builder.add_node("tools", ToolNode(tools, handle_tool_errors=False))
    builder.add_edge(START, "guard")
    builder.add_conditional_edges(
        "guard", _route_after_guard, {"blocked": END, "agent": "agent"}
    )
    builder.add_conditional_edges("agent", tools_condition)
    builder.add_edge("tools", "agent")
    return builder.compile(checkpointer=checkpointer)


def _route_after_guard(state: AgentState) -> Literal["blocked", "agent"]:
    return "blocked" if state.get("blocked", False) else "agent"


def _last_human_text(state: AgentState) -> str:
    for message in reversed(state["messages"]):
        if isinstance(message, HumanMessage):
            return str(message.content)
    raise RuntimeError("Agent state contains no human message")


def _recent_messages(
    messages: Sequence[BaseMessage], max_human_turns: int = 8
) -> list[BaseMessage]:
    """Bound model input while retaining complete recent tool-call turns."""
    if max_human_turns < 1:
        raise ValueError("max_human_turns must be positive")
    human_indexes = [
        index for index, message in enumerate(messages) if isinstance(message, HumanMessage)
    ]
    if len(human_indexes) <= max_human_turns:
        return list(messages)
    return list(messages[human_indexes[-max_human_turns] :])
