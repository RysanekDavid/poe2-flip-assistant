"""Deterministic entity annotation of a final Coach answer.

Runs after the model answered, so it can never change what the answer says: it only reports
which catalog entities the text mentions (and which ones this turn's tools named), for the UI to
render as hoverable chips. Matching is longest-first and word-bounded; code, links and citations
are never scanned.
"""

import re
from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path

from src.entities.catalog import EntityCatalog, get_entity_catalog, normalize, plural_forms
from src.entities.models import CoachEntity, EntityRow
from src.entities.turn import TurnEvidence

MAX_ENTITIES = 20
MAX_MENTIONS = 8

# Same spans the client parser renders as code, links and citations (markdownParser.ts).
_MASK = re.compile(
    r"```.*?(?:```|\Z)"
    r"|`[^`\n]+`"
    r"|\[[^\]\n]+\]\([^)\s]+\)"
    r"|https?://[^\s<]+"
    r"|\[[MLKWD][0-9a-f]{12}\]",
    re.DOTALL | re.IGNORECASE,
)
# Number-anchored shorthands only: bare "div"/"Divine"/"Exalted" are ordinary words in answers
# ("Trial of Chaos", "divine damage"), a number in front makes them a price.
_NUMBER = r"\d[\d,]*(?:\.\d+)?\s?"
_DIVINE_SHORTHAND = rf"(?i:{_NUMBER}(?:divines?|divs?)(?!\s+orbs?\b))"
_EXALTED_SHORTHAND = rf"(?i:{_NUMBER}(?:exalts?|ex))"
_END = ""


def mask(text: str) -> str:
    """Blank code, links, URLs and citations with NULs.

    Same length keeps positions; NUL is not whitespace, so a surface never bridges a masked span.
    """
    return _MASK.sub(lambda match: "\0" * len(match.group(0)), text)


def _tokens(surface: str, *, fold: bool) -> list[str]:
    text = normalize(surface) if fold else re.sub(r"\s+", " ", surface.replace("’", "'")).strip()
    return list(text)


def _token_regex(token: str) -> str:
    if token == " ":
        return r"\s+"
    if token == "'":
        return "['’]"
    return re.escape(token)


def _node_regex(node: dict[str, dict]) -> str:
    branches = [
        _token_regex(token) + _node_regex(child)
        for token, child in sorted(node.items())
        if token != _END
    ]
    if not branches:
        return ""
    joined = branches[0] if len(branches) == 1 else "(?:" + "|".join(branches) + ")"
    # A greedy optional continuation makes every trie branch prefer its longest surface.
    return f"(?:{joined})?" if _END in node else joined


def trie_regex(surfaces: Iterable[str], *, fold: bool) -> str:
    """One prefix-factored alternation of all surfaces.

    A flat alternation would make Python's re try thousands of literals at every position.
    """
    root: dict[str, dict] = {}
    for surface in surfaces:
        node = root
        for token in _tokens(surface, fold=fold):
            node = node.setdefault(token, {})
        node[_END] = {}
    return _node_regex(root)


def _surfaces(catalog: EntityCatalog) -> tuple[list[str], list[str]]:
    """Split surfaces: multi-word ones match in any case, single words only exactly.

    "Opportunity" is a unique, "opportunity" is prose.
    """
    multi: list[str] = []
    single: list[str] = []
    for row in catalog.rows:
        for surface in (row.name, *row.aliases):
            forms = [
                surface,
                *(p for p in plural_forms(surface) if catalog.surfaces.get(normalize(p)) == row.id),
            ]
            for form in forms:
                (multi if " " in form.strip() else single).append(form)
    return multi, single


class EntityMatcher:
    """Compiled matcher for one catalog."""

    def __init__(self, catalog: EntityCatalog) -> None:
        self.catalog = catalog
        self._divine = _required(catalog, "Divine Orb")
        self._exalted = _required(catalog, "Exalted Orb")
        multi, single = _surfaces(catalog)
        self.pattern = re.compile(
            r"(?<![\w'’-])(?:"
            rf"(?P<div>{_DIVINE_SHORTHAND})|(?P<ex>{_EXALTED_SHORTHAND})"
            rf"|(?P<multi>(?i:{trie_regex(multi, fold=True)}))"
            rf"|(?P<single>{trie_regex(single, fold=False)})"
            r")(?![\w-])"
        )

    def entity_for(self, match: re.Match[str]) -> EntityRow | None:
        """Resolve one regex hit back to its catalog row."""
        if match.group("div") is not None:
            return self._divine
        if match.group("ex") is not None:
            return self._exalted
        return self.catalog.resolve(match.group(0))


def _required(catalog: EntityCatalog, name: str) -> EntityRow:
    row = catalog.resolve(name)
    if row is None:
        raise RuntimeError(f"Entity catalog has no {name!r}; currency shorthands cannot resolve")
    return row


@lru_cache(maxsize=4)
def get_entity_matcher(path: Path) -> EntityMatcher:
    """Compile once per catalog path; the artifact is immutable for a release."""
    return EntityMatcher(get_entity_catalog(path))


def _corroborated(row: EntityRow, evidence_text: str) -> bool:
    """A one-word unique name ("Opportunity", "Voices") counts only when a tool also named it."""
    if row.kind != "unique" or " " in row.name:
        return True
    return row.name in evidence_text


def annotate_answer(
    answer: str, matcher: EntityMatcher, evidence: TurnEvidence
) -> list[CoachEntity]:
    """Entities in first-mention order, then tool-named ones, capped at MAX_ENTITIES."""
    mentions: dict[str, list[str]] = {}
    for match in matcher.pattern.finditer(mask(answer)):
        row = matcher.entity_for(match)
        if row is None or not _corroborated(row, evidence.text):
            continue
        surface = answer[match.start() : match.end()]
        found = mentions.setdefault(row.id, [])
        if surface not in found and len(found) < MAX_MENTIONS:
            found.append(surface)
    for entity_id in evidence.entity_ids:
        mentions.setdefault(entity_id, [])
    return [
        _coach_entity(matcher.catalog, entity_id, found, evidence)
        for entity_id, found in list(mentions.items())[:MAX_ENTITIES]
    ]


def _coach_entity(
    catalog: EntityCatalog, entity_id: str, found: list[str], evidence: TurnEvidence
) -> CoachEntity:
    row = catalog.get(entity_id)
    if row is None:
        raise RuntimeError(f"Entity {entity_id!r} vanished from its catalog")
    price = evidence.prices.get(entity_id)
    return CoachEntity(
        id=row.id,
        name=row.name,
        kind=row.kind,
        icon_url=row.icon_url,
        summary=row.summary,
        directions=row.directions,
        poe2db_url=row.poe2db_url,
        mentions=found,
        price_div=price[0] if price else None,
        price_at=price[1] if price else None,
    )
