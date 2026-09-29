import { z } from "zod";

/**
 * POST /api/tools/craft-moves and POST /api/tools/craft-moves/value. Shared by the routes and the
 * Craft moves panel, so a server-side shape change fails the client parse loudly instead of
 * rendering blanks. Client-safe: no server imports.
 */

export const CRAFT_MOVES_MAX_TEXT = 8000;

/** The rules were verified against 0.5.x; after 1.0 ships they must be re-verified before trusted. */
export const RULES_PATCH = "0.5.x";
export const RULES_REVERIFY_AFTER = "2026-12-11";

export const craftMovesRequestSchema = z.object({
  text: z.string().trim().min(1, "paste an item (Ctrl+C in game)").max(CRAFT_MOVES_MAX_TEXT, `item text is over ${CRAFT_MOVES_MAX_TEXT} characters`),
});
export type CraftMovesRequest = z.infer<typeof craftMovesRequestSchema>;

/**
 * POST /api/tools/craft-moves/value. `targetLine` (a move card's aimed-at mod, as the catalog words
 * it) values the OUTCOME instead: the pasted item plus that one mod, at its lowest roll.
 */
export const craftValueRequestSchema = craftMovesRequestSchema.extend({
  targetLine: z.string().trim().min(1).max(300, "target mod line is over 300 characters").optional(),
});
export type CraftValueRequest = z.infer<typeof craftValueRequestSchema>;

const sideSchema = z.enum(["prefix", "suffix"]);

export const affixSchema = z.object({
  lines: z.array(z.string()),
  kind: z.enum(["explicit", "crafted", "fractured", "desecrated"]),
  side: sideSchema.nullable(),
  family: z.string().nullable(),
  modId: z.string().nullable(),
  level: z.number().nullable(),
  tier: z.object({ rank: z.number().int(), of: z.number().int() }).nullable(),
  unrevealed: z.boolean(),
  note: z.string().nullable(),
});
export type AffixView = z.infer<typeof affixSchema>;

export const itemStateSchema = z.object({
  rarity: z.string(),
  itemClass: z.string().nullable(),
  baseType: z.string().nullable(),
  ilvl: z.number().nullable(),
  quality: z.number().nullable(),
  corrupted: z.boolean(),
  mirrored: z.boolean(),
  unidentified: z.boolean(),
  jewel: z.boolean(),
  timeLost: z.boolean(),
  affixes: z.array(affixSchema),
  prefixes: z.number().int(),
  suffixes: z.number().int(),
  capacity: z.object({ p: z.number(), s: z.number(), total: z.number() }).nullable(),
  openPrefixes: z.number().nullable(),
  openSuffixes: z.number().nullable(),
  openTotal: z.number().nullable(),
  slots: z.object({ crafted: z.number(), desecrated: z.number(), fractured: z.number(), unrevealed: z.number() }),
  unmatched: z.array(z.string()),
  flags: z.array(z.object({ code: z.string(), message: z.string() })),
});
export type ItemStateView = z.infer<typeof itemStateSchema>;

export const MOVE_FAMILY_ORDER = ["currency", "omen", "bone", "essence", "catalyst", "liquid"] as const;
const familySchema = z.enum(MOVE_FAMILY_ORDER);
export type MoveFamilyView = z.infer<typeof familySchema>;

const pricedMaterialSchema = z.object({
  key: z.string(),
  label: z.string(),
  ninjaId: z.string().nullable(),
  qty: z.number(),
  unitDiv: z.number().nullable(),
  totalDiv: z.number().nullable(),
  icon: z.string().nullable(),
  ageMin: z.number().nullable(),
});

export const pricedMoveSchema = z.object({
  id: z.string(),
  label: z.string(),
  family: familySchema,
  materials: z.array(pricedMaterialSchema),
  requires: z.string(),
  effect: z.string(),
  warnings: z.array(z.string()),
  notes: z.array(z.string()),
  floor: z.number().nullable(),
  source: z.string(),
  verified: z.boolean(),
  totalDiv: z.number().nullable(),
  totalEx: z.number().nullable(),
});
export type PricedMoveView = z.infer<typeof pricedMoveSchema>;

export const blockedMoveSchema = z.object({
  id: z.string(),
  label: z.string(),
  family: familySchema,
  reason: z.string(),
  source: z.string(),
  verified: z.boolean(),
});
export type BlockedMoveView = z.infer<typeof blockedMoveSchema>;

const tierRefSchema = z.object({ modId: z.string(), level: z.number(), rank: z.number().int(), text: z.string() });

export const familyGateSchema = z.object({
  family: z.string(),
  side: sideSchema,
  tiers: z.number().int(),
  reachable: z.number().int(),
  topReachable: tierRefSchema.nullable(),
  best: tierRefSchema,
  present: z.boolean(),
  floors: z.array(z.object({ currency: z.string(), floor: z.number(), cutTiers: z.number().int(), softFloor: z.boolean() })),
  kbRow: z.string().nullable(),
});
export type FamilyGateView = z.infer<typeof familyGateSchema>;

export const bookValueSchema = z.object({
  valueDiv: z.number().nullable(),
  minDiv: z.number().nullable(),
  samples: z.number().int(),
  resolvedMods: z.number().int(),
});

export const oddsLinkSchema = z.object({ label: z.string(), url: z.string().url() });

/** One "next best move" card (core/tools/craftmoves/rank.ts): deterministic order, never odds. */
export const rankedMoveSchema = z.object({
  move: pricedMoveSchema,
  /** 1 = fills an open slot on the aimed side, 2 = adds a random mod, 3 = frees a slot. */
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** The not-yet-present family worth aiming at with this move; null for removals. */
  targetFamily: familyGateSchema.nullable(),
  why: z.string(),
});
export type RankedMoveView = z.infer<typeof rankedMoveSchema>;

export const craftMovesResponseSchema = z.object({
  league: z.string(),
  state: itemStateSchema,
  locked: z.string().nullable(),
  moves: z.array(pricedMoveSchema),
  /** Top three of `moves` for the cards; empty when the item is locked or nothing qualifies. */
  ranked: z.array(rankedMoveSchema).max(3),
  blocked: z.array(blockedMoveSchema),
  gates: z.array(familyGateSchema),
  patch: z.object({ rules: z.string(), data: z.string(), repoe: z.string(), reverifyAfter: z.string() }),
  bookValue: bookValueSchema.nullable(),
  /** Why the book value could not be computed (the trade2 stat catalog was unreachable), else null. */
  bookError: z.string().nullable(),
  rates: z.object({ exaltPerDivine: z.number().nullable(), source: z.string().nullable() }),
  odds: z.array(oddsLinkSchema),
});
export type CraftMovesResponse = z.infer<typeof craftMovesResponseSchema>;

export const craftValueResponseSchema = z.object({
  valueDiv: z.number().nullable(),
  minDiv: z.number().nullable(),
  samples: z.number().int(),
  dropped: z.number().int(),
  unrated: z.number().int(),
  total: z.number().int(),
  searchUrl: z.string(),
  searchedStats: z.number().int(),
  /** The synthetic mod line that was added before searching, when an outcome was valued. */
  targetLine: z.string().nullable(),
});
export type CraftValueResponse = z.infer<typeof craftValueResponseSchema>;

export const apiErrorSchema = z.object({ error: z.string(), retryAfterSec: z.number().optional() });

/** Past the re-verify date the rules are presumed stale (1.0 lands 2026-12-11). */
export function rulesStale(now: Date = new Date()): boolean {
  return now.getTime() > Date.parse(`${RULES_REVERIFY_AFTER}T23:59:59Z`);
}
