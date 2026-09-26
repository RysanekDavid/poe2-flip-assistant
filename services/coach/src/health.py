"""Readiness reporting and start-up warm-up; never calls an LLM."""

import asyncio
import logging
from collections.abc import Callable
from time import monotonic

from src.config import Settings
from src.items import catalog_ready
from src.patch_readiness import read_patch_readiness
from src.retrieval import RetrievalService
from src.schemas import HealthResponse
from src.tools.market_readiness import market_readiness

logger = logging.getLogger("uvicorn.error")


def health_response(
    settings: Settings, retrieval: RetrievalService, *, agent_ready: bool
) -> HealthResponse:
    """Aggregate every local readiness signal into the public health contract."""
    market = market_readiness(settings.poe_db_path)
    knowledge_ready = retrieval.ready
    item_data_ready = catalog_ready(settings.item_catalog_path)
    configured = settings.openai_api_key is not None
    patch = read_patch_readiness(
        settings.patch_coverage_path,
        settings.item_catalog_path,
        settings.poe_db_path,
        settings.patch_notes_max_ready_age_min,
    )
    ready = all((market.ready, knowledge_ready, item_data_ready, configured, agent_ready))
    return HealthResponse(
        status="ok" if ready else "degraded",
        market_ready=market.ready,
        market_schema_ready=market.schema_ready,
        market_fresh=market.fresh,
        knowledge_ready=knowledge_ready,
        item_data_ready=item_data_ready,
        model_configured=configured,
        agent_ready=agent_ready,
        web_search_ready=settings.tavily_api_key is not None,
        model=settings.chat_model,
        patch_monitor_ready=patch.patch_monitor_ready,
        game_data_patch=patch.game_data_patch,
        latest_official_patch=patch.latest_official_patch,
        recommendations_ready=patch.recommendations_ready,
        patch_checked_at=patch.patch_checked_at,
        pending_patch_reviews=patch.pending_patch_reviews,
    )


async def warm_knowledge(warmer: Callable[[], None]) -> None:
    """Embed the knowledge corpus in the background so the first question does not pay for it.

    Embedding ~800 chunks inside the first retrieve_knowledge call races that call's 45s provider
    timeout. A failure is logged and left to the first real query, which rebuilds on demand and
    fails loudly there; it must not take the service down.
    """
    started = monotonic()
    try:
        await asyncio.to_thread(warmer)
    except asyncio.CancelledError:
        raise
    except Exception as error:
        logger.error(
            "coach_knowledge_warmup outcome=error duration_ms=%d exception=%s: %s",
            _elapsed_ms(started),
            type(error).__name__,
            error,
        )
        return
    logger.info("coach_knowledge_warmup outcome=ok duration_ms=%d", _elapsed_ms(started))


def _elapsed_ms(started: float) -> int:
    return max(0, round((monotonic() - started) * 1000))
