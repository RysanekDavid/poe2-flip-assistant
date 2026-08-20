"""Validated HTTP contracts shared by the FastAPI boundary."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    UUID4,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    StringConstraints,
    model_validator,
)

MessageText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=8_000)
]
HistoryText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64_000)
]


class HistoryMessage(BaseModel):
    """One trusted completed public-history message supplied by the Next.js service."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: HistoryText

    @model_validator(mode="after")
    def validate_role_length(self) -> "HistoryMessage":
        if self.role == "user" and len(self.content) > 8_000:
            raise ValueError("user history content exceeds 8000 characters")
        return self


class ChatRequest(BaseModel):
    """One user turn in a thread-scoped conversation."""

    model_config = ConfigDict(extra="forbid")

    message: MessageText
    thread_id: UUID4
    history: list[HistoryMessage] = Field(default_factory=list, max_length=14)

    @model_validator(mode="after")
    def validate_completed_turn_history(self) -> "ChatRequest":
        for index, message in enumerate(self.history):
            expected = "user" if index % 2 == 0 else "assistant"
            if message.role != expected:
                raise ValueError("history must alternate completed user and assistant messages")
        if len(self.history) % 2 != 0:
            raise ValueError("history must contain only completed turns")
        return self


class EvidenceSource(BaseModel):
    """A source surfaced by one of the agent tools."""

    id: str = Field(min_length=1)
    type: Literal["market", "live", "knowledge", "web", "game_data"]
    title: str = Field(min_length=1)
    url: HttpUrl | None = None


class ChatResponse(BaseModel):
    """A completed agent response with traceable tool evidence."""

    thread_id: UUID4
    request_id: str = Field(pattern=r"^[a-f0-9]{24,32}$|^local[0-9]{21}$")
    answer: str = Field(min_length=1)
    tools_used: list[str]
    processors_used: list[str]
    sources: list[EvidenceSource]


class CoachErrorDetail(BaseModel):
    """Stable recovery contract returned for a failed Coach turn."""

    code: Literal[
        "tool_invalid_input",
        "tool_no_result",
        "tool_source_unavailable",
        "provider_timeout",
        "provider_rejected",
        "request_rejected",
        "contract_violation",
        "rate_limited",
        "thread_busy",
        "internal",
    ]
    message: str = Field(min_length=1)
    request_id: str = Field(min_length=12, max_length=32)
    retryable: bool
    reset_conversation: bool


class CoachErrorResponse(BaseModel):
    """Top-level JSON error body shared with the Next.js proxy."""

    error: CoachErrorDetail


class HealthResponse(BaseModel):
    """Readiness state that never calls an LLM or external API."""

    status: Literal["ok", "degraded"]
    market_ready: bool
    knowledge_ready: bool
    item_data_ready: bool
    model_configured: bool
    web_search_ready: bool
    model: str
    patch_monitor_ready: bool
    game_data_patch: str | None
    latest_official_patch: str | None
    recommendations_ready: bool
    patch_checked_at: datetime | None = None
    pending_patch_reviews: int = Field(ge=0)
