"""FastAPI boundary for the PoE2 Flip Coach."""

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from typing import Protocol

from fastapi import FastAPI, HTTPException, Request
from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from openai import BadRequestError

from src.agent import build_agent
from src.config import Settings, get_settings
from src.demo_policy import (
    deterministic_demo_answer,
    validate_demo_answer,
    validate_required_tools,
)
from src.guardrails import inspect_input
from src.items import catalog_ready
from src.items.models import ItemInspection
from src.rate_limit import RateLimitExceeded, SlidingWindowRateLimiter
from src.response import citations_are_valid, final_answer, turn_trace
from src.retrieval import RetrievalService
from src.schemas import ChatRequest, ChatResponse, EvidenceSource, HealthResponse
from src.tools.market import market_ready

logger = logging.getLogger(__name__)
_MISSING_TOOL_OUTPUT = "No tool output found for function call"


class AgentRunner(Protocol):
    """Minimal async graph contract used by production and tests."""

    async def ainvoke(
        self, values: dict[str, object], config: dict[str, object]
    ) -> dict[str, object]: ...


AgentFactory = Callable[[object, Settings], AgentRunner]


class AgentProvider:
    """Lazily create one graph while keeping the checkpointer long-lived."""

    def __init__(self, checkpointer: object, settings: Settings, factory: AgentFactory) -> None:
        self._checkpointer = checkpointer
        self._settings = settings
        self._factory = factory
        self._agent: AgentRunner | None = None
        self._lock = asyncio.Lock()

    async def get(self) -> AgentRunner:
        """Return the graph or create it once on the first chat request."""
        if self._agent is not None:
            return self._agent
        async with self._lock:
            if self._agent is None:
                self._agent = self._factory(self._checkpointer, self._settings)
        return self._agent

    async def delete_thread(self, thread_id: str) -> None:
        """Remove a thread whose generated response failed the public contract."""
        setup = getattr(self._checkpointer, "setup", None)
        delete_thread = getattr(self._checkpointer, "adelete_thread", None)
        if not callable(setup) or not callable(delete_thread):
            raise RuntimeError("Checkpointer cannot delete an invalid thread")
        await setup()
        await delete_thread(thread_id)


def create_app(
    *, settings: Settings | None = None, agent_factory: AgentFactory = build_agent
) -> FastAPI:
    """Create an app with injectable configuration and agent construction."""
    active_settings = settings or get_settings()
    retrieval_readiness = RetrievalService(active_settings)
    app = FastAPI(
        title="PoE2 Flip Coach",
        version="0.1.0",
        lifespan=_lifespan(active_settings, agent_factory),
    )
    _register_routes(app, active_settings, retrieval_readiness)
    return app


def _lifespan(
    settings: Settings, agent_factory: AgentFactory
) -> Callable[[FastAPI], AbstractAsyncContextManager[None]]:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        settings.checkpoint_db_path.parent.mkdir(parents=True, exist_ok=True)
        async with AsyncSqliteSaver.from_conn_string(
            str(settings.checkpoint_db_path)
        ) as checkpointer:
            app.state.agent_provider = AgentProvider(checkpointer, settings, agent_factory)
            yield

    return lifespan


def _register_routes(
    app: FastAPI, settings: Settings, retrieval_readiness: RetrievalService
) -> None:
    """Attach the public API without hiding request failures."""
    rate_limiter = SlidingWindowRateLimiter(settings.chat_requests_per_minute)

    @app.get("/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return _health_response(settings, retrieval_readiness)

    @app.post("/chat", response_model=ChatResponse)
    async def chat(payload: ChatRequest, request: Request) -> ChatResponse:
        try:
            await rate_limiter.check(_client_id(request))
        except RateLimitExceeded as error:
            raise HTTPException(
                status_code=429,
                detail=str(error),
                headers={"Retry-After": "60"},
            ) from error
        return await _chat_response(payload, request, settings)


def _health_response(settings: Settings, retrieval: RetrievalService) -> HealthResponse:
    market_is_ready = market_ready(settings.poe_db_path)
    knowledge_ready = retrieval.ready
    item_data_ready = catalog_ready(settings.item_catalog_path)
    configured = settings.openai_api_key is not None
    return HealthResponse(
        status=(
            "ok"
            if market_is_ready and knowledge_ready and item_data_ready and configured
            else "degraded"
        ),
        market_ready=market_is_ready,
        knowledge_ready=knowledge_ready,
        item_data_ready=item_data_ready,
        model_configured=configured,
        web_search_ready=settings.tavily_api_key is not None,
        model=settings.chat_model,
    )


def _client_id(request: Request) -> str:
    return request.client.host if request.client is not None else "unknown-client"


async def _chat_response(
    payload: ChatRequest, request: Request, settings: Settings
) -> ChatResponse:
    if settings.openai_api_key is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Coach needs OPENAI_API_KEY in its isolated process environment; "
                "restart the Coach service after configuring it."
            ),
        )
    decision = inspect_input(payload.message)
    if not decision.allowed:
        raise HTTPException(status_code=400, detail=decision.reason or "Request blocked")
    provider: AgentProvider = request.app.state.agent_provider
    try:
        agent = await provider.get()
        result = await agent.ainvoke(
            {"messages": [HumanMessage(content=payload.message)]},
            {
                "configurable": {"thread_id": str(payload.thread_id)},
                "recursion_limit": settings.max_tool_iterations * 2 + 4,
            },
        )
        return await _completed_response(result, payload, provider)
    except BadRequestError as error:
        if await _reset_orphaned_tool_call(error, provider, str(payload.thread_id)):
            raise HTTPException(
                status_code=409,
                detail=(
                    "Conversation state was reset after an invalid tool-call checkpoint. "
                    "Send the message again."
                ),
            ) from error
        logger.exception("OpenAI rejected the Coach request")
        raise HTTPException(
            status_code=502, detail="Agent execution failed; check server logs."
        ) from error
    except (FileNotFoundError, LookupError, RuntimeError, ValueError) as error:
        logger.exception("Chat request failed")
        raise HTTPException(
            status_code=503,
            detail="Chat service is temporarily unavailable; check server logs.",
        ) from error
    except Exception as error:
        logger.exception("Unexpected chat failure")
        raise HTTPException(
            status_code=502, detail="Agent execution failed; check server logs."
        ) from error


async def _completed_response(
    result: dict[str, object], payload: ChatRequest, provider: AgentProvider
) -> ChatResponse:
    """Validate one graph result and expose only grounded evidence."""
    messages = _validated_messages(result)
    tools, sources = turn_trace(messages)
    processors: list[str] = []
    validate_required_tools(result.get("required_tools"), tools)
    _merge_item_inspection(result, processors, sources)
    model_answer = final_answer(messages)
    answer = deterministic_demo_answer(payload.message, sources) or model_answer
    if not citations_are_valid(answer, sources):
        await provider.delete_thread(str(payload.thread_id))
        raise RuntimeError("Agent returned an ungrounded citation set")
    validate_demo_answer(payload.message, answer, sources)
    return ChatResponse(
        thread_id=payload.thread_id,
        answer=answer,
        tools_used=tools,
        processors_used=processors,
        sources=sources,
    )


async def _reset_orphaned_tool_call(
    error: BadRequestError, provider: AgentProvider, thread_id: str
) -> bool:
    """Discard only a checkpoint proven to contain an unmatched Responses tool call."""
    if _MISSING_TOOL_OUTPUT not in str(error):
        return False
    logger.warning("Resetting thread after an orphaned Responses API tool call")
    await provider.delete_thread(thread_id)
    return True


def _validated_messages(result: dict[str, object]) -> list[BaseMessage]:
    raw_messages = result.get("messages")
    if not isinstance(raw_messages, list):
        raise RuntimeError("Agent returned no message list")
    messages = [message for message in raw_messages if isinstance(message, BaseMessage)]
    if len(messages) != len(raw_messages):
        raise RuntimeError("Agent returned an invalid message entry")
    return messages


def _merge_item_inspection(
    result: dict[str, object], processors: list[str], sources: list[EvidenceSource]
) -> None:
    raw = result.get("item_inspection")
    if raw is None:
        return
    inspection = ItemInspection.model_validate(raw)
    if not inspection.evidence_id or not inspection.base_name:
        return
    processor = "deterministic_item_inspection"
    if processor not in processors:
        processors.append(processor)
    source = {
        "id": inspection.evidence_id,
        "type": "game_data",
        "title": f"RePoE {inspection.catalog_version} — {inspection.base_name}",
        "url": "https://repoe-fork.github.io/poe2/",
    }
    validated = EvidenceSource.model_validate(source)
    if all(getattr(existing, "id", None) != validated.id for existing in sources):
        sources.append(validated)


app = create_app()
