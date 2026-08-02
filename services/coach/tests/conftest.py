"""Shared fixtures for the integrated Coach service."""

import gzip
import hashlib
import json
import os
import sqlite3
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

# Must be set before test modules import src.config. Tests never inspect the root .env.local.
os.environ["COACH_DISABLE_DOTENV"] = "1"


@pytest.hookimpl(tryfirst=True)
def pytest_configure(config: pytest.Config) -> None:
    """Isolate temp roots so Windows accounts cannot inherit another runner's ACLs."""
    if config.option.basetemp is None:
        run_id = f"{os.getpid()}-{uuid.uuid4().hex}"
        config.option.basetemp = str(Path(".test-tmp") / f"pytest-{run_id}")


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
        latest = datetime.now(UTC).replace(microsecond=0)
        prior = latest - timedelta(days=1)
        connection.executemany(
            "INSERT INTO price_snapshots VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                (1, "chaos", "Chaos Orb", "Currency", 0.01, 100, prior.isoformat()),
                (2, "chaos", "Chaos Orb", "Currency", 0.02, 120, latest.isoformat()),
                (3, "divine", "Divine Orb", "Currency", 1.0, 80, latest.isoformat()),
            ],
        )
    return path


@pytest.fixture
def item_catalog_manifest(tmp_path: Path) -> Path:
    """Create a complete-threshold catalog with a focused deterministic staff fixture."""
    directory = tmp_path / "repoe"
    directory.mkdir()
    sources = _catalog_sources()
    payload = {
        "schema_version": 1,
        "repoe_version": "test-1",
        "synced_at": "2026-07-30T00:00:00Z",
        "sources": sources,
    }
    compressed = gzip.compress(json.dumps(payload).encode())
    digest = hashlib.sha256(compressed).hexdigest()
    artifact = directory / f"catalog-{digest[:16]}.json.gz"
    artifact.write_bytes(compressed)
    manifest = directory / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "payload_schema_version": 1,
                "repoe_version": "test-1",
                "artifact": artifact.name,
                "artifact_bytes": len(compressed),
                "artifact_sha256": digest,
                "source_count": len(sources),
                "sources": {
                    name: {"records": len(value)} for name, value in sources.items()
                },
            }
        ),
        encoding="utf-8",
    )
    return manifest


def _catalog_sources() -> dict[str, object]:
    base_id = "Metadata/Items/Weapons/TwoHandWeapons/Staves/ParalysingStaff"
    bases = {
        base_id: {
            "name": "Paralysing Staff",
            "item_class": "Staves",
            "tags": ["staff", "caster_weapon"],
            "requirements": {"level": 52, "intelligence": 92},
            "skills_granted": ["Metadata/Items/Gems/SkillGemEnervatingNova"],
        }
    }
    bases["Metadata/Items/Gems/SkillGemEnervatingNova"] = {
        "name": "Enervating Nova",
        "item_class": "Active Skill Gem",
        "tags": ["gem"],
    }
    bases["Metadata/Items/Omens/OmenOfLight"] = {
        "name": "Omen of Light",
        "item_class": "Omen",
        "tags": ["omen"],
        "properties": {
            "description": "Your next Annulment removes only a Desecrated modifier"
        },
    }
    bases.update(
        {
            f"Metadata/Test/Base{index}": {
                "name": f"Fixture Base {index}",
                "item_class": "Test Items",
                "tags": ["fixture"],
            }
            for index in range(498)
        }
    )
    target_mods = _staff_mods()
    mods = {**target_mods, **_dummy_mods(10_000 - len(target_mods))}
    return {
        "base_items": bases,
        "mods": mods,
        "mods_by_base": {
            "item": {
                "staff": {
                    "bases": [base_id],
                    "mods": {mod_id: {} for mod_id in target_mods},
                }
            }
        },
        "item_classes": {"Staves": {"name": "Staves"}},
        "augments": {"fixture": {}},
        "skills": {"EnervatingNova": {"display_name": "Enervating Nova"}},
        "stat_value_handlers": {"fixture": {}},
        "tags": {"staff": {}},
        "uniques": {"fixture": {}},
    }


def _staff_mods() -> dict[str, object]:
    return {
        "RunicSpellDamage": _mod(
            "prefix", "(209-238)% increased Spell Damage", 209, 238, 80, "spell"
        ),
        "RuthlessCold": _mod(
            "prefix", "Gain (49-54)% of Damage as Extra Cold Damage", 49, 54, 60, "cold"
        ),
        "InfernalFire": _mod(
            "prefix", "Gain (49-54)% of Damage as Extra Fire Damage", 49, 54, 60, "fire"
        ),
        "UnmakingCrit": _mod(
            "suffix",
            "(90-109)% increased Critical Hit Chance for Spells",
            90,
            109,
            76,
            "crit",
        ),
        "SorcererSkills": _mod(
            "suffix", "+(5-6) to Level of all Spell Skills", 5, 6, 78, "skills"
        ),
        "TranscendentAlloyCold": _mod(
            "suffix",
            "(39-47)% increased Cast Speed\n"
            "Gain (11-16)% of Elemental Damage as Extra Cold Damage",
            39,
            47,
            1,
            "alloy",
            second_range=(11, 16),
            name="Transcendent Alloy",
        ),
        "CannotBeFrozen": _mod(
            "suffix", "Cannot be Frozen", 0, 0, 1, "freeze_immunity"
        ),
        "StaffRuneDamage": _mod(
            "enchantment", "(10-20)% increased Damage", 10, 20, 1, "rune_damage"
        ),
        "SharedGroupCollision": {
            **_mod(
                "prefix",
                "(300-350)% increased Projectile Damage",
                300,
                350,
                99,
                "spell",
            ),
            "type": "projectile_damage",
        },
        "ApprenticeSpellDamage": _mod(
            "prefix", "(100-150)% increased Spell Damage", 100, 150, 50, "spell"
        ),
    }


def _mod(
    side: str,
    text: str,
    minimum: int,
    maximum: int,
    level: int,
    group: str,
    *,
    second_range: tuple[int, int] | None = None,
    name: str = "Fixture Mod",
) -> dict[str, object]:
    stats = [{"id": f"{group}_1", "min": minimum, "max": maximum}]
    if second_range:
        stats.append(
            {"id": f"{group}_2", "min": second_range[0], "max": second_range[1]}
        )
    return {
        "domain": "item",
        "generation_type": side,
        "groups": [group],
        "name": name,
        "required_level": level,
        "spawn_weights": [{"tag": "staff", "weight": 1000}],
        "stats": stats,
        "text": text,
        "type": group,
    }


def _dummy_mods(count: int) -> dict[str, object]:
    return {
        f"DummyMod{index}": {
            "domain": "item",
            "generation_type": "prefix",
            "groups": [f"dummy_{index}"],
            "required_level": 1,
            "spawn_weights": [],
            "stats": [],
            "text": None,
        }
        for index in range(count)
    }
