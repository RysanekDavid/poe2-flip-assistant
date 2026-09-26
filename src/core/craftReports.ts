import { getCraftMargins, type CraftMarginRow } from "../db/craftQueries";
import { timestampAgeMs } from "../db/ratesQueries";
import { config } from "../config/env";
import { RECIPES, RecipeMarginReportSchema, type RecipeMarginReport } from "./craftRecipes";
import type { ReportFreshness } from "./craftValuation";

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

/**
 * A kept report (newer scans failing transiently) may drive ranking / alerts / prefill / hunt caps
 * for at most 3 full round-robin cycles of the poller; after that its prices are too old to act on.
 */
export function reportMaxAgeMs(): number {
  return 3 * config.craftMargin.intervalMin * RECIPES.length * 60_000;
}

/** Freshness of a stored row's last GOOD scan (scanned_at is only moved by a stored report). */
export function rowFreshness(row: Pick<CraftMarginRow, "scanned_at">, nowMs: number = Date.now()): ReportFreshness {
  return { ageMs: timestampAgeMs(row.scanned_at, nowMs), maxAgeMs: reportMaxAgeMs() };
}

function storedRow(league: string, key: string): CraftMarginRow | null {
  return getCraftMargins(league).find((r) => r.recipe_key === key) ?? null;
}

/** One recipe's stored report in a league, or null when never scanned / unparseable. */
export function storedReport(league: string, key: string): RecipeMarginReport | null {
  const row = storedRow(league, key);
  return row ? parseStoredReport(key, row.report_json) : null;
}

/** The stored report only if it is fresh enough to ACT on (attempt prefill, hunt caps). */
export function actionableReport(league: string, key: string): RecipeMarginReport | null {
  const row = storedRow(league, key);
  if (!row) return null;
  const f = rowFreshness(row);
  return f.ageMs > f.maxAgeMs ? null : parseStoredReport(key, row.report_json);
}
