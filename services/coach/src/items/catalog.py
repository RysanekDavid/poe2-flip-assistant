"""Integrity-checked loader and indexes for the committed RePoE snapshot."""

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from src.items.alloy import ALLOY_ITEM_CLASSES, validate_alloy_coverage
from src.items.essence import (
    essence_matches_base,
    is_essence_family,
    validate_essence_coverage,
)
from src.items.manifest import CatalogManifest, load_snapshot, snapshot_identity
from src.items.models import RepoeBaseItem, RepoeMod
from src.items.search import search_records

_EXPLICIT_CLASS_MARKERS = (
    ("BodyArmour", {"body armour"}),
    ("HandWraps", {"gloves"}),
    ("Gloves", {"gloves"}),
    ("Boots", {"boots"}),
    ("Helmet", {"helmet"}),
    ("Ring", {"ring"}),
    ("Amulet", {"amulet"}),
    ("Belt", {"belt"}),
    ("Shield", {"shield"}),
    ("Quiver", {"quiver"}),
    ("Focus", {"focus"}),
    ("Crossbow", {"crossbow"}),
    ("Quarterstaff", {"warstaff"}),
    ("Warstaff", {"warstaff"}),
    ("Staff", {"staff"}),
    ("Wand", {"wand"}),
    ("Bow", {"bow"}),
    ("Spear", {"spear"}),
)
_WEAPON_ITEM_CLASSES = {
    "bow",
    "claw",
    "crossbow",
    "dagger",
    "flail",
    "one hand axe",
    "one hand mace",
    "one hand sword",
    "sceptre",
    "spear",
    "staff",
    "two hand axe",
    "two hand mace",
    "two hand sword",
    "wand",
    "warstaff",
}
_WEAPON_SCOPED_MOD = re.compile(
    r"SkillGemLevel(?:TwoHand)?Weapon|LocalIncreasedMeleeWeaponRangeEssence|"
    r"AlloyMaximumRunicWardWeapon"
)
_BASE_ITEMS_ADAPTER = TypeAdapter(dict[str, RepoeBaseItem])
_MODS_ADAPTER = TypeAdapter(dict[str, RepoeMod])


class ItemCatalog:
    """In-memory indexes over complete item/crafting data from one game version."""

    def __init__(
        self,
        version: str,
        bases: dict[str, RepoeBaseItem],
        mods: dict[str, RepoeMod],
        mods_by_base: dict[str, Any],
        sources: dict[str, Any],
    ) -> None:
        self.version = version
        self.bases = bases
        self.mods = mods
        self.mods_by_base = mods_by_base
        self.sources = sources
        self._base_mod_cache: dict[str, list[tuple[str, RepoeMod]]] = {}
        self._special_mod_cache: dict[str, list[tuple[str, RepoeMod]]] = {}
        self._names = sorted(
            (
                (base.name.casefold(), item_id)
                for item_id, base in bases.items()
                if base.name
            ),
            key=lambda pair: len(pair[0]),
            reverse=True,
        )

    @classmethod
    def load(cls, manifest_path: Path) -> "ItemCatalog":
        """Load one catalog only after checking its manifest, hash, and schema."""
        manifest, payload = load_snapshot(manifest_path)
        return cls._from_payload(payload, manifest)

    @classmethod
    def _from_payload(cls, payload: object, manifest: CatalogManifest) -> "ItemCatalog":
        if not isinstance(payload, dict) or payload.get("schema_version") != 1:
            raise RuntimeError("Item catalog payload has an unsupported schema")
        sources = payload.get("sources")
        if not isinstance(sources, dict):
            raise RuntimeError("Item catalog has no sources object")
        raw_bases = _required_record(sources, "base_items")
        raw_mods = _required_record(sources, "mods")
        mods_by_base = _required_record(sources, "mods_by_base")
        try:
            bases = _BASE_ITEMS_ADAPTER.validate_python(raw_bases)
            mods = _MODS_ADAPTER.validate_python(raw_mods)
        except ValueError as error:
            raise RuntimeError(
                "Item catalog contains invalid base items or modifiers"
            ) from error
        if len(bases) < 500 or len(mods) < 10_000:
            raise RuntimeError("Item catalog failed minimum completeness thresholds")
        validate_alloy_coverage(mods)
        validate_essence_coverage(
            mod_id
            for mod_id, mod in mods.items()
            if mod.generation_type in {"prefix", "suffix"}
            and mod.spawn_weights
            and not any(weight.weight > 0 for weight in mod.spawn_weights)
        )
        return cls(manifest.repoe_version, bases, mods, mods_by_base, sources)

    def find_base(self, text: str) -> tuple[str, RepoeBaseItem] | None:
        """Resolve one base only when its name and implicit identify it unambiguously."""
        matches = self.find_bases(text)
        return matches[0] if len(matches) == 1 else None

    def find_bases(self, text: str) -> list[tuple[str, RepoeBaseItem]]:
        """Return longest-name base candidates, narrowed by an observed base implicit."""
        haystack = _searchable(text)
        matched_name: str | None = None
        matches: list[tuple[str, RepoeBaseItem]] = []
        for name, item_id in self._names:
            if matched_name is not None and len(name) < len(matched_name):
                break
            if matched_name is not None and name != matched_name:
                continue
            if f" {name} " not in haystack:
                continue
            matched_name = name
            matches.append((item_id, self.bases[item_id]))
        if len(matches) <= 1:
            return matches
        implicit_matches = [
            match for match in matches if self._base_implicit_appears(match[0], text)
        ]
        return implicit_matches if len(implicit_matches) == 1 else matches

    def _base_implicit_appears(self, base_id: str, text: str) -> bool:
        marked_implicits = [
            line for line in text.splitlines() if "(implicit)" in line.casefold()
        ]
        if not marked_implicits:
            return False
        observed = _text_signature("\n".join(marked_implicits))
        return any(
            signature and signature in observed
            for implicit in self.implicit_texts(base_id)
            if (signature := _text_signature(implicit))
        )

    def mods_for_base(self, base_id: str) -> list[tuple[str, RepoeMod]]:
        """Return every modifier compatible with a base according to the snapshot."""
        cached = self._base_mod_cache.get(base_id)
        if cached is not None:
            return cached
        ids = _mapped_mod_ids(self.mods_by_base, base_id, self.mods)
        if ids:
            matched = [(mod_id, self.mods[mod_id]) for mod_id in ids]
            return self._cache_base_mods(base_id, matched)
        base = self.bases[base_id]
        compatible = []
        for mod_id, mod in self.mods.items():
            positive_tags = {
                weight.tag for weight in mod.spawn_weights if weight.weight > 0
            }
            if positive_tags.intersection(base.tags):
                compatible.append((mod_id, mod))
        return self._cache_base_mods(base_id, compatible)

    def _cache_base_mods(
        self, base_id: str, matched: list[tuple[str, RepoeMod]]
    ) -> list[tuple[str, RepoeMod]]:
        known = {mod_id for mod_id, _ in matched}
        for mod_id in self.bases[base_id].implicits:
            if mod_id in self.mods and mod_id not in known:
                matched.append((mod_id, self.mods[mod_id]))
        self._base_mod_cache[base_id] = matched
        return matched

    def implicit_texts(self, base_id: str) -> list[str]:
        """Resolve a base item's built-in modifier IDs to display text."""
        texts = []
        base = self.bases[base_id]
        for mod_id in base.implicits:
            mod = self.mods.get(mod_id)
            if mod is not None and mod.text:
                texts.append(mod.text)
        for skill_id in base.skills_granted:
            display_name = self._skill_name(skill_id)
            if display_name:
                texts.append(f"Grants Skill: {display_name}")
        return texts

    def special_mods_for_base(self, base_id: str) -> list[tuple[str, RepoeMod]]:
        """Return forced outcomes only when their affix family exists on this base."""
        cached = self._special_mod_cache.get(base_id)
        if cached is not None:
            return cached
        natural_groups = {
            group for _, mod in self.mods_for_base(base_id) for group in mod.groups
        }
        compatible = [
            (mod_id, mod)
            for mod_id, mod in self.mods.items()
            if mod.generation_type in {"prefix", "suffix"}
            and mod.spawn_weights
            and not any(weight.weight > 0 for weight in mod.spawn_weights)
            and _special_family_matches_base(
                base_id, self.bases[base_id], mod_id, mod, natural_groups
            )
            and _forced_mod_matches_base(
                base_id, self.bases[base_id], mod_id, self.mods
            )
        ]
        self._special_mod_cache[base_id] = compatible
        return compatible

    def _skill_name(self, skill_id: str) -> str | None:
        base_item = self.bases.get(skill_id)
        if base_item is not None and base_item.name:
            return base_item.name
        skill_gems = self.sources.get("skill_gems")
        if not isinstance(skill_gems, dict):
            return None
        record = skill_gems.get(skill_id)
        if not isinstance(record, dict) or not isinstance(
            record.get("base_item"), dict
        ):
            return None
        display_name = record["base_item"].get("display_name")
        return display_name if isinstance(display_name, str) else None

    def tier_for(self, base_id: str, target_id: str) -> int | None:
        """Derive T1..Tn within one affix group; special sources have no natural tier."""
        target = self.mods[target_id]
        if target.generation_type not in {"prefix", "suffix"} or not target.groups:
            return None

        def same_family(mod: RepoeMod) -> bool:
            if target.type:
                return mod.type == target.type
            return bool(set(mod.groups).intersection(target.groups))

        levels = {
            mod.required_level
            for _, mod in self.mods_for_base(base_id)
            if mod.generation_type == target.generation_type
            and same_family(mod)
            and not mod.is_essence_only
        }
        ordered = sorted(levels, reverse=True)
        if target.required_level not in ordered:
            return None
        return ordered.index(target.required_level) + 1

    def search(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        """Search every item-facing source while keeping result payloads bounded."""
        normalized = " ".join(query.casefold().split())
        if len(normalized) < 2:
            raise ValueError("game-data query must contain at least two characters")
        if not 1 <= limit <= 10:
            raise ValueError("limit must be between 1 and 10")
        return search_records(self.sources, normalized, limit)


def catalog_ready(manifest_path: Path) -> bool:
    """Return readiness without allowing a corrupt or partial artifact through."""
    try:
        get_item_catalog(manifest_path)
        return True
    except (FileNotFoundError, OSError, ValueError, RuntimeError, json.JSONDecodeError):
        return False


def get_item_catalog(manifest_path: Path) -> ItemCatalog:
    """Validate current bytes and cache only one immutable snapshot identity."""
    resolved = manifest_path.resolve(strict=True)
    manifest_hash, artifact_hash = snapshot_identity(resolved)
    return _cached_catalog(str(resolved), manifest_hash, artifact_hash)


@lru_cache(maxsize=4)
def _cached_catalog(path: str, manifest_hash: str, artifact_hash: str) -> ItemCatalog:
    """Cache parsed indexes without allowing a path-only cache to mask corruption."""
    del manifest_hash, artifact_hash
    return ItemCatalog.load(Path(path))


def _required_record(sources: dict[str, object], name: str) -> dict[str, Any]:
    value = sources.get(name)
    if not isinstance(value, dict):
        raise RuntimeError(f"Item catalog source {name!r} is missing or invalid")
    return value


def _collect_known_ids(value: object, mods: dict[str, RepoeMod]) -> list[str]:
    found: set[str] = set()

    def visit(node: object) -> None:
        if isinstance(node, str) and node in mods:
            found.add(node)
        elif isinstance(node, list):
            for child in node:
                visit(child)
        elif isinstance(node, dict):
            for key, child in node.items():
                if key in mods:
                    found.add(key)
                visit(child)

    visit(value)
    return sorted(found)


def _mapped_mod_ids(
    mapping: dict[str, Any], base_id: str, mods: dict[str, RepoeMod]
) -> list[str]:
    """Resolve RePoE's nested `{bases, mods}` mapping for one metadata base ID."""
    found: set[str] = set()

    def visit(node: object) -> None:
        if isinstance(node, dict):
            bases = node.get("bases")
            if isinstance(bases, list) and base_id in bases:
                found.update(_collect_known_ids(node.get("mods"), mods))
            for child in node.values():
                visit(child)
        elif isinstance(node, list):
            for child in node:
                visit(child)

    visit(mapping)
    return sorted(found)


def _searchable(value: str) -> str:
    collapsed = " ".join(value.casefold().split())
    return f" {collapsed} "


def _text_signature(value: str) -> str:
    piped = re.sub(r"\[([^]|]+)\|([^]]+)]", r"\2", value)
    plain = re.sub(r"\[([^]]+)]", r"\1", piped)
    without_numbers = re.sub(r"[+()\d.%–-]+", " ", plain)
    words = re.findall(r"[a-z]+", without_numbers.casefold())
    return " ".join(word for word in words if word != "implicit")


def _forced_mod_matches_base(
    base_id: str,
    base: RepoeBaseItem,
    mod_id: str,
    mods: dict[str, RepoeMod],
) -> bool:
    identifier = mod_id.casefold()
    tags = set(base.tags)
    item_class = base.item_class.casefold()
    if mod_id.startswith("Alloy"):
        return item_class in ALLOY_ITEM_CLASSES.get(mod_id, frozenset())
    if is_essence_family(mod_id):
        return essence_matches_base(mod_id, base_id, base.item_class)
    if "Jewel" in mod_id:
        return item_class == "jewel"
    if _WEAPON_SCOPED_MOD.search(mod_id) and item_class not in _WEAPON_ITEM_CLASSES:
        return False
    if ("twohand" in identifier or "2h" in identifier) and "twohand" not in tags:
        return False
    if ("onehand" in identifier or "1h" in identifier) and "onehand" not in tags:
        return False
    explicit_classes = _explicit_item_classes(mod_id)
    if explicit_classes is not None and item_class not in explicit_classes:
        return False
    numbered = re.fullmatch(r"(.*?)(\d+_?)", mod_id)
    if numbered and "onehand" in tags:
        one_hand_variant = f"{numbered.group(1)}OneHand{numbered.group(2)}"
        if one_hand_variant in mods:
            return False
    return True


def _special_family_matches_base(
    base_id: str,
    base: RepoeBaseItem,
    mod_id: str,
    mod: RepoeMod,
    natural_groups: set[str],
) -> bool:
    if mod_id.startswith("Alloy"):
        return base.item_class.casefold() in ALLOY_ITEM_CLASSES.get(mod_id, frozenset())
    if is_essence_family(mod_id):
        return essence_matches_base(mod_id, base_id, base.item_class)
    return bool(
        natural_groups.intersection(mod.groups)
    ) or _forced_mod_has_matching_class(base, mod_id)


def _forced_mod_has_matching_class(base: RepoeBaseItem, mod_id: str) -> bool:
    item_classes = _explicit_item_classes(mod_id)
    return item_classes is not None and base.item_class.casefold() in item_classes


def _explicit_item_classes(mod_id: str) -> set[str] | None:
    matches = [
        (marker, item_classes)
        for marker, item_classes in _EXPLICIT_CLASS_MARKERS
        if marker in mod_id
    ]
    if not matches:
        return None
    longest = max(len(marker) for marker, _ in matches)
    return {
        item_class
        for marker, item_classes in matches
        if len(marker) == longest
        for item_class in item_classes
    }
