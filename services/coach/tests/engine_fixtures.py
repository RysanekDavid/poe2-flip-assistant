"""Application-shaped engine tables for the Coach engine-tool tests.

DDL mirrors the web app's (src/db/cxMigrations.ts, src/db/cxEdgeDetail.ts, src/db/schema.sql).
Every helper writes into an existing `market_db` fixture so price_snapshots/item_spark stay the
shared, league-scoped tables the market tools already test.
"""

import json
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace

OTHER_LEAGUE = "Runes of Aldur"
CX_DETAIL_COLUMNS = (
    "persistence6 INTEGER, slower_div_per_hour REAL, net_div_per_unit REAL, "
    "buy_price REAL, sell_price REAL, fee_complete INTEGER"
)


def settings_for(path: Path, **extra: object) -> SimpleNamespace:
    """The subset of Settings the engine tools read."""
    return SimpleNamespace(
        poe_db_path=path,
        league_name=None,
        craft_margin_interval_min=10,
        autosnipe_interval_min=10,
        **extra,
    )


def sqlite_stamp(moment: datetime) -> str:
    """SQLite CURRENT_TIMESTAMP format (UTC, no zone), as the Node app stores it."""
    return moment.astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S")


def current_hour() -> int:
    """A digest hour end within the freshness window."""
    now = int(datetime.now(UTC).timestamp())
    return now - now % 3600


def create_cx_tables(path: Path, *, with_detail: bool = True) -> None:
    detail = f", {CX_DETAIL_COLUMNS}" if with_detail else ""
    with sqlite3.connect(path) as connection:
        connection.executescript(
            f"""
            CREATE TABLE cx_ingest (
              league TEXT NOT NULL, hour INTEGER NOT NULL, markets INTEGER NOT NULL,
              ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (league, hour)) WITHOUT ROWID;
            CREATE TABLE cx_items (
              base_id TEXT PRIMARY KEY, name TEXT NOT NULL,
              resolved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP) WITHOUT ROWID;
            CREATE TABLE cx_edge_outcomes (
              league TEXT NOT NULL, item TEXT NOT NULL, hour INTEGER NOT NULL,
              buy_quote TEXT NOT NULL, sell_quote TEXT NOT NULL, edge_pct REAL NOT NULL,
              next_net_pct REAL,
              outcome TEXT CHECK (outcome IS NULL OR outcome IN ('hit', 'miss')){detail},
              PRIMARY KEY (league, item, hour)) WITHOUT ROWID;
            """
        )
        connection.executemany(
            "INSERT INTO cx_items (base_id, name) VALUES (?, ?)",
            [
                ("Metadata/Div", "Divine Orb"),
                ("Metadata/Ex", "Exalted Orb"),
                ("Metadata/Chaos", "Chaos Orb"),
                ("Metadata/Sim", "Simulacrum"),
                ("Metadata/Omen", "Omen of Light"),
                ("Metadata/Rune", "Greater Rune of Alacrity"),
            ],
        )


def add_ingest(
    path: Path, league: str, hour: int, *, ingested: timedelta = timedelta(minutes=10)
) -> None:
    """Store a digest hour; `ingested` is how long ago (default: past the publish grace)."""
    stamp = sqlite_stamp(datetime.now(UTC) - ingested)
    with sqlite3.connect(path) as connection:
        connection.execute(
            "INSERT INTO cx_ingest (league, hour, markets, ingested_at) VALUES (?, ?, 10, ?)",
            (league, hour, stamp),
        )


def add_edge(
    path: Path, league: str, hour: int, item: str, edge_pct: float, **values: object
) -> None:
    """One published edge; `values` fills detail/outcome columns by name."""
    row: dict[str, object] = {
        "league": league,
        "item": item,
        "hour": hour,
        "buy_quote": values.pop("buy_quote", "Metadata/Div"),
        "sell_quote": values.pop("sell_quote", "Metadata/Ex"),
        "edge_pct": edge_pct,
        **values,
    }
    columns = ", ".join(row)
    placeholders = ", ".join("?" for _ in row)
    with sqlite3.connect(path) as connection:
        connection.execute(
            f"INSERT INTO cx_edge_outcomes ({columns}) VALUES ({placeholders})", tuple(row.values())
        )


def detail(persistence6: int = 5, slower: float = 420.0, **overrides: object) -> dict[str, object]:
    return {
        "persistence6": persistence6,
        "slower_div_per_hour": slower,
        "net_div_per_unit": 0.012,
        "buy_price": 0.1,
        "sell_price": 27.5,
        "fee_complete": 1,
        **overrides,
    }


def create_craft_table(path: Path) -> None:
    with sqlite3.connect(path) as connection:
        connection.execute(
            """CREATE TABLE craft_margin_reports (
              league TEXT NOT NULL DEFAULT '', recipe_key TEXT NOT NULL, report_json TEXT NOT NULL,
              ev_div REAL NOT NULL, margin_pct REAL NOT NULL,
              scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_error TEXT,
              last_error_at DATETIME, PRIMARY KEY (league, recipe_key))"""
        )


def leg(
    price: float = 2.0, samples: int = 12, total: int = 40, **overrides: object
) -> dict[str, object]:
    return {
        "priceDiv": price,
        "samples": samples,
        "total": total,
        "searchUrl": "https://www.pathofexile.com/trade2/search/poe2/x",
        "outliersDropped": 1,
        "unresolvedStats": [],
        "icon": None,
        "floorDiv": 0.05,
        "percentile": 0.3,
        "sampled": 40,
        **overrides,
    }


def craft_report(key: str, ev: float, **overrides: object) -> dict[str, object]:
    return {
        "key": key,
        "status": "ok",
        "base": leg(1.0),
        "result": leg(6.0),
        "materials": [],
        "materialsDiv": 0.5,
        "hitRate": 0.35,
        "evDiv": ev,
        "marginPct": ev / 1.5 * 100,
        "error": None,
        "valuation": "floor-percentile",
        "returnFlagged": False,
        **overrides,
    }


def add_craft(
    path: Path,
    league: str,
    key: str,
    report: dict[str, object] | str,
    *,
    age: timedelta = timedelta(minutes=5),
    last_error_at: datetime | None = None,
) -> None:
    text = report if isinstance(report, str) else json.dumps(report)
    scanned = datetime.now(UTC) - age
    with sqlite3.connect(path) as connection:
        connection.execute(
            """INSERT INTO craft_margin_reports
               (league, recipe_key, report_json, ev_div, margin_pct, scanned_at, last_error_at)
               VALUES (?, ?, ?, 0, 0, ?, ?)""",
            (
                league,
                key,
                text,
                sqlite_stamp(scanned),
                None if last_error_at is None else sqlite_stamp(last_error_at),
            ),
        )


def create_snipe_tables(path: Path) -> None:
    with sqlite3.connect(path) as connection:
        connection.executescript(
            """
            CREATE TABLE autosnipe_report (
              id INTEGER PRIMARY KEY CHECK (id = 1), report_json TEXT NOT NULL,
              scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE autosnipe_failure (
              id INTEGER PRIMARY KEY CHECK (id = 1), error TEXT NOT NULL,
              failed_at DATETIME DEFAULT CURRENT_TIMESTAMP);
            """
        )


def finding(item: str, margin: float, **overrides: object) -> dict[str, object]:
    return {
        "profile": "caster_wand",
        "label": "Caster wand",
        "listingId": f"listing-{item}",
        "account": "PrivateSeller#1234",
        "itemName": item,
        "baseType": "Siphoning Wand",
        "keyMods": "Spell dmg 110 · +2 Lightning skills",
        "whisper": "@PrivateSeller hi, I would like to buy",
        "online": True,
        "priceDiv": 1.0,
        "valueDiv": 1.0 / (1 - margin / 100),
        "marginPct": margin,
        "samples": 9,
        "searchUrl": "https://www.pathofexile.com/trade2/search/poe2/y",
        **overrides,
    }


def set_snipe_report(path: Path, report: dict[str, object] | str, scanned: datetime) -> None:
    text = report if isinstance(report, str) else json.dumps(report)
    with sqlite3.connect(path) as connection:
        connection.execute(
            "INSERT INTO autosnipe_report (id, report_json, scanned_at) VALUES (1, ?, ?)",
            (text, sqlite_stamp(scanned)),
        )


def set_snipe_failure(path: Path, failed: datetime) -> None:
    with sqlite3.connect(path) as connection:
        connection.execute(
            "INSERT INTO autosnipe_failure (id, error, failed_at) VALUES (1, ?, ?)",
            ("scan failed: no fresh exchange rates", sqlite_stamp(failed)),
        )
