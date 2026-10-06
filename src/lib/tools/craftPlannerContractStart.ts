import { z } from "zod";

/**
 * Planner request/response parts for mod pools ("any k of these n mods") and the start choice
 * (a clean base, or a base the player buys that already carries wanted mods). Client-safe, split
 * from craftPlannerContract.ts to keep both files small.
 */

const sideSchema = z.enum(["prefix", "suffix"]);

/** At most this many candidates in one pool (the picker's chips). */
export const MAX_POOL_CANDIDATES = 8;

export const poolCandidateSchema = z.object({
  family: z.string().trim().min(1).max(120),
  /** The minimum tier accepted for this candidate (its catalog mod id); better tiers count too. */
  minModId: z.string().trim().min(1).max(160),
});
export type PoolCandidateInput = z.infer<typeof poolCandidateSchema>;

/** "Any `need` of these candidates" on one side: every combination of them is fine. */
export const targetGroupSchema = z
  .object({
    side: sideSchema,
    candidates: z.array(poolCandidateSchema).min(2, "a pool needs at least two mods").max(MAX_POOL_CANDIDATES),
    need: z.number().int().min(1).max(4),
  })
  .refine((g) => g.need <= g.candidates.length, "a pool can't need more mods than it holds")
  .refine((g) => new Set(g.candidates.map((c) => c.family)).size === g.candidates.length, "the same mod is in a pool twice");
export type TargetGroupInput = z.infer<typeof targetGroupSchema>;

/**
 * One wanted mod the bought base already carries. `ref` indexes the plan's target slots: the
 * request's targets first, then each pool's `need` slots in order (a carried pool slot = any one
 * of that pool's candidates).
 */
export const carriedSchema = z.object({ ref: z.number().int().nonnegative(), fractured: z.boolean() });
export type CarriedInput = z.infer<typeof carriedSchema>;

/**
 * Where the plan starts. "clean": a Normal base (or a fractured non-target anchor). "bought": a base
 * the player buys carrying wanted mods — never assumed silently; `carried: null` lets the planner
 * pick which one mod the base carries fractured. `askDiv` is the player's price for that base.
 */
export const planStartSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("clean") }),
  z.object({
    kind: z.literal("bought"),
    carried: z.array(carriedSchema).min(1).max(2).nullable(),
    askDiv: z.number().positive().max(100_000).nullable(),
  }),
]);
export type PlanStartInput = z.infer<typeof planStartSchema>;

const bandSchema = z.object({ point: z.number().nonnegative(), low: z.number().nonnegative(), high: z.number().nonnegative() });

/** The start the plan uses, as the response reports it. */
export const startViewSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("clean") }),
  z.object({
    kind: z.literal("bought"),
    rarity: z.enum(["Magic", "Rare"]),
    /** The mods on the bought base: the slot they fill, fractured or not, and the text to buy. */
    carried: z.array(z.object({ ref: z.number().int().nonnegative(), fractured: z.boolean(), modIds: z.array(z.string()).min(1), text: z.string() })),
    askDiv: z.number().positive().nullable(),
    /** Bases bought on average (a later step that restarts on a new base buys more). */
    buys: bandSchema,
  }),
]);
export type StartView = z.infer<typeof startViewSchema>;

/** POST /api/tools/craft-planner/base-link: a prefilled trade search for the base to buy. */
export const baseLinkRequestSchema = z.object({
  itemClass: z.enum(["Rings", "Amulets", "Belts", "Jewels"]),
  base: z.string().trim().min(1).max(80),
  ilvl: z.number().int().min(1).max(100),
  rarity: z.enum(["Magic", "Rare"]),
  carried: z
    .array(z.object({ modIds: z.array(z.string().trim().min(1).max(160)).min(1).max(MAX_POOL_CANDIDATES), fractured: z.boolean() }))
    .min(1)
    .max(2),
});
export type BaseLinkRequest = z.infer<typeof baseLinkRequestSchema>;

export const baseLinkResponseSchema = z.object({
  url: z.string().url(),
  /** Mod texts the trade site has no stat for: the search leaves them out, the player checks by eye. */
  unmatched: z.array(z.string()),
});
export type BaseLinkResponse = z.infer<typeof baseLinkResponseSchema>;
