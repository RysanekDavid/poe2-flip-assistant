"""Typed contracts for the curated strategy KB (src/data/poe2/strategies/*.json).

The files are authored for the web app; these models mirror `src/core/strategies/schema.ts` and
`src/lib/claim.ts` and reject any drift instead of guessing (tests/test_engine_drift.py pins the
field names to the zod source).
"""

from typing import Annotated, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, TypeAdapter, model_validator

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
    "temple",
    "citadel",
    "irradiated",
]
BudgetTier = Literal["league_start", "mid", "high"]
StrategyKind = Literal["farm", "roll_and_sell", "trade", "liquidate"]
ItemRarity = Literal["normal", "magic", "rare"]
SellUnit = Literal["single", "set_of_3"]
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
#: Build and Complexity scale (RATING_MIN / RATING_MAX in schema.ts).
RATING_MIN = 1
RATING_MAX = 5
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


def _require_source(rated: bool, claim: Claim) -> None:
    """A drawn rating must cite what it rests on (requireSourceWhenRated in schema.ts)."""
    if rated and not claim.src:
        raise ValueError("a rating needs at least one source URL")


class Budget(_Strict):
    """Budget tier, why it is that tier, and what the build must handle."""

    tier: BudgetTier
    why: Text
    build_needs: Text
    claim: Claim

    @model_validator(mode="after")
    def tier_is_sourced(self) -> "Budget":
        """The tier is always drawn, so its claim always cites a source."""
        _require_source(True, self.claim)
        return self


class Rating(_Strict):
    """One curated 1-5 rating; null when the sources support no step."""

    value: int | None = Field(ge=RATING_MIN, le=RATING_MAX)
    why: Text
    claim: Claim

    @model_validator(mode="after")
    def rated_value_is_sourced(self) -> "Rating":
        """A rated value cites a source; an unrated one may not."""
        _require_source(self.value is not None, self.claim)
        return self


class Ratings(_Strict):
    """How demanding the strategy is on the build, and how much there is to set up and decide."""

    build: Rating
    complexity: Rating


class Durability(_Strict):
    """The game mechanic that keeps a strategy working until a nerf, and what would end it."""

    why_it_works: Text
    breaks_when: tuple[Text, ...] = Field(min_length=1)
    claim: Claim

    @model_validator(mode="after")
    def mechanic_is_sourced(self) -> "Durability":
        """The mechanic is always drawn as a claim, so it always cites a source."""
        _require_source(True, self.claim)
        return self


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

    schema_version: Literal[3]
    kind: Literal["farm"]
    id: str = Field(pattern=ENTITY_ID_PATTERN)
    title: Text
    summary: Text
    mechanics: tuple[Mechanic, ...] = Field(min_length=1)
    patch: PatchStamp
    status: Literal["draft", "reviewed", "stale"]
    budget: Budget
    ratings: Ratings
    durability: Durability
    yields: tuple[StrategyYield, ...] = Field(min_length=1)
    atlas_master: AtlasMaster
    atlas_passives: tuple[AtlasPassive, ...]
    tablets: tuple[Tablet, ...]
    waystone: Waystone
    steps: tuple[Text, ...] = Field(min_length=1)
    risks: tuple[Text, ...]
    measured: Measured | None


class RollTarget(_Strict):
    """The trade2 base a roll-and-sell method rolls, and the rarities it uses."""

    base: Text
    rarity: tuple[ItemRarity, ...] = Field(min_length=1)
    claim: Claim


class RollStep(_Strict):
    """One rolling step and the currency it spends."""

    action: Text
    currencies: tuple[EntityRef, ...]
    claim: Claim


class Demand(_Strict):
    """Why buyers want the rolled item; a creator's price stays a dated claim."""

    why: Text
    claim: Claim


class ConversionLeg(_Strict):
    """A catalog item and how many of it a conversion takes or gives."""

    ref: EntityRef
    qty: int = Field(ge=1)


class Conversion(_Strict):
    """One deterministic conversion whose legs all trade on the exchange (EV is computed live)."""

    inputs: tuple[ConversionLeg, ...] = Field(min_length=1)
    outputs: tuple[ConversionLeg, ...] = Field(min_length=1)
    claim: Claim


class TradeLeg(_Strict):
    """One thing a trade method takes or gives, in words, with a catalog ref when it has one."""

    text: Text
    ref: EntityRef | None
    claim: Claim


class Odds(_Strict):
    """How the outcome is decided; loss_chance is the share of attempts that destroy the input."""

    text: Text
    loss_chance: float | None = Field(ge=0, le=1)
    claim: Claim


class RollAndSellStrategy(_Strict):
    """An item rolled for target mods and sold."""

    schema_version: Literal[3]
    kind: Literal["roll_and_sell"]
    id: str = Field(pattern=ENTITY_ID_PATTERN)
    title: Text
    summary: Text
    mechanics: tuple[Mechanic, ...]
    patch: PatchStamp
    status: Literal["draft", "reviewed", "stale"]
    budget: Budget
    ratings: Ratings
    durability: Durability
    target: RollTarget
    target_mods: tuple[TabletMod, ...]
    roll_steps: tuple[RollStep, ...] = Field(min_length=1)
    sell_unit: SellUnit
    sell_ref: EntityRef | None
    price_refs: tuple[Conversion, ...]
    demand: Demand
    risks: tuple[Text, ...]


class TradeStrategy(_Strict):
    """Inputs turned into outputs, with graded odds and priced conversions."""

    schema_version: Literal[3]
    kind: Literal["trade"]
    id: str = Field(pattern=ENTITY_ID_PATTERN)
    title: Text
    summary: Text
    mechanics: tuple[Mechanic, ...]
    patch: PatchStamp
    status: Literal["draft", "reviewed", "stale"]
    budget: Budget
    ratings: Ratings
    durability: Durability
    inputs: tuple[TradeLeg, ...] = Field(min_length=1)
    outputs: tuple[TradeLeg, ...] = Field(min_length=1)
    odds: Odds
    price_refs: tuple[Conversion, ...]
    steps: tuple[Text, ...] = Field(min_length=1)
    risks: tuple[Text, ...]


class LiquidateStrategy(_Strict):
    """A list of items to sell and where."""

    schema_version: Literal[3]
    kind: Literal["liquidate"]
    id: str = Field(pattern=ENTITY_ID_PATTERN)
    title: Text
    summary: Text
    mechanics: tuple[Mechanic, ...]
    patch: PatchStamp
    status: Literal["draft", "reviewed", "stale"]
    budget: Budget
    ratings: Ratings
    durability: Durability
    items: tuple[TradeLeg, ...] = Field(min_length=1)
    sell_route: Text
    steps: tuple[Text, ...] = Field(min_length=1)
    risks: tuple[Text, ...]


#: One strategy file of any kind (strategySchema, z.discriminatedUnion("kind", ...) in schema.ts).
Strategy = Annotated[
    FarmStrategy | RollAndSellStrategy | TradeStrategy | LiquidateStrategy,
    Field(discriminator="kind"),
]
STRATEGY_ADAPTER: TypeAdapter[Strategy] = TypeAdapter(Strategy)


def _conversion_refs(conversions: tuple[Conversion, ...]) -> tuple[EntityRef, ...]:
    return tuple(leg.ref for c in conversions for leg in c.inputs + c.outputs)


def strategy_refs(strategy: Strategy) -> tuple[EntityRef, ...]:
    """Every catalog ref a strategy names (strategyRefs in schema.ts)."""
    match strategy:
        case FarmStrategy():
            return tuple(y.ref for y in strategy.yields)
        case RollAndSellStrategy():
            sold = (strategy.sell_ref,) if strategy.sell_ref is not None else ()
            spent = tuple(c for step in strategy.roll_steps for c in step.currencies)
            return spent + sold + _conversion_refs(strategy.price_refs)
        case TradeStrategy():
            legs = strategy.inputs + strategy.outputs
            named = tuple(leg.ref for leg in legs if leg.ref is not None)
            return named + _conversion_refs(strategy.price_refs)
        case LiquidateStrategy():
            return tuple(leg.ref for leg in strategy.items if leg.ref is not None)
