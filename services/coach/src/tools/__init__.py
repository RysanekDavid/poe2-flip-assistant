"""Agent tool registry."""

from langchain_core.tools import BaseTool

from src.config import Settings
from src.tools.craft import get_craft_margins
from src.tools.farm import get_farm_advice
from src.tools.flips import get_top_flips
from src.tools.items import build_game_data_tool, build_item_tool
from src.tools.knowledge import retrieve_knowledge
from src.tools.market import analyze_market_history
from src.tools.ninja import fetch_live_prices
from src.tools.search import search_recent_poe2
from src.tools.snipe import get_snipe_report


def get_tools(settings: Settings) -> list[BaseTool]:
    """Return the product tool belt enabled by current server configuration."""
    tools = [
        analyze_market_history,
        fetch_live_prices,
        get_top_flips,
        get_craft_margins,
        get_snipe_report,
        get_farm_advice,
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
    "get_craft_margins",
    "get_farm_advice",
    "get_snipe_report",
    "get_tools",
    "get_top_flips",
    "build_item_tool",
    "build_game_data_tool",
    "retrieve_knowledge",
    "search_recent_poe2",
]
