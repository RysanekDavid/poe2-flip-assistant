"""Load the curated strategy KB once per process; any defect raises instead of shrinking the KB."""

import json
from functools import lru_cache
from pathlib import Path

from pydantic import ValidationError

from src.strategies.models import STRATEGY_ADAPTER, Strategy


def load_strategies(directory: Path) -> tuple[Strategy, ...]:
    """Every `<id>.json` in `directory` (any kind), validated, ordered by id.

    Raises RuntimeError on an unreadable or invalid file, an id that is not its filename, a
    duplicate id, or an empty directory: a silently skipped strategy would read as "none exists".
    """
    try:
        files = sorted(directory.resolve(strict=True).glob("*.json"))
    except OSError as error:
        raise RuntimeError(f"Strategy directory {directory} is missing: {error}") from error
    if not files:
        raise RuntimeError(f"No strategy files in {directory}")
    strategies: dict[str, Strategy] = {}
    for path in files:
        try:
            strategy = STRATEGY_ADAPTER.validate_python(
                json.loads(path.read_text(encoding="utf-8"))
            )
        except (OSError, json.JSONDecodeError, ValidationError) as error:
            raise RuntimeError(f"Strategy file {path} is invalid: {error}") from error
        if strategy.id != path.stem:
            raise RuntimeError(
                f"Strategy {path} has id {strategy.id!r}; it must equal the filename"
            )
        if strategy.id in strategies:
            raise RuntimeError(f"Duplicate strategy id {strategy.id!r}")
        strategies[strategy.id] = strategy
    return tuple(strategies.values())


@lru_cache(maxsize=4)
def get_strategies(directory: Path) -> tuple[Strategy, ...]:
    """Process-wide strategy KB per directory; the files are immutable for a release."""
    return load_strategies(directory)
