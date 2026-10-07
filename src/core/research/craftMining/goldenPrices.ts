/*
 * The price snapshot craft:eval prices both sides with
 * (docs/research/craft-mining/golden/prices.snapshot.json). Committed, so a scoreboard is
 * reproducible and the --check gate compares like with like; refreshed by `npm run
 * craft:eval:prices` from the app's own poe.ninja client (never an RMT source).
 */
import { z } from "zod";
import { PLANNER_MATERIAL_IDS } from "../../tools/planner/materialIds";

export const PRICE_SNAPSHOT_VERSION = 1;

const KNOWN_IDS = new Set(PLANNER_MATERIAL_IDS);

export const priceSnapshotSchema = z
  .object({
    schema_version: z.literal(PRICE_SNAPSHOT_VERSION),
    league: z.string().min(1),
    /** When the source was read (ISO 8601). */
    fetchedAt: z.string().datetime(),
    /** Where the numbers come from, in words a reviewer can check. */
    source: z.string().min(1),
    /** Exalted Orbs per Divine, from the same source; null when it did not list the Exalted Orb. */
    exaltPerDivine: z.number().positive().nullable(),
    /** Planner material id → Divine per unit. */
    prices: z.record(z.string(), z.number().positive()),
    /** Planner materials the source did not price (the planner then reports them unpriced). */
    unpriced: z.array(z.string()),
  })
  .strict()
  .superRefine((s, ctx) => {
    const ids = [...Object.keys(s.prices), ...s.unpriced];
    const stray = ids.filter((id) => !KNOWN_IDS.has(id));
    if (stray.length > 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["prices"], message: `not planner material ids: ${stray.join(", ")}` });
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["unpriced"], message: "a material is both priced and unpriced" });
  });
export type PriceSnapshot = z.infer<typeof priceSnapshotSchema>;

/** The planner's price map (PlanDeps.prices). */
export const plannerPrices = (s: PriceSnapshot): Map<string, number> => new Map(Object.entries(s.prices));

/**
 * A snapshot from source rows (id → Divine per unit). Only planner materials are kept; a missing,
 * zero or non-finite price is listed as unpriced rather than guessed.
 */
export function buildSnapshot(input: { league: string; fetchedAt: Date; source: string; divPerUnit: ReadonlyMap<string, number> }): PriceSnapshot {
  const prices: Record<string, number> = {};
  const unpriced: string[] = [];
  for (const id of [...PLANNER_MATERIAL_IDS].sort()) {
    const div = input.divPerUnit.get(id);
    if (div != null && Number.isFinite(div) && div > 0) prices[id] = div;
    else unpriced.push(id);
  }
  const exalt = prices["exalted"];
  return {
    schema_version: PRICE_SNAPSHOT_VERSION,
    league: input.league,
    fetchedAt: input.fetchedAt.toISOString(),
    source: input.source,
    exaltPerDivine: exalt ? 1 / exalt : null,
    prices,
    unpriced,
  };
}
