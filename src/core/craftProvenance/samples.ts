import { readFileSync } from "node:fs";
import { join } from "node:path";
import { craftAttemptSampleRows, officialPatchSeenAt } from "../../db/craftQueries";
import { patchCoverageSchema } from "../../sources/patchNotes/contracts";
import type { CraftRecipe } from "../craftRecipes";
import { provenanceFor } from "../craftProvenanceData";
import { poolAttempts, type AttemptRow, type AttemptStats } from "./calibration";

/**
 * Server side of calibration: the pooled attempt sample per recipe. Attempts logged before the
 * recipe's `patchVerified` went live measured a different game, so they are dropped. The date comes
 * from patch-coverage.json when the version is the committed game-data patch, else from the
 * official_patch thread of that version. When neither knows the version (the thread was never
 * synced), no cutoff applies — every eligible attempt counts, rather than silently none.
 */

const COVERAGE_PATH = join(process.cwd(), "src", "data", "poe2", "patch-coverage.json");

/** ISO (published_at) or SQLite CURRENT_TIMESTAMP text (first_seen_at) → epoch ms. */
function toMs(at: string): number {
  const ms = Date.parse(at.includes("T") ? at : `${at.replace(" ", "T")}Z`);
  if (Number.isNaN(ms)) throw new Error(`unparseable patch timestamp "${at}"`);
  return ms;
}

export function patchVerifiedCutoffMs(version: string): number | null {
  const coverage = patchCoverageSchema.parse(JSON.parse(readFileSync(COVERAGE_PATH, "utf8")));
  if (coverage.game_data_patch === version) return toMs(coverage.official_patch_published_at);
  const seen = officialPatchSeenAt(version);
  return seen === null ? null : toMs(seen);
}

/** Pooled calibration stats per recipe key (recipes without eligible attempts are absent). */
export function calibrationStats(recipes: readonly CraftRecipe[]): Map<string, AttemptStats> {
  const rowsByRecipe = new Map<string, AttemptRow[]>();
  for (const row of craftAttemptSampleRows()) {
    const list = rowsByRecipe.get(row.recipeKey) ?? [];
    list.push(row);
    rowsByRecipe.set(row.recipeKey, list);
  }
  const out = new Map<string, AttemptStats>();
  const cutoffs = new Map<string, number | null>();
  for (const r of recipes) {
    const rows = rowsByRecipe.get(r.key);
    if (!rows) continue;
    const version = provenanceFor(r.key).patchVerified;
    if (!cutoffs.has(version)) cutoffs.set(version, patchVerifiedCutoffMs(version));
    out.set(r.key, poolAttempts(rows, cutoffs.get(version) ?? null));
  }
  return out;
}
