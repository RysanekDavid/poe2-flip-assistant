"""Agent tool registry."""

from langchain_core.tools import BaseTool

from src.config import Settings
from src.tools.items import build_game_data_tool, build_item_tool
from src.tools.knowledge import retrieve_knowledge
from src.tools.market import analyze_market_history
from src.tools.ninja import fetch_live_prices
from src.tools.search import search_recent_poe2


def get_tools(settings: Settings) -> list[BaseTool]:
    """Return the product tool belt enabled by current server configuration."""
    tools = [
        analyze_market_history,
        fetch_live_prices,
        retrieve_knowledge,
        build_item_tool(settings.item_catalog_path),
        build_game_data_tool(settings.item_catalog_path),
    ]
    if settings.has_tavily_key:
        tools.append(search_recent_poe2)
    return tools


__all__ = [
    "analyze_market_history",
    "fetch_live_prices",
    "get_tools",
    "build_item_tool",
    "build_game_data_tool",
    "retrieve_knowledge",
    "search_recent_poe2",
]
