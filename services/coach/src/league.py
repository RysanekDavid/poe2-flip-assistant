"""Default-league resolution mirroring the web app's `getDefaultLeague`."""

import sqlite3
from contextlib import closing
from pathlib import Path

from src.config import Settings

#: The web app's cold-start default (src/config/env.ts). Only reached when neither the runtime
#: app setting nor LEAGUE_NAME exists, i.e. a fresh database in a fresh environment.
APP_FALLBACK_LEAGUE = "Runes of Aldur"
_LEAGUE_SETTING_KEY = "league"


def resolve_default_league(settings: Settings) -> str:
    """Return the app's default league: runtime setting, then LEAGUE_NAME, then the fallback.

    The Next.js proxy always sends the asking user's league; this only serves direct callers.
    Using the same order as the web app keeps both processes on one market after a switch.
    """
    stored = _stored_default_league(settings.poe_db_path)
    if stored:
        return stored
    configured = (settings.league_name or "").strip()
    return configured or APP_FALLBACK_LEAGUE


def _stored_default_league(path: Path) -> str | None:
    if not path.is_file():
        return None
    with closing(sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)) as connection:
        try:
            row = connection.execute(
                "SELECT value FROM app_settings WHERE key = ?", (_LEAGUE_SETTING_KEY,)
            ).fetchone()
        except sqlite3.OperationalError as error:
            # A database created before the league registry has no settings table; that is the
            # "no runtime setting" case, not a failure. Anything else propagates.
            if "no such table" in str(error).casefold():
                return None
            raise
    if row is None or not isinstance(row[0], str):
        return None
    return row[0].strip() or None
