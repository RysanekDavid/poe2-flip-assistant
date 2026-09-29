"""Entity catalog loading and deterministic answer annotation."""

import gzip
import json
from pathlib import Path

import pytest

from src.config import Settings
from src.entities import (
    ToolOutput,
    TurnEvidence,
    annotate_answer,
    collect_turn_evidence,
    get_entity_matcher,
    load_entity_catalog,
)
from src.entities.annotator import MAX_ENTITIES, EntityMatcher
from src.entities.catalog import plural_forms
from src.entities.turn import iso_utc

CATALOG_PATH = Settings(_env_file=None).entity_catalog_path


@pytest.fixture(scope="module")
def matcher() -> EntityMatcher:
    return get_entity_matcher(CATALOG_PATH)


def _ids(answer: str, matcher: EntityMatcher, evidence: TurnEvidence | None = None) -> list[str]:
    return [entity.id for entity in annotate_answer(answer, matcher, evidence or TurnEvidence())]


def _mentions(answer: str, matcher: EntityMatcher) -> dict[str, list[str]]:
    return {e.id: e.mentions for e in annotate_answer(answer, matcher, TurnEvidence())}


def test_committed_catalog_has_the_known_entities(matcher: EntityMatcher) -> None:
    catalog = matcher.catalog
    for name in (
        "Fracturing Orb",
        "Divine Orb",
        "Exalted Orb",
        "Greater Exalted Orb",
        "Omen of Light",
        "Simulacrum Splinter",
        "Breachlord Sac",
    ):
        row = catalog.resolve(name)
        assert row is not None, name
        assert row.icon_url and row.icon_url.startswith("https://web.poecdn.com/"), name
        assert row.summary, name


def test_catalog_rejects_a_corrupt_artifact(tmp_path: Path) -> None:
    broken = tmp_path / "entities.json.gz"
    broken.write_bytes(gzip.compress(json.dumps({"schema_version": 1}).encode()))
    with pytest.raises(RuntimeError, match="missing or invalid"):
        load_entity_catalog(broken)
    with pytest.raises(RuntimeError, match="missing or invalid"):
        load_entity_catalog(tmp_path / "absent.json.gz")


def test_plural_forms_cover_last_word_and_of_head() -> None:
    assert plural_forms("Divine Orb") == ["Divine Orbs"]
    assert "Omens of Light" in plural_forms("Omen of Light")
    assert plural_forms("Flesh Catalyst") == ["Flesh Catalysts"]
    assert plural_forms("Waystone (Tier 1)") == []


def test_longest_match_wins(matcher: EntityMatcher) -> None:
    mentions = _mentions("Slam a Greater Exalted Orb, then a plain Exalted Orb.", matcher)
    assert mentions == {
        "greater-exalted-orb": ["Greater Exalted Orb"],
        "exalted": ["Exalted Orb"],
    }


def test_bare_chaos_divine_exalted_never_match(matcher: EntityMatcher) -> None:
    answer = (
        "Run the Trial of Chaos, stack chaos damage, divine intervention helps, "
        "and exalted feelings are not currency. Chaos and Divine alone are not items."
    )
    assert _ids(answer, matcher) == []


def test_omen_plural_shorthand_and_case(matcher: EntityMatcher) -> None:
    mentions = _mentions(
        "Omen of Light first; two Omens of Light cost 3 div, 1.5div or 150 ex. "
        "Sell 2 divine orbs and Divine Orbs.",
        matcher,
    )
    assert mentions["omen-of-light"] == ["Omen of Light", "Omens of Light"]
    assert mentions["divine"] == ["3 div", "1.5div", "divine orbs", "Divine Orbs"]
    assert mentions["exalted"] == ["150 ex"]


def test_code_links_and_citations_are_skipped(matcher: EntityMatcher) -> None:
    answer = (
        "`Divine Orb` in code, [Fracturing Orb](https://poe2db.tw/us/Fracturing_Orb) as a link, "
        "https://poe2db.tw/us/Omen_of_Light bare, [M0123456789ab] cited.\n"
        "```\nGreater Exalted Orb\n```\n"
        "Divine `x` Orb must not bridge a code span."
    )
    assert _ids(answer, matcher) == []


def test_curly_apostrophe_and_word_boundaries(matcher: EntityMatcher) -> None:
    mentions = _mentions("Use an Artificer’s Orb. Divine Orbital is not an item.", matcher)
    assert mentions == {"artificers": ["Artificer’s Orb"]}


def test_one_word_unique_needs_tool_corroboration(matcher: EntityMatcher) -> None:
    answer = "Opportunity knocks, but Headhunter is the belt everyone wants."
    assert _ids(answer, matcher) == []
    evidence = TurnEvidence(text='{"rows": [{"name": "Headhunter"}]}')
    assert _ids(answer, matcher, evidence) == ["unique-headhunter"]
    # Exact case only: prose "headhunter" never becomes a chip.
    assert _ids("a headhunter build", matcher, evidence) == []


def test_multi_word_unique_matches_without_corroboration(matcher: EntityMatcher) -> None:
    row = next(r for r in matcher.catalog.rows if r.kind == "unique" and " " in r.name)
    assert _ids(f"Consider {row.name} here.", matcher) == [row.id]


def test_cap_twenty_entities_in_mention_order(matcher: EntityMatcher) -> None:
    names = [row.name for row in matcher.catalog.rows if row.kind == "essence"][:25]
    entities = annotate_answer(", ".join(names) + ".", matcher, TurnEvidence())
    assert len(entities) == MAX_ENTITIES
    assert [e.name for e in entities] == names[:MAX_ENTITIES]


def test_tool_entities_and_live_prices_are_attached(matcher: EntityMatcher) -> None:
    live = {
        "items": [
            {"item_name": "Divine Orb", "value_div": 1.0, "fetched_at": "2026-09-29 10:00:00"},
            {"item_name": "Omen of Light", "value_div": 2.5, "fetched_at": "2026-09-29 10:00:00"},
        ]
    }
    outputs = [ToolOutput(name="fetch_live_prices", text=json.dumps(live))]
    evidence = collect_turn_evidence(outputs, matcher.catalog)
    entities = annotate_answer("Buy Omen of Light now.", matcher, evidence)
    assert [e.id for e in entities] == ["omen-of-light", "divine"]
    assert entities[0].price_div == 2.5
    assert entities[0].price_at == "2026-09-29T10:00:00Z"
    assert entities[1].mentions == []


def test_lookup_entity_output_adds_its_entity(matcher: EntityMatcher) -> None:
    payload = {"entity": {"id": "breachlord-sac"}, "sources": []}
    outputs = [ToolOutput(name="lookup_entity", text=json.dumps(payload))]
    evidence = collect_turn_evidence(outputs, matcher.catalog)
    assert evidence.entity_ids == ("breachlord-sac",)


def test_iso_utc_accepts_sqlite_and_iso_only() -> None:
    assert iso_utc("2026-09-29 10:00:00") == "2026-09-29T10:00:00Z"
    assert iso_utc("2026-09-29T10:00:00+00:00") == "2026-09-29T10:00:00+00:00"
    assert iso_utc("yesterday") is None
    assert iso_utc(None) is None
