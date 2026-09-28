import { z } from "zod";
import { confidenceSchema, rateSchema, sourceSchema } from "../../core/tools/bossEv/schema";

/**
 * GET /api/tools/boss-ev. Shared by the route and the Boss EV panel so a server-side shape change
 * fails the client parse loudly instead of rendering blanks. All money is Divine.
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
});
export type EntryLineView = z.infer<typeof entryLineViewSchema>;

export const lootLineViewSchema = z.object({
  name: z.string(),
  priceKind: z.enum(["ninja", "scout", "manual", "unpriced"]),
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
   *  drops as independent rolls, which overstates it when they share an exclusive pool. */
  p: z.number(),
  /** Same with range lines at their high end. */
  pHigh: z.number(),
  killsToFirst: z.number().nullable(),
  /** Jackpot items whose rate is unknown, so p understates by an unknown amount. */
  unknownRateCount: z.number().int(),
});
export type Jackpot = z.infer<typeof jackpotSchema>;

export const tierResultSchema = z.object({
  tierId: z.string(),
  label: z.string(),
  entryDiv: z.number(),
  /** false when any entry line is unpriced — entryDiv is then a lower bound. */
  entryComplete: z.boolean(),
  entryLines: z.array(entryLineViewSchema),
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
  unknownRate: z.array(z.string()),
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

export const bossEvRatesSchema = z.object({
  exaltPerDivine: z.number(),
  chaosPerDivine: z.number(),
  source: z.enum(["cx", "ninja", "scout"]),
  fetchedAt: z.string().nullable(),
});

export const bossEvResponseSchema = z.object({
  computedLeague: z.string(),
  dataAsOf: z.string(),
  patch: z.string(),
  patchWarning: z.string().nullable(),
  rates: bossEvRatesSchema.nullable(),
  pricesFetchedAt: z.string().nullable(),
  scoutAgeHours: z.number().nullable(),
  bosses: z.array(bossViewSchema),
});
export type BossEvResponse = z.infer<typeof bossEvResponseSchema>;
