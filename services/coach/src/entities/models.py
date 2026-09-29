"""Typed contracts for the generated entity catalog and the entities a Coach answer carries.

The catalog file is written by the TypeScript builder (`npm run sync:entities`); these models
mirror `src/core/entities/schema.ts` and reject any drift instead of guessing.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EntityKind = Literal[
    "currency",
    "omen",
    "essence",
    "catalyst",
    "fragment",
    "rune",
    "soul_core",
    "idol",
    "augment",
    "lineage_gem",
    "uncut_gem",
    "waystone",
    "unique",
    "other",
]

ENTITY_CATALOG_SCHEMA_VERSION = 1
# The site CSP allows images only from the app itself and *.poecdn.com.
POECDN_ICON_PATTERN = (
    r"^https://web\.poecdn\.com/gen/image/[A-Za-z0-9_\-=]+/[0-9a-f]{10}/[\w\-.%]+\.png$"
)
POE2DB_URL_PATTERN = r"^https://poe2db\.tw/us/\S+$"
ENTITY_ID_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
_SHA256_PATTERN = r"^[a-f0-9]{64}$"


class EntityRow(BaseModel):
    """One player-facing thing with its art and in-game text."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str = Field(pattern=ENTITY_ID_PATTERN)
    kind: EntityKind
    name: str = Field(min_length=1)
    aliases: tuple[str, ...]
    summary: str | None = Field(min_length=1)
    directions: str | None = Field(min_length=1)
    stack_size: int | None = Field(gt=0)
    icon_url: str | None = Field(pattern=POECDN_ICON_PATTERN)
    exchange_id: str | None = Field(min_length=1)
    repoe_id: str | None = Field(min_length=1)
    item_class: str | None = Field(min_length=1)
    base_type: str | None = Field(min_length=1)
    poe2db_url: str = Field(pattern=POE2DB_URL_PATTERN)


class EntityCatalogFile(BaseModel):
    """The whole generated artifact, stamped against the RePoE snapshot it was built from."""

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1]
    source_sha256: str = Field(pattern=_SHA256_PATTERN)
    repoe_version: str = Field(min_length=1)
    game_data_patch: str = Field(min_length=1)
    trade_static_sha256: str = Field(pattern=_SHA256_PATTERN)
    fetched_on: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    entities: list[EntityRow] = Field(min_length=1)


class CoachEntity(BaseModel):
    """An entity mentioned in (or evidenced for) one answer, as the chat UI renders it."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=ENTITY_ID_PATTERN)
    name: str = Field(min_length=1)
    kind: EntityKind
    icon_url: str | None = Field(pattern=POECDN_ICON_PATTERN)
    summary: str | None
    directions: str | None
    poe2db_url: str = Field(pattern=POE2DB_URL_PATTERN)
    #: Exact substrings of the answer that refer to this entity ("Divine Orbs", "3 div").
    mentions: list[str] = Field(max_length=8)
    price_div: float | None = Field(default=None, gt=0)
    price_at: str | None = None
