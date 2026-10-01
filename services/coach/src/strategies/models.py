"""Typed contracts for the curated strategy KB (src/data/poe2/strategies/*.json).

The files are authored for the web app; these models mirror `src/core/strategies/schema.ts` and
`src/lib/claim.ts` and reject any drift instead of guessing (tests/test_engine_drift.py pins the
field names to the zod source).
"""

from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from src.entities.models import ENTITY_ID_PATTERN, POE2DB_URL_PATTERN

ClaimVerdict = Literal["vp", "vs", "ss", "uv", "cf", "syn"]
Mechanic = Literal[
    "breach",
    "abyss",
    "delirium",
    "ritual",
    "expedition",
    "essence",
    "strongbox",
    "map_boss",
    "corruption",
    "anomaly",
    "trial_of_chaos",
]
BudgetTier = Literal["league_start", "mid", "high"]
Master = Literal["jado", "doryani", "hilda", "any"]
ModSide = Literal["prefix", "suffix", "unique"]
WaystoneTotal = Literal[
    "item_rarity", "pack_size", "monster_rarity", "monster_effectiveness", "waystone_drop_chance"
]

#: Cheapest first, like BUDGET_TIERS in schema.ts: a budget keeps every tier at or below it.
BUDGET_ORDER: tuple[BudgetTier, ...] = ("league_start", "mid", "high")
#: A grade whose label counts sources must carry that many (MIN_SOURCES in claim.ts).
MIN_SOURCES: dict[ClaimVerdict, int] = {"vp": 1, "vs": 2, "ss": 1, "uv": 0, "cf": 0, "syn": 0}
TRADE_STAT_ID_PATTERN = r"^explicit\.stat_\d+$"
#: Real-money-trading shops are never a claim source (RMT_DOMAINS in claim.ts; host or subdomain).
RMT_DOMAINS: tuple[str, ...] = (
    "poecurrency.com",
    "iggm.com",
    "u4n.com",
    "u4gm.com",
    "mmojugg.com",
    "mmoexp.com",
    "mmogah.com",
    "mmopixel.com",
    "ezg.com",
    "eznpc.com",
    "aoeah.com",
    "ssegold.com",
    "rpgstash.com",
    "timesaver.gg",
    "boostmatch.gg",
    "expcarry.com",
    "epiccarry.com",
    "grindout.com",
    "eld.gg",
    "eldorado.gg",
    "g2g.com",
    "playerauctions.com",
    "overgear.com",
    "odealo.com",
    "skycoach.gg",
    "instant-carry.com",
    "misti.services",
    "conquestcapped.com",
)


def is_rmt_url(url: str) -> bool:
    """True when the URL's host is an RMT shop or one of its subdomains (isRmtUrl in claim.ts)."""
    host = (urlsplit(url).hostname or "").lower()
    return any(host == d or host.endswith(f".{d}") for d in RMT_DOMAINS)


Text = Annotated[str, StringConstraints(min_length=1)]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Claim(_Strict):
    """How well one curated fact is backed, with the sources that back it."""

    v: ClaimVerdict
    src: tuple[str, ...]
    note: str | None = Field(default=None, min_length=1)

    @model_validator(mode="before")
    @classmethod
    def note_is_absent_not_null(cls, data: object) -> object:
        """Match zod `.optional()`: a note is omitted or a string, never an explicit null."""
        if isinstance(data, dict) and "note" in data and data["note"] is None:
            raise ValueError("claim note must be omitted, not null")
        return data

    @model_validator(mode="after")
    def sources_match_grade(self) -> "Claim":
        """Reject too few sources for the grade, a non-https source or an RMT shop."""
        if len(self.src) < MIN_SOURCES[self.v]:
            raise ValueError(f"a {self.v!r} claim needs at least {MIN_SOURCES[self.v]} source(s)")
        for url in self.src:
            if not url.startswith("https://") or any(ch.isspace() for ch in url):
                raise ValueError(f"claim source {url!r} must be an https URL")
            if is_rmt_url(url):
                raise ValueError(f"claim source {url!r} is a real-money-trading shop")
        return self

    @property
    def settled(self) -> bool:
        """Only unverified or conflicting facts are unsettled."""
        return self.v not in ("uv", "cf")


class EntityRef(_Strict):
    """A yield: an id in the entity catalog plus its display name."""

    id: str = Field(pattern=ENTITY_ID_PATTERN)
    name: Text


class StrategyYield(_Strict):
    """One item the strategy produces."""

    ref: EntityRef
    role: Literal["primary", "secondary", "lottery"]
    why: Text
    claim: Claim


class MasterNode(_Strict):
    """One Atlas Master node."""

    name: Text
    tier: int = Field(ge=1, le=4)
    effect: Text
    claim: Claim


class AtlasMaster(_Strict):
    """The Atlas Master and up to four active nodes."""

    master: Master
    nodes: tuple[MasterNode, ...] = Field(max_length=4)
    alt: Text | None
    claim: Claim


class AtlasPassive(_Strict):
    """One atlas passive notable with its poe2db page."""

    name: Text
    tree: Text
    effect: Text
    priority: Literal["core", "recommended", "optional"]
    poe2db_url: str = Field(pattern=POE2DB_URL_PATTERN)
    claim: Claim


class TabletMod(_Strict):
    """One tablet modifier and its trade2 stat id, when pinned."""

    text: Text
    side: ModSide
    trade_stat_id: str | None = Field(pattern=TRADE_STAT_ID_PATTERN)
    claim: Claim


class Tablet(_Strict):
    """A tablet base (trade2 name) with the mods to look for."""

    type: Text
    unique: Text | None
    count: int | None = Field(ge=1, le=4)
    mods: tuple[TabletMod, ...] = Field(min_length=1)


class Waystone(_Strict):
    """Waystone totals to roll for."""

    prefer: tuple[WaystoneTotal, ...]
    notes: Text
    claim: Claim


class Budget(_Strict):
    """Budget tier with what the build must handle."""

    tier: BudgetTier
    build_needs: Text
    claim: Claim


class PatchStamp(_Strict):
    """Which patch and leagues the facts were checked against, and when."""

    verified_against: Text
    leagues: tuple[Text, ...] = Field(min_length=1)
    stamped_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class Measured(_Strict):
    """Measured outcome, once sessions exist."""

    div_per_hour_p50: float | None = Field(gt=0)
    n_sessions: int = Field(ge=0)


class FarmStrategy(_Strict):
    """One curated farm strategy file."""

    schema_version: Literal[1]
    id: str = Field(pattern=ENTITY_ID_PATTERN)
    title: Text
    summary: Text
    mechanics: tuple[Mechanic, ...] = Field(min_length=1)
    patch: PatchStamp
    status: Literal["draft", "reviewed", "stale"]
    budget: Budget
    yields: tuple[StrategyYield, ...] = Field(min_length=1)
    atlas_master: AtlasMaster
    atlas_passives: tuple[AtlasPassive, ...]
    tablets: tuple[Tablet, ...]
    waystone: Waystone
    steps: tuple[Text, ...] = Field(min_length=1)
    risks: tuple[Text, ...]
    measured: Measured | None
