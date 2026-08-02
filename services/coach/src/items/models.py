"""Validated models for the local RePoE snapshot and item inspection output."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class RepoeBaseItem(BaseModel):
    """Fields needed to identify a base and explain its built-in properties."""

    model_config = ConfigDict(extra="allow")

    name: str
    item_class: str
    tags: list[str] = Field(default_factory=list)
    requirements: dict[str, Any] | None = None
    properties: dict[str, Any] | None = None
    implicits: list[str] = Field(default_factory=list)
    skills_granted: list[str] = Field(default_factory=list)
    drop_level: int = 0


class RepoeModStat(BaseModel):
    """One numerical stat range emitted by a modifier."""

    model_config = ConfigDict(extra="allow")

    id: str
    min: float | int
    max: float | int


class RepoeSpawnWeight(BaseModel):
    """A base tag compatibility marker; PoE2 weights are not probability data."""

    model_config = ConfigDict(extra="allow")

    tag: str
    weight: int | float


class RepoeMod(BaseModel):
    """Relevant fields from one datamined RePoE modifier record.

    RePoE's `required_level` is the minimum entity/item level for generation, not the character
    level shown by an item's `Requires:` row.
    """

    model_config = ConfigDict(extra="allow")

    domain: str = ""
    generation_type: str
    groups: list[str] = Field(default_factory=list)
    name: str = ""
    required_level: int
    spawn_weights: list[RepoeSpawnWeight] = Field(default_factory=list)
    stats: list[RepoeModStat] = Field(default_factory=list)
    text: str | None = None
    type: str = ""
    is_essence_only: bool = False


class ModifierMatch(BaseModel):
    """A clipboard modifier resolved to one datamined modifier and tier."""

    id: str
    name: str
    generation_type: str
    tier: int | None
    minimum_item_level: int
    text: str
    observed_lines: list[str]
    groups: list[str]
    source: Literal["natural", "special"]


class ItemInspection(BaseModel):
    """Deterministic item inspection passed to the model as grounded context."""

    recognized: bool
    complete: bool
    catalog_version: str
    base_id: str | None = None
    base_name: str | None = None
    item_class: str | None = None
    item_level: int | None = None
    requirements: dict[str, Any] | None = None
    base_properties: dict[str, Any] | None = None
    base_implicits: list[str] = Field(default_factory=list)
    modifiers: list[ModifierMatch] = Field(default_factory=list)
    prefix_count: int = 0
    suffix_count: int = 0
    open_prefixes: int | None = None
    open_suffixes: int | None = None
    unmatched_lines: list[str] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
    limitations: list[str] = Field(default_factory=list)
    evidence_id: str | None = None
