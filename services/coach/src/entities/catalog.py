"""Load the generated entity catalog and resolve names to entities."""

import difflib
import gzip
import json
import re
from functools import lru_cache
from pathlib import Path

from pydantic import ValidationError

from src.entities.models import EntityCatalogFile, EntityRow

_APOSTROPHES = str.maketrans({"’": "'", "‘": "'"})
_SPACES = re.compile(r"\s+")
# Plural "es" after sibilants ("Catalysts" needs only "s"; "Wombgiftes" never exists).
_SIBILANT_END = re.compile(r"(?:s|x|z|ch|sh)$", re.IGNORECASE)


def normalize(text: str) -> str:
    """Case-, apostrophe- and whitespace-insensitive key for one surface form."""
    return _SPACES.sub(" ", text.translate(_APOSTROPHES)).strip().casefold()


def _plural_word(word: str) -> str:
    return f"{word}es" if _SIBILANT_END.search(word) else f"{word}s"


def plural_forms(name: str) -> list[str]:
    """Plural surfaces: last word ("Divine Orbs") and, for "X of Y", the head ("Omens of Light")."""
    if not name[-1:].isalpha():
        return []
    last_words = name.split(" ")
    forms = [" ".join([*last_words[:-1], _plural_word(last_words[-1])])]
    head, sep, tail = name.partition(" of ")
    if sep:
        words = head.split(" ")
        forms.append(" ".join([*words[:-1], _plural_word(words[-1])]) + sep + tail)
    return forms


class EntityCatalog:
    """Immutable name/alias index over one generated catalog."""

    def __init__(self, catalog: EntityCatalogFile) -> None:
        self.repoe_version = catalog.repoe_version
        self.game_data_patch = catalog.game_data_patch
        self.rows: tuple[EntityRow, ...] = tuple(catalog.entities)
        self._by_id = {row.id: row for row in self.rows}
        if len(self._by_id) != len(self.rows):
            raise RuntimeError("Entity catalog contains duplicate ids")
        self.surfaces = _surface_index(self.rows)

    def get(self, entity_id: str) -> EntityRow | None:
        """Return one entity by id."""
        return self._by_id.get(entity_id)

    def resolve(self, text: str) -> EntityRow | None:
        """Exact name, alias or plural surface, ignoring case, apostrophe style and spacing."""
        entity_id = self.surfaces.get(normalize(text))
        return None if entity_id is None else self._by_id[entity_id]

    def lookup(self, query: str) -> tuple[EntityRow | None, list[str]]:
        """Exact/alias match, else the closest name; also returns up to 4 near alternatives."""
        exact = self.resolve(query)
        names = [row.name for row in self.rows]
        close = difflib.get_close_matches(query, names, n=5, cutoff=0.6)
        if exact is not None:
            return exact, [name for name in close if name != exact.name][:4]
        folded = {normalize(name): name for name in names}
        fuzzy = difflib.get_close_matches(normalize(query), list(folded), n=5, cutoff=0.82)
        best = self.resolve(folded[fuzzy[0]]) if fuzzy else None
        alternatives = [name for name in close if best is None or name != best.name]
        return best, alternatives[:4]


def _surface_index(rows: tuple[EntityRow, ...]) -> dict[str, str]:
    """Names and aliases win over derived plurals; a plural never shadows another entity's name."""
    index: dict[str, str] = {}
    for row in rows:
        for surface in (row.name, *row.aliases):
            key = normalize(surface)
            owner = index.get(key)
            if owner is not None and owner != row.id:
                raise RuntimeError(f"Entity surface {surface!r} belongs to {owner} and {row.id}")
            index[key] = row.id
    for row in rows:
        for surface in (row.name, *row.aliases):
            for plural in plural_forms(surface):
                index.setdefault(normalize(plural), row.id)
    return index


def load_entity_catalog(path: Path) -> EntityCatalog:
    """Read and fully validate the gzip JSON artifact; any defect raises."""
    try:
        raw = json.loads(gzip.decompress(path.resolve(strict=True).read_bytes()))
        return EntityCatalog(EntityCatalogFile.model_validate(raw))
    except (OSError, EOFError, gzip.BadGzipFile, json.JSONDecodeError, ValidationError) as error:
        raise RuntimeError(f"Entity catalog {path} is missing or invalid: {error}") from error


@lru_cache(maxsize=4)
def get_entity_catalog(path: Path) -> EntityCatalog:
    """Process-wide catalog per path; the artifact is immutable for a release."""
    return load_entity_catalog(path)
