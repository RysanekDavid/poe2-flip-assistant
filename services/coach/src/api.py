"""FastAPI boundary for the PoE2 Flip Coach."""

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from time import monotonic
from typing import Protocol

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from openai import APIConnectionError, APIStatusError, APITimeoutError, BadRequestError

from src.agent import build_agent
from src.config import Settings, get_settings
from src.demo_policy import (
    deterministic_demo_answer,
    validate_demo_answer,
    validate_required_tools,
)
from src.errors import ContractViolation, PublicCoachError
from src.failure_handling import (
    log_request_timing,
    raise_bad_request,
    raise_fatal,
    raise_provider_status,
    raise_timeout,
)
from src.guardrails import inspect_input
from src.items import catalog_ready
from src.items.models import ItemInspection
from src.patch_readiness import read_patch_readiness
from src.rate_limit import RateLimitExceeded, SlidingWindowRateLimiter
from src.request_auth import InvalidProxyIdentity, actor_id, request_id
from src.response import citations_are_valid, final_answer, turn_trace
from src.retrieval import RetrievalService
from src.schemas import (
    ChatRequest,
    ChatResponse,
    CoachErrorDetail,
    CoachErrorResponse,
    EvidenceSource,
    HealthResponse,
)
from src.thread_locks import ThreadBusy, ThreadLockPool
from src.tools.market import market_ready

logger = logging.getLogger("uvicorn.error")


class AgentRunner(Protocol):
    """Minimal async graph contract used by production and tests."""

    async def ainvoke(
        self, values: dict[str, object], config: dict[str, object]
    ) -> dict[str, object]: ...


AgentFactory = Callable[[Settings], AgentRunner]


class AgentProvider:
    """Lazily create one stateless graph and guard each conversation in-process."""

    def __init__(self, settings: Settings, factory: AgentFactory) -> None:
        self._settings = settings
        self._factory = factory
        self._agent: AgentRunner | None = None
        self._lock = asyncio.Lock()
        self._thread_locks = ThreadLockPool()

    async def get(self) -> AgentRunner:
        """Return the graph or create it once on the first chat request."""
        if self._agent is not None:
            return self._agent
        async with self._lock:
            if self._agent is None:
                self._agent = self._factory(self._settings)
        return self._agent

    def thread_scope(self, thread_id: str) -> AbstractAsyncContextManager[None]:
        """Keep one in-process request active per conversation."""
        return self._thread_locks.hold(thread_id)


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
    app.add_exception_handler(PublicCoachError, _public_error_handler)
    _register_routes(app, active_settings, retrieval_readiness)
    return app


def _lifespan(
    settings: Settings, agent_factory: AgentFactory
) -> Callable[[FastAPI], AbstractAsyncContextManager[None]]:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.agent_provider = AgentProvider(settings, agent_factory)
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
        correlation_id = _verified_correlation_id(request, settings)
        try:
            actor = actor_id(request, settings)
        except InvalidProxyIdentity as error:
            logger.warning(
                "coach_request request_id=%s outcome=proxy_auth_error exception=%s",
                correlation_id,
                type(error).__name__,
            )
            raise PublicCoachError(
                "internal",
                "Coach proxy authentication failed.",
                403,
                correlation_id,
                False,
                False,
            ) from error
        try:
            await rate_limiter.check(actor)
        except RateLimitExceeded as error:
            logger.warning(
                "coach_request request_id=%s outcome=rate_limited exception=%s",
                correlation_id,
                type(error).__name__,
            )
            raise PublicCoachError(
                "rate_limited",
                "Too many Coach requests. Try again in a minute.",
                429,
                correlation_id,
                True,
                False,
            ) from error
        return await _chat_response(payload, request, settings, correlation_id)


async def _public_error_handler(_request: Request, error: Exception) -> JSONResponse:
    if not isinstance(error, PublicCoachError):
        raise error
    body = CoachErrorResponse(
        error=CoachErrorDetail(
            code=error.code,
            message=error.message,
            request_id=error.request_id,
            retryable=error.retryable,
            reset_conversation=error.reset_conversation,
        )
    )
    headers = {"Retry-After": "60"} if error.code == "rate_limited" else None
    return JSONResponse(
        status_code=error.status_code,
        content=body.model_dump(mode="json"),
        headers=headers,
    )


def _verified_correlation_id(request: Request, settings: Settings) -> str:
    try:
        return request_id(request, settings)
    except InvalidProxyIdentity as error:
        import secrets

        correlation_id = secrets.token_hex(12)
        logger.warning(
            "coach_request request_id=%s outcome=request_id_error exception=%s",
            correlation_id,
            type(error).__name__,
        )
        raise PublicCoachError(
            "internal",
            "Coach request authentication failed.",
            403,
            correlation_id,
            False,
            False,
        ) from error


def _health_response(settings: Settings, retrieval: RetrievalService) -> HealthResponse:
    market_is_ready = market_ready(settings.poe_db_path)
    knowledge_ready = retrieval.ready
    item_data_ready = catalog_ready(settings.item_catalog_path)
    configured = settings.openai_api_key is not None
    patch = read_patch_readiness(
        settings.patch_coverage_path,
        settings.item_catalog_path,
        settings.poe_db_path,
        settings.patch_notes_max_ready_age_min,
    )
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
        patch_monitor_ready=patch.patch_monitor_ready,
        game_data_patch=patch.game_data_patch,
        latest_official_patch=patch.latest_official_patch,
        recommendations_ready=patch.recommendations_ready,
        patch_checked_at=patch.patch_checked_at,
        pending_patch_reviews=patch.pending_patch_reviews,
    )


async def _chat_response(
    payload: ChatRequest,
    request: Request,
    settings: Settings,
    request_id: str = "local000000000000000000000",
) -> ChatResponse:
    if settings.openai_api_key is None:
        raise PublicCoachError(
            "internal", "Coach is not configured.", 503, request_id, False, False
        )
    decision = inspect_input(payload.message)
    if not decision.allowed:
        logger.info(
            "coach_request request_id=%s outcome=request_rejected exception=none",
            request_id,
        )
        raise PublicCoachError(
            "request_rejected",
            decision.reason or "This request cannot be processed safely.",
            400,
            request_id,
            False,
            False,
        )
    provider: AgentProvider = request.app.state.agent_provider
    thread_id = str(payload.thread_id)
    started = monotonic()
    try:
        async with provider.thread_scope(thread_id):
            return await _locked_chat_response(
                payload, provider, settings, request_id, thread_id, started
            )
    except ThreadBusy as error:
        logger.info(
            "coach_request request_id=%s outcome=thread_busy exception=%s",
            request_id,
            type(error).__name__,
        )
        raise PublicCoachError(
            "thread_busy",
            "This conversation is already processing a request.",
            409,
            request_id,
            True,
            False,
        ) from error


async def _locked_chat_response(
    payload: ChatRequest,
    provider: AgentProvider,
    settings: Settings,
    request_id: str,
    thread_id: str,
    started: float,
) -> ChatResponse:
    try:
        response = await _invoke_agent(payload, provider, settings, request_id)
        log_request_timing(request_id, started, "ok")
        return response
    except asyncio.CancelledError:
        log_request_timing(request_id, started, "cancelled")
        raise
    except (TimeoutError, APITimeoutError) as error:
        raise_timeout(error, request_id, started)
    except APIConnectionError as error:
        raise_timeout(error, request_id, started)
    except BadRequestError as error:
        log_request_timing(request_id, started, "provider_error")
        raise_bad_request(error, request_id)
    except APIStatusError as error:
        raise_provider_status(error, request_id, started)
    except ContractViolation as error:
        raise_fatal(error, request_id, started, "contract_violation")
    except Exception as error:
        raise_fatal(error, request_id, started, "internal")


async def _invoke_agent(
    payload: ChatRequest,
    provider: AgentProvider,
    settings: Settings,
    request_id: str,
) -> ChatResponse:
    agent = await provider.get()
    async with asyncio.timeout(settings.total_request_timeout_seconds):
        history = [
            HumanMessage(content=message.content)
            if message.role == "user"
            else AIMessage(content=message.content)
            for message in payload.history
        ]
        result = await agent.ainvoke(
            {
                "messages": [*history, HumanMessage(content=payload.message)],
                "request_id": request_id,
            },
            {
                "configurable": {"thread_id": str(payload.thread_id)},
                "recursion_limit": settings.max_tool_iterations * 2 + 4,
            },
        )
        return _completed_response(result, payload, request_id)


def _completed_response(
    result: dict[str, object], payload: ChatRequest, request_id: str
) -> ChatResponse:
    """Validate one graph result and expose only grounded evidence."""
    try:
        messages = _validated_messages(result)
        tools, sources = turn_trace(messages)
        processors: list[str] = []
        validate_required_tools(result.get("required_tools"), tools)
        _merge_item_inspection(result, processors, sources)
        model_answer = final_answer(messages)
        answer = deterministic_demo_answer(payload.message, sources) or model_answer
        if not citations_are_valid(answer, sources):
            raise ContractViolation("Agent returned an ungrounded citation set")
        validate_demo_answer(payload.message, answer, sources)
    except ContractViolation:
        raise
    except (LookupError, RuntimeError, ValueError) as error:
        raise ContractViolation("Agent result failed validation") from error
    return ChatResponse(
        thread_id=payload.thread_id,
        request_id=request_id,
        answer=answer,
        tools_used=tools,
        processors_used=processors,
        sources=sources,
    )


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
