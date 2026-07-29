"""Validated HTTP contracts shared by the FastAPI boundary."""

from typing import Annotated, Literal

from pydantic import UUID4, BaseModel, ConfigDict, Field, HttpUrl, StringConstraints

MessageText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2_000)
]


class ChatRequest(BaseModel):
    """One user turn in a thread-scoped conversation."""

    model_config = ConfigDict(extra="forbid")

    message: MessageText
    thread_id: UUID4


class EvidenceSource(BaseModel):
    """A source surfaced by one of the agent tools."""

    id: str = Field(min_length=1)
    type: Literal["market", "live", "knowledge", "web"]
    title: str = Field(min_length=1)
    url: HttpUrl | None = None


class ChatResponse(BaseModel):
    """A completed agent response with traceable tool evidence."""

    thread_id: UUID4
    answer: str = Field(min_length=1)
    tools_used: list[str]
    sources: list[EvidenceSource]


class HealthResponse(BaseModel):
    """Readiness state that never calls an LLM or external API."""

    status: Literal["ok", "degraded"]
    market_ready: bool
    knowledge_ready: bool
    model_ready: bool
    web_search_ready: bool
    model: str
