"""Deterministic base, affix, tier, and compound-mod parsing for pasted items."""

import re
from dataclasses import dataclass

from src.evidence import evidence_id
from src.items.catalog import ItemCatalog
from src.items.models import ItemInspection, ModifierMatch, RepoeBaseItem, RepoeMod

_MARKUP = re.compile(r"\[([^]|]+)\|([^]]+)]")
_SIMPLE_MARKUP = re.compile(r"\[([^]]+)]")
_ANNOTATION = re.compile(r"\s+[—-]\s+(?:P|S|T)\d+\s*$", re.I)
_SOURCE_ANNOTATION = re.compile(r"\s+\((?:implicit|rune|crafted)\)\s*$", re.I)
_NUMBER_TOKEN = re.compile(r"\([+-]?[\d.]+\s*[-–]\s*[+-]?[\d.]+\)|[+-]?[\d.]+|#|\{\d+}")
_NUMBER_VALUE = r"(\(?[+-]?\d+(?:\.\d+)?(?:\s*[-–]\s*[+-]?\d+(?:\.\d+)?)?\)?)"
_ITEM_LEVEL = re.compile(r"^item level:\s*(\d+)\s*$", re.I)
_SKIP_PREFIXES = (
    "rarity:",
    "item class:",
    "requires:",
    "level:",
    "quality:",
    "sockets:",
    "note:",
)
_PROPERTY_PREFIXES = (
    "armour:",
    "evasion rating:",
    "energy shield:",
    "physical damage:",
    "elemental damage:",
    "attacks per second:",
    "critical hit chance:",
    "block chance:",
    "spirit:",
)


@dataclass(frozen=True)
class _Candidate:
    mod_id: str
    mod: RepoeMod
    template_lines: tuple[str, ...]
    forced: bool


@dataclass(frozen=True)
class _Resolved:
    candidate: _Candidate | None
    ambiguity: str | None


def looks_like_item_text(catalog: ItemCatalog, text: str) -> bool:
    """Detect pasted item data without treating a bare base-name question as a clipboard."""
    lowered = text.casefold()
    structured = "item class:" in lowered and (
        "rarity:" in lowered or "item level:" in lowered
    )
    bulleted = "•" in text and "requires:" in lowered
    known_base = bool(catalog.find_bases(text))
    return (
        structured
        or bulleted
        or (known_base and ("requires:" in lowered or "item level:" in lowered))
    )


def inspect_item_text(catalog: ItemCatalog, text: str) -> ItemInspection:
    """Resolve a pasted item against the local catalog and expose every uncertainty."""
    resolved_bases = catalog.find_bases(text)
    if not resolved_bases:
        return _unrecognized_inspection(catalog, text)
    if len(resolved_bases) > 1:
        return _ambiguous_base_inspection(catalog, resolved_bases)
    base_id, base = resolved_bases[0]
    base_implicits = catalog.implicit_texts(base_id)
    candidates = _candidates(catalog, base_id)
    stat_lines = _stat_lines(text, base, candidates)
    matches, unmatched, ambiguities = _resolve_lines(
        stat_lines, candidates, catalog, base_id
    )
    unmatched = [*_granted_skill_mismatches(text, base_implicits), *unmatched]
    prefixes = sum(match.generation_type == "prefix" for match in matches)
    suffixes = sum(match.generation_type == "suffix" for match in matches)
    capacity = _affix_capacity(base.item_class)
    capacity_issues = _capacity_issues(capacity, prefixes, suffixes)
    ambiguities.extend(capacity_issues)
    source_id = evidence_id("D", f"{catalog.version}|{base_id}|{'|'.join(stat_lines)}")
    return ItemInspection(
        recognized=True,
        complete=not unmatched and not ambiguities,
        catalog_version=catalog.version,
        base_id=base_id,
        base_name=base.name,
        item_class=base.item_class,
        item_level=_item_level(text),
        requirements=base.requirements,
        base_properties=base.properties,
        base_implicits=base_implicits,
        modifiers=matches,
        prefix_count=prefixes,
        suffix_count=suffixes,
        open_prefixes=None if capacity is None else max(0, capacity[0] - prefixes),
        open_suffixes=None if capacity is None else max(0, capacity[1] - suffixes),
        unmatched_lines=unmatched,
        ambiguities=ambiguities,
        limitations=[
            "Character requirements are not item level.",
            "PoE2 client data does not expose complete modifier spawn probabilities.",
            "The catalog proves available outcomes, not a guaranteed optimal currency sequence.",
            *(
                [
                    "Affix counts above the ordinary cap require a separately "
                    "verified special mechanic."
                ]
                if capacity_issues
                else []
            ),
        ],
        evidence_id=source_id,
    )


def _unrecognized_inspection(catalog: ItemCatalog, text: str) -> ItemInspection:
    return ItemInspection(
        recognized=False,
        complete=False,
        catalog_version=catalog.version,
        unmatched_lines=_stat_lines(text, None, []),
        limitations=["No catalog base name could be resolved from the pasted text."],
    )


def _ambiguous_base_inspection(
    catalog: ItemCatalog, resolved_bases: list[tuple[str, RepoeBaseItem]]
) -> ItemInspection:
    base_ids = ", ".join(item_id for item_id, _ in resolved_bases)
    return ItemInspection(
        recognized=True,
        complete=False,
        catalog_version=catalog.version,
        base_name=resolved_bases[0][1].name,
        item_class=resolved_bases[0][1].item_class,
        ambiguities=[f"Base name matches multiple variants: {base_ids}"],
        limitations=["Paste the complete base implicit to identify the exact variant."],
    )


def _candidates(catalog: ItemCatalog, base_id: str) -> list[_Candidate]:
    candidates = []
    natural = catalog.mods_for_base(base_id)
    known_ids = {mod_id for mod_id, _ in natural}
    special = [
        entry
        for entry in catalog.special_mods_for_base(base_id)
        if entry[0] not in known_ids
    ]
    for mod_id, mod, forced in [
        *((mod_id, mod, False) for mod_id, mod in natural),
        *((mod_id, mod, True) for mod_id, mod in special),
    ]:
        if not mod.text:
            continue
        lines = tuple(
            line.strip() for line in _plain_text(mod.text).splitlines() if line.strip()
        )
        if lines:
            candidates.append(_Candidate(mod_id, mod, lines, forced))
    return sorted(
        candidates, key=lambda candidate: len(candidate.template_lines), reverse=True
    )


def _resolve_lines(
    lines: list[str], candidates: list[_Candidate], catalog: ItemCatalog, base_id: str
) -> tuple[list[ModifierMatch], list[str], list[str]]:
    matches: list[ModifierMatch] = []
    unmatched: list[str] = []
    ambiguities: list[str] = []
    index = 0
    while index < len(lines):
        resolved = _resolve_at(lines, index, candidates)
        if resolved.candidate is None:
            unmatched.append(lines[index])
            if resolved.ambiguity:
                ambiguities.append(resolved.ambiguity)
            index += 1
            continue
        candidate = resolved.candidate
        observed = lines[index : index + len(candidate.template_lines)]
        matches.append(_modifier_match(catalog, base_id, candidate, observed))
        index += len(candidate.template_lines)
    return matches, unmatched, ambiguities


def _resolve_at(
    lines: list[str], index: int, candidates: list[_Candidate]
) -> _Resolved:
    hits: list[tuple[int, _Candidate]] = []
    longest = 0
    for candidate in candidates:
        size = len(candidate.template_lines)
        if size < longest or index + size > len(lines):
            continue
        score = _candidate_score(lines[index : index + size], candidate)
        if score is None:
            continue
        if size > longest:
            longest = size
            hits = []
        hits.append((score, candidate))
    if not hits:
        return _Resolved(None, None)
    best_score = max(score for score, _ in hits)
    best = [candidate for score, candidate in hits if score == best_score]
    if len(best) != 1:
        ids = ", ".join(candidate.mod_id for candidate in best[:4])
        return _Resolved(None, f"Modifier line is ambiguous between: {ids}")
    return _Resolved(best[0], None)


def _candidate_score(observed: list[str], candidate: _Candidate) -> int | None:
    score = 0
    captures: list[str] = []
    for value, template in zip(observed, candidate.template_lines, strict=True):
        pattern = _template_pattern(template)
        match = pattern.fullmatch(_clean_line(value))
        if match is None:
            return None
        captures.extend(match.groups())
    numeric_score = _range_score(captures, candidate)
    if numeric_score is None:
        return None
    score += numeric_score + len(candidate.template_lines) * 10
    return score


def _template_pattern(template: str) -> re.Pattern[str]:
    parts = _NUMBER_TOKEN.split(_plain_text(template))
    tokens = _NUMBER_TOKEN.findall(_plain_text(template))
    pattern = re.escape(parts[0]).replace(r"\ ", r"\s+")
    for _token, part in zip(tokens, parts[1:], strict=True):
        pattern += _NUMBER_VALUE + re.escape(part).replace(r"\ ", r"\s+")
    return re.compile(pattern, re.I)


def _range_score(captures: list[str], candidate: _Candidate) -> int | None:
    if not captures:
        return 1
    displayed = _display_ranges(candidate.template_lines)
    ranges = (
        displayed
        if len(displayed) == len(captures)
        else [(float(stat.min), float(stat.max)) for stat in candidate.mod.stats]
    )
    if len(captures) > len(ranges):
        return None
    score = 0
    for captured, allowed in zip(captures, ranges, strict=False):
        observed = _numeric_range(captured)
        if observed is None or observed[0] < allowed[0] or observed[1] > allowed[1]:
            return None
        score += 4 if observed == allowed else 2
    return score


def _display_ranges(lines: tuple[str, ...]) -> list[tuple[float, float]]:
    ranges = []
    for line in lines:
        plain = _plain_text(line)
        for start, end in re.findall(
            r"\(([+-]?[\d.]+)\s*[-–]\s*([+-]?[\d.]+)\)", plain
        ):
            ranges.append((float(start), float(end)))
    return ranges


def _numeric_range(value: str) -> tuple[float, float] | None:
    plain = value.strip("() ")
    range_match = re.fullmatch(
        r"([+-]?\d+(?:\.\d+)?)\s*[-–]\s*([+-]?\d+(?:\.\d+)?)",
        plain,
    )
    if range_match:
        return float(range_match.group(1)), float(range_match.group(2))
    if not re.fullmatch(r"[+-]?\d+(?:\.\d+)?", plain):
        return None
    parsed = float(plain)
    return parsed, parsed


def _modifier_match(
    catalog: ItemCatalog, base_id: str, candidate: _Candidate, observed: list[str]
) -> ModifierMatch:
    mod = candidate.mod
    identity = f"{candidate.mod_id} {mod.name} {mod.type}".casefold()
    special = (
        candidate.forced
        or mod.is_essence_only
        or "alloy" in identity
        or mod.generation_type not in {"prefix", "suffix"}
    )
    return ModifierMatch(
        id=candidate.mod_id,
        name=mod.name or mod.type or candidate.mod_id,
        generation_type=mod.generation_type,
        tier=catalog.tier_for(base_id, candidate.mod_id),
        minimum_item_level=mod.required_level,
        text=mod.text or "",
        observed_lines=observed,
        groups=mod.groups,
        source="special" if special else "natural",
    )


def _stat_lines(
    text: str, base: RepoeBaseItem | None, candidates: list[_Candidate]
) -> list[str]:
    bullet_mode = "•" in text
    if not bullet_mode:
        clipboard_lines = _clipboard_modifier_lines(text)
        if clipboard_lines is not None:
            return [_clean_line(line) for line in clipboard_lines if _clean_line(line)]
    chunks = text.split("•")[1:] if bullet_mode else [text]
    raw_lines = [raw for chunk in chunks for raw in chunk.splitlines()]
    base_name = base.name.casefold() if base else ""
    lines: list[str] = []
    for raw in raw_lines:
        line = _clean_line(raw)
        lowered = line.casefold()
        if not line or lowered.startswith(_SKIP_PREFIXES) or _ITEM_LEVEL.match(line):
            continue
        if lowered.startswith(_PROPERTY_PREFIXES) or lowered.startswith(
            "grants skill:"
        ):
            continue
        if base_name and base_name in lowered:
            continue
        if (
            bullet_mode
            or _looks_like_stat(line)
            or _matches_static_template(line, candidates)
        ):
            lines.append(line)
    return lines


def _clipboard_modifier_lines(text: str) -> list[str] | None:
    """Return the explicit-mod section of a real Ctrl+C payload, including unknown text."""
    lines = text.splitlines()
    item_level_index = next(
        (index for index, line in enumerate(lines) if _ITEM_LEVEL.match(line.strip())),
        None,
    )
    if item_level_index is None:
        return None
    separator_index = next(
        (
            index
            for index in range(item_level_index + 1, len(lines))
            if _is_separator(lines[index])
        ),
        None,
    )
    if separator_index is None:
        return []
    return [
        line
        for line in lines[separator_index + 1 :]
        if line.strip() and not _is_separator(line)
    ]


def _is_separator(line: str) -> bool:
    stripped = line.strip()
    return len(stripped) >= 5 and set(stripped) == {"-"}


def _looks_like_stat(line: str) -> bool:
    lowered = line.casefold()
    markers = ("%", "+", "gain ", "adds ", "increased ", "reduced ", " to ")
    return any(marker in lowered for marker in markers)


def _matches_static_template(line: str, candidates: list[_Candidate]) -> bool:
    for candidate in candidates:
        if len(candidate.template_lines) != 1:
            continue
        template = candidate.template_lines[0]
        static = not _NUMBER_TOKEN.search(template)
        same_text = _clean_line(template).casefold() == line.casefold()
        if static and same_text:
            return True
    return False


def _granted_skill_mismatches(text: str, base_implicits: list[str]) -> list[str]:
    observed = [
        _clean_line(line)
        for line in text.replace("•", "\n").splitlines()
        if _clean_line(line).casefold().startswith("grants skill:")
    ]
    expected = {_clean_line(line).casefold() for line in base_implicits}
    return [line for line in observed if line.casefold() not in expected]


def _item_level(text: str) -> int | None:
    for raw in text.replace("•", "\n").splitlines():
        match = _ITEM_LEVEL.match(raw.strip())
        if match:
            return int(match.group(1))
    return None


def _affix_capacity(item_class: str) -> tuple[int, int] | None:
    lowered = item_class.casefold()
    if "jewel" in lowered:
        return (2, 2)
    equipment = (
        "axe",
        "mace",
        "sword",
        "flail",
        "claw",
        "dagger",
        "sceptre",
        "crossbow",
        "quarterstaff",
        "quarterstaves",
        "staff",
        "staves",
        "wand",
        "bow",
        "spear",
        "armour",
        "shield",
        "quiver",
        "helmet",
        "gloves",
        "boots",
        "focus",
        "foci",
        "ring",
        "amulet",
        "belt",
    )
    return (3, 3) if any(kind in lowered for kind in equipment) else None


def _capacity_issues(
    capacity: tuple[int, int] | None, prefixes: int, suffixes: int
) -> list[str]:
    if capacity is None:
        return []
    issues = []
    if prefixes > capacity[0]:
        issues.append(f"Observed {prefixes} prefixes exceeds ordinary cap {capacity[0]}")
    if suffixes > capacity[1]:
        issues.append(f"Observed {suffixes} suffixes exceeds ordinary cap {capacity[1]}")
    return issues


def _clean_line(value: str) -> str:
    without_annotation = _ANNOTATION.sub("", value.strip(" \t-*"))
    without_source = _SOURCE_ANNOTATION.sub("", without_annotation)
    return " ".join(without_source.replace("–", "-").split())


def _plain_text(value: str) -> str:
    piped = _MARKUP.sub(lambda match: match.group(2), value)
    return _SIMPLE_MARKUP.sub(lambda match: match.group(1), piped).replace("–", "-")
