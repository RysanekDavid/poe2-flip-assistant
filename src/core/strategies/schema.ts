/*
 * The strategy knowledge base: one curated JSON file per strategy under
 * src/data/poe2/strategies/<id>.json, discriminated by `kind`: a farm (which Atlas Master nodes,
 * atlas notables, tablets and waystone totals a mechanic wants, and what the basket sells), a
 * roll-and-sell (an item rolled for target mods and sold), a trade method (inputs turned into
 * outputs, priced live where every leg trades on the exchange). Every fact
 * carries a claim grade so the UI and the Coach can tell a datamined fact from a lead. Keys are
 * snake_case because the Python Coach reads the same files (services/coach/src/strategies/models.py mirrors this schema;
 * tests/test_engine_drift.py pins the keys). Object shapes are written `z\n  .object({` with
 * 4-space keys on purpose: that drift test parses them.
 */
import { z } from "zod";
import { claimSchema, type Claim } from "../../lib/claim";
import { ENTITY_ID_PATTERN, POE2DB_URL_PATTERN } from "../entities/schema";

export const STRATEGY_SCHEMA_VERSION = 3;

/** What a strategy is for; each kind has its own shape below and its own place in the app. */
export const STRATEGY_KINDS = ["farm", "roll_and_sell", "trade"] as const;
export type StrategyKind = (typeof STRATEGY_KINDS)[number];

export const MECHANICS = [
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
] as const;
export const mechanicSchema = z.enum(MECHANICS);
export type Mechanic = z.infer<typeof mechanicSchema>;

/** Cheapest first: a budget filter keeps every tier at or below the one chosen. */
export const BUDGET_TIERS = ["league_start", "mid", "high"] as const;
export const budgetTierSchema = z.enum(BUDGET_TIERS);
export type BudgetTier = z.infer<typeof budgetTierSchema>;

export const MASTERS = ["jado", "doryani", "hilda", "any"] as const;
export const WAYSTONE_TOTALS = ["item_rarity", "pack_size", "monster_rarity", "monster_effectiveness", "waystone_drop_chance"] as const;
export const YIELD_ROLES = ["primary", "secondary", "lottery"] as const;
export const PASSIVE_PRIORITIES = ["core", "recommended", "optional"] as const;
export const STRATEGY_STATUSES = ["draft", "reviewed", "stale"] as const;
export const ITEM_RARITIES = ["normal", "magic", "rare"] as const;
/** How a rolled item is listed: alone, or in threes (a map takes up to three tablets). */
export const SELL_UNITS = ["single", "set_of_3"] as const;
/** A magic tablet takes one prefix and one suffix, so players plan by side; a unique tablet's mods are fixed. */
export const MOD_SIDES = ["prefix", "suffix", "unique"] as const;

export const STRATEGY_ID_PATTERN = ENTITY_ID_PATTERN;
/** Only explicit tablet stats: a pseudo or implicit id would search for the wrong thing. */
export const TRADE_STAT_ID_PATTERN = /^explicit\.stat_\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Build and Complexity are rated on this scale; ratings.ts holds what each step means. */
export const RATING_MIN = 1;
export const RATING_MAX = 5;

const nonEmpty = z.string().min(1);

export const entityRefSchema = z
  .object({
    id: z.string().regex(ENTITY_ID_PATTERN),
    name: nonEmpty,
  })
  .strict();

export const yieldSchema = z
  .object({
    ref: entityRefSchema,
    role: z.enum(YIELD_ROLES),
    why: nonEmpty,
    claim: claimSchema,
  })
  .strict();

export const masterNodeSchema = z
  .object({
    name: nonEmpty,
    tier: z.number().int().min(1).max(4),
    effect: nonEmpty,
    claim: claimSchema,
  })
  .strict();

export const atlasMasterSchema = z
  .object({
    master: z.enum(MASTERS),
    // Four nodes are active at a time (poe2db Masters_of_the_Atlas).
    nodes: z.array(masterNodeSchema).max(4),
    alt: nonEmpty.nullable(),
    claim: claimSchema,
  })
  .strict();

export const atlasPassiveSchema = z
  .object({
    name: nonEmpty,
    tree: nonEmpty,
    effect: nonEmpty,
    priority: z.enum(PASSIVE_PRIORITIES),
    poe2db_url: z.string().regex(POE2DB_URL_PATTERN),
    claim: claimSchema,
  })
  .strict();

export const tabletModSchema = z
  .object({
    text: nonEmpty,
    side: z.enum(MOD_SIDES),
    trade_stat_id: z.string().regex(TRADE_STAT_ID_PATTERN).nullable(),
    claim: claimSchema,
  })
  .strict();

export const tabletSchema = z
  .object({
    /** The trade2 base name ("Overseer Tablet"), so a search link finds the item. */
    type: nonEmpty,
    /** A unique tablet's name ("Mastered Domain"); null for a magic/rare base. */
    unique: nonEmpty.nullable(),
    count: z.number().int().min(1).max(4).nullable(),
    mods: z.array(tabletModSchema).min(1),
  })
  .strict();

export const waystoneSchema = z
  .object({
    prefer: z.array(z.enum(WAYSTONE_TOTALS)),
    notes: nonEmpty,
    claim: claimSchema,
  })
  .strict();

/**
 * A curated rating is a claim the card draws as a bar, so it must cite what it rests on: a rated
 * value with no source would be a number we made up. An unrated (null) value draws "—".
 */
function requireSourceWhenRated(rated: boolean, claim: Claim, ctx: z.RefinementCtx): void {
  if (rated && claim.src.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["claim", "src"], message: "a rating needs at least one source URL" });
  }
}

export const budgetSchema = z
  .object({
    tier: budgetTierSchema,
    /** Why this tier, against the BUDGET_SCALE in ratings.ts. */
    why: nonEmpty,
    build_needs: nonEmpty,
    claim: claimSchema,
  })
  .strict()
  .superRefine((budget, ctx) => requireSourceWhenRated(true, budget.claim, ctx));

export const ratingSchema = z
  .object({
    /** 1 (easiest) to 5; null when the sources do not support a step — never a guess. */
    value: z.number().int().min(RATING_MIN).max(RATING_MAX).nullable(),
    /** One sentence: the sourced fact that puts the strategy on this step of the scale. */
    why: nonEmpty,
    claim: claimSchema,
  })
  .strict()
  .superRefine((rating, ctx) => requireSourceWhenRated(rating.value !== null, rating.claim, ctx));

export const ratingsSchema = z
  .object({
    build: ratingSchema,
    complexity: ratingSchema,
  })
  .strict();

/**
 * Why the strategy keeps working until a nerf: the game mechanic behind it (cited), and what would
 * end it. A strategy whose only reason is a temporary market gap has no line to write here and does
 * not belong in the KB.
 */
export const durabilitySchema = z
  .object({
    why_it_works: nonEmpty,
    breaks_when: z.array(nonEmpty).min(1),
    claim: claimSchema,
  })
  .strict()
  .superRefine((durability, ctx) => requireSourceWhenRated(true, durability.claim, ctx));

export const patchStampSchema = z
  .object({
    verified_against: nonEmpty,
    leagues: z.array(nonEmpty).min(1),
    stamped_at: z.string().regex(DATE_PATTERN),
  })
  .strict();

export const measuredSchema = z
  .object({
    div_per_hour_p50: z.number().positive().nullable(),
    n_sessions: z.number().int().min(0),
  })
  .strict();

export const farmStrategySchema = z
  .object({
    schema_version: z.literal(STRATEGY_SCHEMA_VERSION),
    kind: z.literal("farm"),
    id: z.string().regex(STRATEGY_ID_PATTERN),
    title: nonEmpty,
    summary: nonEmpty,
    mechanics: z.array(mechanicSchema).min(1),
    patch: patchStampSchema,
    status: z.enum(STRATEGY_STATUSES),
    budget: budgetSchema,
    ratings: ratingsSchema,
    durability: durabilitySchema,
    yields: z.array(yieldSchema).min(1),
    atlas_master: atlasMasterSchema,
    atlas_passives: z.array(atlasPassiveSchema),
    tablets: z.array(tabletSchema),
    waystone: waystoneSchema,
    steps: z.array(nonEmpty).min(1),
    risks: z.array(nonEmpty),
    measured: measuredSchema.nullable(),
  })
  .strict();

/** What gets rolled: the trade2 base (so a search link finds it) and the rarities the method uses. */
export const rollTargetSchema = z
  .object({
    base: nonEmpty,
    rarity: z.array(z.enum(ITEM_RARITIES)).min(1),
    claim: claimSchema,
  })
  .strict();

export const rollStepSchema = z
  .object({
    action: nonEmpty,
    /** Currency the step spends, drawn as art with its live price; empty when it spends none. */
    currencies: z.array(entityRefSchema),
    claim: claimSchema,
  })
  .strict();

/** Why buyers want the rolled item. A price a creator quoted belongs here as a dated claim, never as our number. */
export const demandSchema = z
  .object({
    why: nonEmpty,
    claim: claimSchema,
  })
  .strict();

export const conversionLegSchema = z
  .object({
    ref: entityRefSchema,
    qty: z.number().int().min(1),
  })
  .strict();

/**
 * One deterministic conversion (3 × X → 1 × Y) whose every leg is a catalog item the app can
 * price: the board computes its EV live, and names the unpriced leg otherwise. A random outcome is
 * never a conversion; it stays a graded output leg without EV.
 */
export const conversionSchema = z
  .object({
    inputs: z.array(conversionLegSchema).min(1),
    outputs: z.array(conversionLegSchema).min(1),
    claim: claimSchema,
  })
  .strict();

/** One thing a trade method takes or gives, in words; `ref` when it is a catalog item the app can draw and price. */
export const tradeLegSchema = z
  .object({
    text: nonEmpty,
    ref: entityRefSchema.nullable(),
    claim: claimSchema,
  })
  .strict();

/**
 * How a method's outcome is decided. `loss_chance` is the share of attempts that destroy the
 * input (0 for a deterministic recipe); null when no source puts a number on it. Community odds
 * are graded as community (ss/vs/uv), never vp.
 */
export const oddsSchema = z
  .object({
    text: nonEmpty,
    loss_chance: z.number().min(0).max(1).nullable(),
    claim: claimSchema,
  })
  .strict();

export const rollAndSellStrategySchema = z
  .object({
    schema_version: z.literal(STRATEGY_SCHEMA_VERSION),
    kind: z.literal("roll_and_sell"),
    id: z.string().regex(STRATEGY_ID_PATTERN),
    title: nonEmpty,
    summary: nonEmpty,
    mechanics: z.array(mechanicSchema),
    patch: patchStampSchema,
    status: z.enum(STRATEGY_STATUSES),
    budget: budgetSchema,
    ratings: ratingsSchema,
    durability: durabilitySchema,
    target: rollTargetSchema,
    target_mods: z.array(tabletModSchema),
    roll_steps: z.array(rollStepSchema).min(1),
    sell_unit: z.enum(SELL_UNITS),
    /** The item sold when it trades on the exchange (priced live); null for a rolled tablet. */
    sell_ref: entityRefSchema.nullable(),
    price_refs: z.array(conversionSchema),
    demand: demandSchema,
    risks: z.array(nonEmpty),
  })
  .strict();

export const tradeStrategySchema = z
  .object({
    schema_version: z.literal(STRATEGY_SCHEMA_VERSION),
    kind: z.literal("trade"),
    id: z.string().regex(STRATEGY_ID_PATTERN),
    title: nonEmpty,
    summary: nonEmpty,
    mechanics: z.array(mechanicSchema),
    patch: patchStampSchema,
    status: z.enum(STRATEGY_STATUSES),
    budget: budgetSchema,
    ratings: ratingsSchema,
    durability: durabilitySchema,
    inputs: z.array(tradeLegSchema).min(1),
    outputs: z.array(tradeLegSchema).min(1),
    odds: oddsSchema,
    price_refs: z.array(conversionSchema),
    steps: z.array(nonEmpty).min(1),
    risks: z.array(nonEmpty),
  })
  .strict();

export const strategySchema = z.discriminatedUnion("kind", [farmStrategySchema, rollAndSellStrategySchema, tradeStrategySchema]);

export type EntityRef = z.infer<typeof entityRefSchema>;
export type StrategyYield = z.infer<typeof yieldSchema>;
export type AtlasMaster = z.infer<typeof atlasMasterSchema>;
export type AtlasPassive = z.infer<typeof atlasPassiveSchema>;
export type Tablet = z.infer<typeof tabletSchema>;
export type TabletMod = z.infer<typeof tabletModSchema>;
export type FarmStrategy = z.infer<typeof farmStrategySchema>;
export type RollAndSellStrategy = z.infer<typeof rollAndSellStrategySchema>;
export type TradeStrategy = z.infer<typeof tradeStrategySchema>;
export type Strategy = z.infer<typeof strategySchema>;
export type Conversion = z.infer<typeof conversionSchema>;
export type TradeLeg = z.infer<typeof tradeLegSchema>;
export type StrategyRating = z.infer<typeof ratingSchema>;
export type Durability = z.infer<typeof durabilitySchema>;
export type RatingKey = keyof FarmStrategy["ratings"];
export type MasterId = FarmStrategy["atlas_master"]["master"];
export type WaystoneTotal = (typeof WAYSTONE_TOTALS)[number];
export type ItemRarity = (typeof ITEM_RARITIES)[number];
export type SellUnit = (typeof SELL_UNITS)[number];

const conversionRefs = (list: readonly Conversion[]): EntityRef[] => list.flatMap((c) => [...c.inputs, ...c.outputs].map((leg) => leg.ref));
const legRefs = (list: readonly TradeLeg[]): EntityRef[] => list.flatMap((leg) => (leg.ref ? [leg.ref] : []));

/** Every catalog ref a strategy names (yields, roll currencies, legs, conversions): the loader checks them and the board prices them. */
export function strategyRefs(strategy: Strategy): EntityRef[] {
  switch (strategy.kind) {
    case "farm":
      return strategy.yields.map((y) => y.ref);
    case "roll_and_sell":
      return [...strategy.roll_steps.flatMap((s) => s.currencies), ...(strategy.sell_ref ? [strategy.sell_ref] : []), ...conversionRefs(strategy.price_refs)];
    case "trade":
      return [...legRefs(strategy.inputs), ...legRefs(strategy.outputs), ...conversionRefs(strategy.price_refs)];
  }
}

