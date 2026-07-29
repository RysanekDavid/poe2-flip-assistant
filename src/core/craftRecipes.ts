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
  name?: string; // unique item name, e.g. "Rathpith Globe" (unique-gamble recipes)
  type?: string; // base type name, e.g. "Time-Lost Sapphire"
  category?: string; // trade2 category, e.g. "weapon.bow" (when no single base type applies)
  rarity?: Rarity;
  ilvlMin?: number;
  pdpsMin?: number; // weapon result legs are valued by physical DPS, not just mods
  esMin?: number; // armour legs: select ES (caster) bases
  evMin?: number; // armour legs: select evasion (attack) bases
  corrupted?: boolean | "any"; // default false; "any" = don't filter (vaal-gamble outputs mix both)
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

/**
 * One step of the craft playbook. `mats` lists the materials touched in the step so the UI can
 * show live prices inline; `warning` marks the get-this-wrong-and-it-bricks checks; `onFail`
 * says what to do when the step doesn't proc (discard base, sell as-is, continue anyway…).
 */
export interface GuideStep {
  do: string;
  why?: string;
  mats?: CraftMaterial[];
  warning?: string;
  onFail?: string;
  pick?: string[]; // at reveal/unveil steps: the exact mods to look for, best first
  check?: string; // what the item must look like after this step — the player's verification
}

export interface GuidePhase {
  title: string;
  steps: GuideStep[];
}

/** The full how-to for a recipe: what to buy, what to aim for, phase-by-phase, brick handling. */
export interface CraftGuide {
  goal: string; // what the finished item must look like to sell
  shopping: string; // exactly what base to buy — and what to avoid
  marketCheck: string; // the go/no-go price check before spending anything
  phases: GuidePhase[];
  brick: string; // when to stop / what a failed attempt is still worth
}

/** Item domain a recipe belongs to — each domain gets its own crafting window in the UI,
 *  because the procedures (and the player's mental model) differ per item class. */
export type CraftDomain = "jewel" | "weapon" | "jewellery" | "armour";

export interface CraftRecipe {
  key: string;
  label: string;
  domain: CraftDomain;
  heroIcon?: string; // static poecdn art override for the recipe card (else live comparable art)
  source: string; // where the method came from (guide/creator), for provenance
  base: RecipeLegSpec;
  result: RecipeLegSpec;
  materials: RecipeMaterialLine[];
  hitRate: number; // 0..1 probability an attempt yields the sellable result — shown in the UI
  guide: CraftGuide;
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
  icon: z.string().nullable().catch(null), // item art from a live comparable (catch: pre-icon rows parse as null)
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

import { RECIPES as CORE_RECIPES } from "./craftRecipeData";
import { RECIPES_2 } from "./craftRecipeData2";

/** All curated recipes — the original batch (craftRecipeData) plus the creator-video batch
 *  (craftRecipeData2), split across two data files to respect the 500-line cap. */
export const RECIPES: CraftRecipe[] = [...CORE_RECIPES, ...RECIPES_2];
