import { z } from "zod";
import { familyGateSchema } from "./craftMovesContract";

/**
 * GET /api/tools/mod-pool and POST /api/tools/mod-pool/value. Shared by the routes and the Mod pool
 * panel so a server-side shape change fails the client parse loudly. Client-safe: no server imports.
 *
 * Every Div figure is nullable: null means "no market signal", never 0.
 */

export const MOD_POOL_RARITIES = ["Normal", "Magic", "Rare"] as const;
export type ModPoolRarity = (typeof MOD_POOL_RARITIES)[number];

const nameField = (what: string) => z.string().trim().min(1, `pick a ${what}`).max(80, `${what} name is over 80 characters`);

export const modPoolQuerySchema = z.object({
  itemClass: nameField("item class"),
  base: nameField("base"),
  ilvl: z.coerce.number().int("item level is a whole number").min(1, "item level is at least 1").max(100, "item level is at most 100"),
  rarity: z.enum(MOD_POOL_RARITIES),
});
export type ModPoolQuery = z.infer<typeof modPoolQuerySchema>;

export const modValueRequestSchema = z.object({
  itemClass: nameField("item class"),
  base: nameField("base"),
  ilvl: z.number().int().min(1).max(100),
  family: z.string().trim().min(1).max(120),
  side: z.enum(["prefix", "suffix"]),
});
export type ModValueRequest = z.infer<typeof modValueRequestSchema>;

const divSchema = z.number().positive().nullable();

/** One live comparable search for "rare <base> carrying this stat at ≥ minRoll" — shared, cached. */
export const modLiveValueSchema = z.object({
  valueDiv: divSchema,
  minDiv: divSchema,
  samples: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  searchUrl: z.string().url().nullable(),
  /** ms epoch of the search; the cache serves it for `cacheHours`. */
  checkedAt: z.number().int().nonnegative(),
});
export type ModLiveValue = z.infer<typeof modLiveValueSchema>;

/** The price-book signal: recorded asks of items on this base whose signature carries the stat. */
export const bookSignalSchema = z.object({
  valueDiv: divSchema,
  minDiv: divSchema,
  samples: z.number().int().nonnegative(),
  /** Trimmed median vs the base-wide book median, in %; null when either side has no value. */
  upliftPct: z.number().nullable(),
  /** The book signs this stat under its pseudo total (e.g. total elemental resistance). */
  viaPseudo: z.boolean(),
});
export type BookSignalView = z.infer<typeof bookSignalSchema>;

/**
 * Why a row has no book signal: no tier rolls at this ilvl, the line has no trade stat, the book
 * never signs that stat (a pseudo source whose total the catalog lacks), or the catalog was offline.
 */
export const BOOK_MISSING = ["no-tier", "unresolved", "not-signed", "unavailable"] as const;
export const bookMissingSchema = z.enum(BOOK_MISSING).nullable();
export type BookMissing = (typeof BOOK_MISSING)[number];

export const modSearchSchema = z.object({
  /** First line of the top tier reachable at this item level, as the catalog words it. */
  line: z.string(),
  /** How many lines the tier has; >1 = hybrid, searched on its first line only. */
  lines: z.number().int().positive(),
  partial: z.boolean(),
  /** Trade stat the first line resolves to; null when unresolved (or the catalog was unreachable). */
  statId: z.string().nullable(),
  /** The tier's lowest roll on that line (average for "Adds # to #"); null = presence-only. */
  minRoll: z.number().nullable(),
});
export type ModSearchView = z.infer<typeof modSearchSchema>;

export const modPoolRowSchema = familyGateSchema.extend({
  /** null when no tier of this family rolls at the chosen item level. */
  search: modSearchSchema.nullable(),
  book: bookSignalSchema.nullable(),
  bookMissing: bookMissingSchema,
  /** Fresh shared cache hit, if any; otherwise the panel offers "value live · 1 search". */
  live: modLiveValueSchema.nullable(),
  /** Prefilled trade search for the same query the live value runs; null when the stat is unresolved. */
  tradeUrl: z.string().url().nullable(),
});
export type ModPoolRow = z.infer<typeof modPoolRowSchema>;

export const modPoolResponseSchema = z.object({
  kind: z.literal("pool"),
  league: z.string(),
  itemClass: z.string(),
  base: z.string(),
  /** Another released base shares this name with different tags: the pool is a best guess. */
  ambiguous: z.boolean(),
  ilvl: z.number().int(),
  rarity: z.enum(MOD_POOL_RARITIES),
  rows: z.array(modPoolRowSchema),
  coverage: z.object({
    families: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    withSamples: z.number().int().nonnegative(),
  }),
  /** Base-wide book median every uplift is measured against. */
  baseline: z.object({ valueDiv: divSchema, samples: z.number().int().nonnegative() }),
  /** The trade2 stat catalog could not be read: no row resolves, book and live are unavailable. */
  bookError: z.string().nullable(),
  cacheHours: z.number().positive(),
  exaltPerDivine: z.number().positive().nullable(),
  patch: z.object({ data: z.string(), repoe: z.string() }),
});
export type ModPoolResponse = z.infer<typeof modPoolResponseSchema>;

export const poolBaseSchema = z.object({ name: z.string(), ambiguous: z.boolean() });
export const poolClassSchema = z.object({ itemClass: z.string(), bases: z.array(poolBaseSchema).min(1) });
export type PoolClassView = z.infer<typeof poolClassSchema>;

export const modPoolCatalogSchema = z.object({ kind: z.literal("catalog"), classes: z.array(poolClassSchema) });
export type ModPoolCatalog = z.infer<typeof modPoolCatalogSchema>;

export const modPoolGetResponseSchema = z.discriminatedUnion("kind", [modPoolCatalogSchema, modPoolResponseSchema]);

export const modValueResponseSchema = z.object({
  family: z.string(),
  side: z.enum(["prefix", "suffix"]),
  live: modLiveValueSchema,
  /** Served from the shared cache: no trade2 request was made. */
  cached: z.boolean(),
});
export type ModValueResponse = z.infer<typeof modValueResponseSchema>;

export const MOD_POOL_LEGEND =
  "Signals are asks for rare items carrying this mod on this base, not the mod's own price. Book = recorded asks " +
  "(0 searches); Live = one trade search on click, shared with everyone for the cache window. Hybrid mods are " +
  "searched on their first line (partial). Floors: tiers each verified currency cannot roll.";
