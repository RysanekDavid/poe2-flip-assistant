/*
 * The strategy knowledge base: one curated JSON file per farm strategy under
 * src/data/poe2/strategies/<id>.json — which Atlas Master nodes, atlas notables, tablets and
 * waystone totals a mechanic wants, and what the basket sells. Every fact carries a claim grade so
 * the UI and the Coach can tell a datamined fact from a lead. Keys are snake_case because the
 * Python Coach reads the same files (services/coach/src/strategies/models.py mirrors this schema;
 * tests/test_engine_drift.py pins the keys). Object shapes are written `z\n  .object({` with
 * 4-space keys on purpose: that drift test parses them.
 */
import { z } from "zod";
import { claimSchema } from "../../lib/claim";
import { ENTITY_ID_PATTERN, POE2DB_URL_PATTERN } from "../entities/schema";

export const STRATEGY_SCHEMA_VERSION = 1;

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

export const STRATEGY_ID_PATTERN = ENTITY_ID_PATTERN;
/** Only explicit tablet stats: a pseudo or implicit id would search for the wrong thing. */
export const TRADE_STAT_ID_PATTERN = /^explicit\.stat_\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

export const budgetSchema = z
  .object({
    tier: budgetTierSchema,
    build_needs: nonEmpty,
    claim: claimSchema,
  })
  .strict();

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
    id: z.string().regex(STRATEGY_ID_PATTERN),
    title: nonEmpty,
    summary: nonEmpty,
    mechanics: z.array(mechanicSchema).min(1),
    patch: patchStampSchema,
    status: z.enum(STRATEGY_STATUSES),
    budget: budgetSchema,
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

export type EntityRef = z.infer<typeof entityRefSchema>;
export type StrategyYield = z.infer<typeof yieldSchema>;
export type AtlasMaster = z.infer<typeof atlasMasterSchema>;
export type AtlasPassive = z.infer<typeof atlasPassiveSchema>;
export type Tablet = z.infer<typeof tabletSchema>;
export type TabletMod = z.infer<typeof tabletModSchema>;
export type FarmStrategy = z.infer<typeof farmStrategySchema>;
export type MasterId = FarmStrategy["atlas_master"]["master"];
export type WaystoneTotal = (typeof WAYSTONE_TOTALS)[number];
