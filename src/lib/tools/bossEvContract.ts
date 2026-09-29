import { z } from "zod";
import { confidenceSchema, rarityLabelSchema, rateSchema, sourceSchema, unmodelledEntrySchema } from "../../core/tools/bossEv/schema";

/**
 * Per-boss evaluation shapes (entry, loot, tier metrics). GET /api/farm (src/lib/farmContract.ts)
 * embeds them, so a server-side shape change fails the client parse loudly instead of rendering
 * blanks. All money is Divine.
 */

export const priceSourceSchema = z.enum(["ninja", "scout", "manual"]);
export type PriceSource = z.infer<typeof priceSourceSchema>;

/** A price with its provenance: every number the tool shows carries source and age. */
export const resolvedPriceSchema = z.object({
  div: z.number(),
  source: priceSourceSchema,
  ageHours: z.number().nullable(),
});
export type ResolvedPrice = z.infer<typeof resolvedPriceSchema>;

const craftPartViewSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  qty: z.number(),
  price: resolvedPriceSchema.nullable(),
});

export const entryLineViewSchema = z.object({
  itemId: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  qty: z.number(),
  unitPrice: resolvedPriceSchema.nullable(),
  buyDiv: z.number().nullable(),
  /** null when there is no recipe, or any recipe part is unpriced. */
  craftDiv: z.number().nullable(),
  craftParts: z.array(craftPartViewSchema),
  costDiv: z.number().nullable(),
  route: z.enum(["buy", "craft"]).nullable(),
  /** poe.ninja traded volume of the entry item; null when ninja does not list it. */
  volume: z.number().nullable(),
});
export type EntryLineView = z.infer<typeof entryLineViewSchema>;

/** A pool line's spread; single numbers (EV, floor) use minDiv. */
export const poolRangeSchema = z.object({
  minDiv: z.number(),
  medianDiv: z.number(),
  maxDiv: z.number(),
  /** Members ninja prices, out of `total`. */
  priced: z.number().int(),
  total: z.number().int(),
  unpricedMembers: z.array(z.string()),
  /** Oldest priced member's age. */
  ageHours: z.number().nullable(),
});
export type PoolRange = z.infer<typeof poolRangeSchema>;

export const lootLineViewSchema = z.object({
  name: z.string(),
  /** ninja art, else the curated poecdn art (boss-art.json); null when neither has one. */
  icon: z.string().nullable(),
  priceKind: z.enum(["ninja", "pool", "scout", "manual", "unpriced"]),
  pool: poolRangeSchema.nullable(),
  /** A qualitative rarity label with its own source, when one is curated. */
  rarity: rarityLabelSchema.nullable(),
  /** Why the line has no price, when it has none. */
  unpricedReason: z.string().nullable(),
  price: resolvedPriceSchema.nullable(),
  rate: rateSchema,
  confidence: confidenceSchema,
  source: sourceSchema,
  /** Per-kill contribution, a range rate at its low end; null for unknown rate or no price. */
  evDiv: z.number().nullable(),
  evLowDiv: z.number().nullable(),
  evHighDiv: z.number().nullable(),
  /** A Lineage support gem (priced from poe2scout's lineage list). */
  lineage: z.boolean(),
});
export type LootLineView = z.infer<typeof lootLineViewSchema>;

export const breakEvenSchema = z.object({
  name: z.string(),
  priceDiv: z.number(),
  /** entry / price: the drop rate at which this item ALONE repays the entry. */
  pStar: z.number(),
  /** (entry − guaranteed-drop value) / price, floored at 0: what the item must cover on top of the sure loot. */
  pStarNet: z.number(),
  rate: rateSchema,
  confidence: confidenceSchema,
});
export type BreakEven = z.infer<typeof breakEvenSchema>;

export const jackpotSchema = z.object({
  /** Items priced at or above the entry cost. */
  items: z.array(z.string()),
  /** P(at least one per kill), range lines at their low end — the conservative reading. Treats
   *  drops as independent rolls, which UNDERstates it when they share a one-of-N pool (Σp ≥ 1 − Π(1 − p)). */
  p: z.number(),
  /** Same with range lines at their high end. */
  pHigh: z.number(),
  killsToFirst: z.number().nullable(),
  /** Jackpot items whose rate is unknown, so p understates by an unknown amount. */
  unknownRateCount: z.number().int(),
});
export type Jackpot = z.infer<typeof jackpotSchema>;

export const floorDropSchema = z.object({ name: z.string(), evDiv: z.number(), rate: rateSchema });
export type FloorDrop = z.infer<typeof floorDropSchema>;

export const tierResultSchema = z.object({
  tierId: z.string(),
  label: z.string(),
  entryDiv: z.number(),
  /** false when any entry line is unpriced — entryDiv is then a lower bound. */
  entryComplete: z.boolean(),
  entryLines: z.array(entryLineViewSchema),
  /** A real cost of the attempt the tool cannot price; when set, net is an upper bound. */
  unmodelledEntry: unmodelledEntrySchema.nullable(),
  loot: z.array(lootLineViewSchema),
  guaranteedDiv: z.number(),
  /** Conservative EV: range rates at their low end (so evDiv === evLowDiv). */
  evDiv: z.number(),
  evLowDiv: z.number(),
  evHighDiv: z.number(),
  /** evDiv − entryDiv; an upper bound when !entryComplete. */
  netDiv: z.number(),
  /** evDiv / entryDiv; an upper bound when !entryComplete. */
  evPerDivSpent: z.number().nullable(),
  jackpot: jackpotSchema,
  breakEven: z.array(breakEvenSchema),
  unpriced: z.array(z.string()),
  /** How many of `unpriced` are Lineage gems — shown apart, they are the usual scout gap. */
  unpricedLineage: z.number().int(),
  unknownRate: z.array(z.string()),
  /** Priced value that lands on most kills: guaranteed lines plus lines at least 1 in 10 (low end). */
  floorDiv: z.number(),
  /** The priced lines floorDiv sums, for its tooltip. */
  floorDrops: z.array(floorDropSchema),
  /** Priced EV from drops rarer than 1 in 10 (high end below 10%) — the lottery part. */
  chaseDiv: z.number(),
  /** 1 / Σp over the rare (< 1 in 10) lines with a known rate; null when none has one. */
  chaseOneIn: z.number().nullable(),
  /**
   * P(a kill drops nothing covering the entry beyond the guaranteed loot), independent rolls, range
   * rates at their low end, unknown rates counted as 0 (so it overstates the risk); null when the
   * entry is partly unpriced.
   */
  pLosingRun: z.number().nullable(),
  /** Entry-covering lines whose rate is unknown — pLosingRun counts them as never dropping. */
  losingRunUnknownRates: z.number().int(),
  /** Weakest confidence behind pLosingRun (a 0% from one guide's "guaranteed" is single-source). */
  losingRunConfidence: confidenceSchema.nullable(),
  /** poe.ninja volume of the priciest entry item: can you actually buy in. */
  entryVolume: z.number().nullable(),
  varianceNote: z.string(),
});
export type TierResult = z.infer<typeof tierResultSchema>;

export const bossViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  mechanic: z.string(),
  accessChain: z.string(),
  icon: z.string().nullable(),
  sources: z.array(sourceSchema),
  tiers: z.array(tierResultSchema).min(1),
});
export type BossView = z.infer<typeof bossViewSchema>;
