"""POST /internal/patch-summary: the poller's only way to get a patch summary."""

import asyncio
import logging
from time import monotonic

from fastapi import FastAPI, Request

from src.config import Settings
from src.errors import PublicCoachError
from src.failure_handling import log_request_timing, raise_provider_failure
from src.patch_summary import (
    PROMPT_VERSION,
    PatchSummarizer,
    PatchSummaryRequest,
    PatchSummaryResponse,
)
from src.rate_limit import RateLimitExceeded, SlidingWindowRateLimiter
from src.request_auth import verified_actor_id, verified_request_id

logger = logging.getLogger("uvicorn.error")

#: The poller drains at most five patches per run; ten a minute leaves room for a manual rerun.
PATCH_SUMMARIES_PER_MINUTE = 10


def register_patch_summary_route(
    app: FastAPI, settings: Settings, summarizer: PatchSummarizer
) -> None:
    """Attach the internal summary route behind the same proxy identity as /chat."""
    rate_limiter = SlidingWindowRateLimiter(PATCH_SUMMARIES_PER_MINUTE)

    @app.post("/internal/patch-summary", response_model=PatchSummaryResponse)
    async def patch_summary(payload: PatchSummaryRequest, request: Request) -> PatchSummaryResponse:
        correlation_id = verified_request_id(request, settings)
        actor = verified_actor_id(request, settings, correlation_id)
        try:
            await rate_limiter.check(actor)
        except RateLimitExceeded as error:
            raise PublicCoachError(
                "rate_limited",
                "Too many patch summary requests. Try again in a minute.",
                429,
                correlation_id,
                True,
                False,
            ) from error
        if settings.openai_api_key is None:
            raise PublicCoachError(
                "internal", "Coach is not configured.", 503, correlation_id, False, False
            )
        return await _summary_response(payload, settings, summarizer, correlation_id)


async def _summary_response(
    payload: PatchSummaryRequest,
    settings: Settings,
    summarizer: PatchSummarizer,
    request_id: str,
) -> PatchSummaryResponse:
    started = monotonic()
    try:
        outcome = await summarizer(settings, payload)
    except asyncio.CancelledError:
        log_request_timing(request_id, started, "cancelled")
        raise
    except Exception as error:
        raise_provider_failure(error, request_id, started)
    log_request_timing(request_id, started, "ok")
    # Counts only: patch text and summary content never reach the service log.
    logger.info(
        "coach_patch_summary request_id=%s thread_id=%d truncated=%s input_tokens=%d "
        "output_tokens=%d groups=%d",
        request_id,
        payload.thread_id,
        outcome.truncated,
        outcome.usage.input_tokens,
        outcome.usage.output_tokens,
        len(outcome.summary.groups),
    )
    return PatchSummaryResponse(
        request_id=request_id,
        model=outcome.model,
        prompt_version=PROMPT_VERSION,
        truncated=outcome.truncated,
        summary=outcome.summary,
        usage=outcome.usage,
    )
