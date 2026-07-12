import { z } from "zod";
import type { CraftMaterial } from "./craftMaterials";
import type { Rarity } from "../lib/tradeLink";

/**
 * Curated craft recipes ranked by live EV per attempt:
 *   EV = hitRate × result-comparable-median − base cost − material cost.
 *
 * These are DELIBERATELY approximate — PoE2 craft mechanics shift patch to patch and the exact
 * omen/essence/quantity for each hit is a moving target. Every leg and material carries a `note`
 * caveat surfaced in the UI so the numbers read as an estimate, never a guarantee. A domain
 * expert refines the recipe data; the engine + itemization are the durable part.
 */

/** One target/searched mod on a leg. `text` is the trade catalog template ('#' for the roll). */
export interface RecipeStatSpec {
  text: string;
  min?: number;
  pseudoFirst?: boolean; // prefer the pseudo-group id when the text exists in several groups
}

/** A leg to price via a live trade2 search — either the base you buy or the finished item you sell. */
export interface RecipeLegSpec {
  label: string;
  type?: string; // base type name, e.g. "Time-Lost Sapphire"
  category?: string; // trade2 category, e.g. "weapon.bow" (when no single base type applies)
  rarity?: Rarity;
  ilvlMin?: number;
  pdpsMin?: number; // weapon result legs are valued by physical DPS, not just mods
  stats: RecipeStatSpec[];
  note: string; // approximation caveat shown in the UI
}

/** One itemized material input. `qtyPerAttempt` is the EXPECTED quantity incl. probabilistic re-tries. */
export interface RecipeMaterialLine {
  material: CraftMaterial;
  qtyPerAttempt: number;
  manualPriceDiv?: number; // static fallback until the ninja category flows (source → "manual")
  note?: string;
}

export interface CraftRecipe {
  key: string;
  label: string;
  source: string; // where the method came from (guide/creator), for provenance
  base: RecipeLegSpec;
  result: RecipeLegSpec;
  materials: RecipeMaterialLine[];
  hitRate: number; // 0..1 probability an attempt yields the sellable result — shown in the UI
  steps: string[];
}

// Report types are zod schemas (not bare interfaces) because reports are persisted as JSON and
// re-read across code versions — an old row that no longer matches the shape must be rejected,
// not blindly cast. Types are inferred from the schemas so the two can never drift.

/** Per-material line in a computed margin report. */
export const MaterialReportLineSchema = z.object({
  id: z.string(),
  label: z.string(),
  qty: z.number(),
  unitDiv: z.number().nullable(),
  totalDiv: z.number().nullable(),
  source: z.enum(["ninja", "manual"]),
  ageMin: z.number().nullable(),
});
export type MaterialReportLine = z.infer<typeof MaterialReportLineSchema>;

/** One priced leg (base or result) in a computed margin report. */
export const LegReportSchema = z.object({
  priceDiv: z.number(),
  samples: z.number(), // post-outlier-filter comparable count (confidence)
  total: z.number(),
  searchUrl: z.string(),
  outliersDropped: z.number(), // bait listings discarded before valuation
  unresolvedStats: z.array(z.string()), // target mod texts the catalog couldn't resolve (search widened)
});
export type LegReport = z.infer<typeof LegReportSchema>;

export const RecipeMarginReportSchema = z.object({
  key: z.string(),
  status: z.enum(["ok", "missing-materials", "leg-failed"]),
  base: LegReportSchema.nullable(),
  result: LegReportSchema.nullable(),
  materials: z.array(MaterialReportLineSchema),
  materialsDiv: z.number(),
  hitRate: z.number(),
  evDiv: z.number(), // hitRate × result − base − materials
  marginPct: z.number(), // ev / (base + materials) × 100
  error: z.string().nullable(),
});
export type RecipeMarginReport = z.infer<typeof RecipeMarginReportSchema>;

export { RECIPES } from "./craftRecipeData";
