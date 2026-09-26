import { getCraftMargins } from "../db/craftQueries";
import { RecipeMarginReportSchema, type RecipeMarginReport } from "./craftRecipes";

/**
 * Validate a persisted report against the current schema. A row written by an older code
 * version with a different shape is rejected (→ null, logged) rather than blindly cast; rows that
 * predate the floor-percentile valuation parse with valuation "legacy-cheapest".
 */
export function parseStoredReport(key: string, json: string): RecipeMarginReport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    console.warn(`[craft-margin] report for ${key} is not valid JSON — ignoring: ${e instanceof Error ? e.message : e}`);
    return null;
  }
  const parsed = RecipeMarginReportSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn(`[craft-margin] stale report for ${key} failed schema — ignoring: ${parsed.error.issues[0]?.message}`);
    return null;
  }
  return parsed.data;
}

/** One recipe's stored report in a league, or null when never scanned / unparseable. */
export function storedReport(league: string, key: string): RecipeMarginReport | null {
  const row = getCraftMargins(league).find((r) => r.recipe_key === key);
  return row ? parseStoredReport(key, row.report_json) : null;
}
