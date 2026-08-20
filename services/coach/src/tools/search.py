"""Recent public-web search through Tavily."""

import json

from langchain_core.tools import tool
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, ValidationError
from tavily import TavilyClient

from src.config import get_settings
from src.errors import ToolInvalidInput, ToolSourceUnavailable
from src.evidence import evidence_id


@tool
def search_recent_poe2(query: str) -> str:
    """Search public PoE2 patch notes, news, or recent meta shifts.

    Do not use for stable mechanics already covered by the knowledge tool.
    """
    normalized = query.strip()
    if not normalized:
        raise ToolInvalidInput("query must not be empty")
    settings = get_settings()
    client = TavilyClient(api_key=settings.require_tavily_key())
    response = client.search(
        query=normalized,
        topic="general",
        search_depth="basic",
        max_results=5,
        include_answer=False,
        include_raw_content=False,
        timeout=settings.request_timeout_seconds,
    )
    return json.dumps(_normalized_results(response), ensure_ascii=False)


class TavilyResult(BaseModel):
    """Validated public-search result used by the agent."""

    model_config = ConfigDict(extra="ignore")
    title: str = Field(default="Untitled search result", min_length=1)
    url: HttpUrl
    content: str = ""
    score: float | None = None


class TavilyResponse(BaseModel):
    """Minimum Tavily response shape required by the coach."""

    model_config = ConfigDict(extra="ignore")
    results: list[TavilyResult]


def _normalized_results(response: object) -> dict[str, object]:
    try:
        validated = TavilyResponse.model_validate(response)
    except ValidationError as error:
        raise ToolSourceUnavailable("Web search returned an invalid response") from error
    items = []
    sources = []
    for result in validated.results:
        url = str(result.url)
        source_id = evidence_id("W", url)
        items.append(
            {
                "id": source_id,
                "title": result.title,
                "url": url,
                "excerpt": result.content,
                "score": result.score,
            }
        )
        sources.append({"id": source_id, "type": "web", "title": result.title, "url": url})
    return {"results": items, "sources": sources}
