"""Shared fixtures for the integrated Coach service."""

import sqlite3
from pathlib import Path

import pytest


@pytest.fixture
def market_db(tmp_path: Path) -> Path:
    """Create a minimal application-shaped market database."""
    path = tmp_path / "poe2flip.db"
    with sqlite3.connect(path) as connection:
        connection.execute(
            """CREATE TABLE price_snapshots (
            id INTEGER PRIMARY KEY,
            item_id TEXT NOT NULL,
            item_name TEXT NOT NULL,
            category TEXT NOT NULL,
            chaos_equiv REAL NOT NULL,
            volume REAL NOT NULL,
            fetched_at TEXT NOT NULL
            )"""
        )
        connection.executemany(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (1, "chaos", "Chaos Orb", "Currency", 0.01, 100, "2026-07-15 00:00:00"),
                (2, "chaos", "Chaos Orb", "Currency", 0.02, 120, "2026-07-16 00:00:00"),
                (3, "divine", "Divine Orb", "Currency", 1.0, 80, "2026-07-16 00:00:00"),
            ],
        )
    return path

