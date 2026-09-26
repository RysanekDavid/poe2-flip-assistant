"""Read-only access to the application's shared SQLite database, with one error taxonomy."""

import sqlite3
from pathlib import Path
from typing import NoReturn

from src.errors import ToolSourceUnavailable

_UNAVAILABLE_SQLITE_CODES = {
    sqlite3.SQLITE_BUSY,
    sqlite3.SQLITE_LOCKED,
    sqlite3.SQLITE_CANTOPEN,
    sqlite3.SQLITE_IOERR,
    sqlite3.SQLITE_CORRUPT,
    sqlite3.SQLITE_NOTADB,
    sqlite3.SQLITE_READONLY,
}
_UNAVAILABLE = "Application database is temporarily unavailable"
_UNAVAILABLE_MARKERS = (
    "unable to open database",
    "database is locked",
    "database table is locked",
    "database is busy",
    "disk i/o error",
    "database disk image is malformed",
    "file is not a database",
    "readonly database",
)


def connect_read_only(path: Path) -> sqlite3.Connection:
    """Open the shared database so that no code path in this process can write to it."""
    if not path.is_file():
        raise FileNotFoundError(f"Application database does not exist: {path}")
    connection = sqlite3.connect(f"{path.as_uri()}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA query_only=ON")
    return connection


def raise_source_error(error: sqlite3.Error) -> NoReturn:
    """Map operational SQLite failures to ToolSourceUnavailable; re-raise everything else.

    A missing column or a SQL typo is a release defect and must fail loudly, not be dressed up
    as a transient outage the model can talk around.
    """
    code = getattr(error, "sqlite_errorcode", None)
    if isinstance(code, int):
        if code & 0xFF in _UNAVAILABLE_SQLITE_CODES:
            raise ToolSourceUnavailable(_UNAVAILABLE) from error
        raise error
    if any(marker in str(error).casefold() for marker in _UNAVAILABLE_MARKERS):
        raise ToolSourceUnavailable(_UNAVAILABLE) from error
    raise error
