import type { TradeCred } from "../api/tradeClient";
import { fetchTradeMeta } from "../api/tradeMeta";
import { buildStatIndex } from "./statResolver";
import { fireAlert } from "./alertEngine";
import { config } from "../config/env";
import { listUsers } from "../db/userQueries";
import {
  upsertCraftMargin,
  recordCraftScanError,
  insertMarginHistory,
  getCraftMargins,
  getMaterialPrices,
  getCurrencyDivMap,
  type MaterialPrice,
  type CraftMarginRow,
} from "../db/craftQueries";
import { ALL_MATERIALS } from "./craftMaterials";
import { getDefaultLeague } from "./leagueState";
import { resolveRates } from "./rates";
import { storedReport } from "./craftReports";
import { BASE_PERCENTILE, computeMargin, computeNearMiss, RETURN_FLAG_MULTIPLE, rankGate } from "./craftValuation";
import { RECIPES, type CraftRecipe, type LegReport, type RecipeMarginReport } from "./craftRecipes";
import { priceLeg, priceMaterials, tryLeg, isFailure, type LegContext } from "./craftLegPricing";
import { priceResultLeg } from "./craftResultValuation";

/**
 * Craft-margin engine. Prices each recipe's base leg live (floor-and-percentile over up to
 * LEG_SAMPLE asks), its result leg from finished-item comparables (trimmed median, see
 * craftResultValuation), its materials free from the ninja snapshot pipeline, and computes EV
 * per attempt:
 *   EV = hitRate × result median − base − materials  (flagged when the return is > 10× cost).
 * Read-only: it ranks and alerts; the human crafts. Legs share the trade2 Bottleneck, so the
 * poller runs ONE recipe per tick (the stalest) to stay well inside the rate budget.
 */

/** A scan outcome: the report plus whether its failure was only transient. */
export interface ScanOutcome {
  report: RecipeMarginReport;
  transient: boolean;
}

/**
 * EV + near-miss for two priced legs. An engine bug (a comparable leg without a band, a near-miss
 * on a zero median) becomes a leg-failed report naming the error instead of an exception, so one
 * bad recipe can't abort a manual sweep of all of them; it is not transient (a rescan won't fix
 * a bug), so the visible failure replaces the stored report.
 */
export function assembleReport(shell: RecipeMarginReport, base: LegReport, result: LegReport): ScanOutcome {
  try {
    const { evDiv, marginPct, returnFlagged } = computeMargin(base.priceDiv, result.priceDiv, shell.materialsDiv, shell.hitRate);
    if (!result.band) throw new Error("comparable result leg has no band");
    const nearMiss = computeNearMiss(base.priceDiv, result.band, shell.materialsDiv, shell.hitRate, { base, result });
    return { report: { ...shell, base, result, evDiv, marginPct, returnFlagged, nearMiss }, transient: false };
  } catch (e) {
    const error = `${shell.key}: engine error — ${e instanceof Error ? e.message : String(e)}`;
    console.error(`[craft-margin] ${error}`);
    return { report: { ...shell, status: "leg-failed", base, result, error }, transient: false };
  }
}

/** Build a full report for one recipe: materials (free) → rates → both legs (live) → EV +
 *  near-miss. Never throws: market, transport and engine failures all become a report. Each leg
 *  is priced independently, so a base that cleared the floor stays in the report (and can
 *  prefill attempt costs) even when the result leg failed. */
export async function buildReport(recipe: CraftRecipe, ctx: LegContext, prices: Map<string, MaterialPrice>): Promise<ScanOutcome> {
  const { lines, missing } = priceMaterials(recipe, prices);
  const materialsDiv = lines.reduce((s, l) => s + (l.totalDiv ?? 0), 0);
  const shell: RecipeMarginReport = {
    key: recipe.key,
    status: "ok",
    base: null,
    result: null,
    materials: lines,
    materialsDiv,
    hitRate: recipe.hitRate,
    evDiv: 0,
    marginPct: 0,
    error: null,
    valuation: "comparable-result",
    returnFlagged: false,
    nearMiss: null,
  };
  if (missing.length > 0) {
    const error = `no price for: ${missing.join(", ")} — add to a fetched ninja category or set manualPriceDiv`;
    return { report: { ...shell, status: "missing-materials", error }, transient: false };
  }
  // Checked before either leg: without rates the result can't be valued, so pricing the base
  // would spend 1 search + 4 fetches on a report that is thrown away (the previous one is kept).
  if (!ctx.rates) {
    return { report: { ...shell, status: "leg-failed", error: "no exchange rates — legs not priced this tick" }, transient: true };
  }
  const base = await tryLeg(() => priceLeg(recipe.base, BASE_PERCENTILE, ctx));
  const result = await tryLeg(() => priceResultLeg(recipe.result, ctx));
  if (isFailure(base) || isFailure(result)) {
    const failures = [base, result].filter(isFailure);
    const report: RecipeMarginReport = {
      ...shell,
      status: "leg-failed",
      base: isFailure(base) ? null : base,
      result: isFailure(result) ? null : result,
      error: failures.map((f) => f.error).join(" | "),
    };
    return { report, transient: failures.some((f) => f.transient) };
  }
  return assembleReport(shell, base, result);
}

/** Pure: keep the stored report instead of the new one? Only when the new scan failed for a
 *  transient reason AND what we already have is a good report — a 429 or a rate-governor timeout
 *  must not wipe a valid EV (and its rank / prefill) until the next clean scan. */
export function keepPreviousReport(previous: RecipeMarginReport | null, outcome: ScanOutcome): boolean {
  return outcome.transient && previous?.status === "ok";
}

/** Pure: does this report warrant a CRAFT_MARGIN alert? EV + margin thresholds AND the confidence
 *  gate (≥8 listed, ≥5 usable asks per leg, bait not dominating, no widened search). */
export function shouldAlert(report: RecipeMarginReport): boolean {
  const { alertMarginPct, alertMinEvDiv } = config.craftMargin;
  return rankGate(report).ok && report.marginPct >= alertMarginPct && report.evDiv >= alertMinEvDiv;
}

/** " · sells 8.0–14.0 div · high confidence" for the alert text; empty without a near-miss. */
function bandText(report: RecipeMarginReport): string {
  const nm = report.nearMiss;
  if (!nm) return "";
  return ` · sells ${nm.resultBandDiv.lo.toFixed(1)}–${nm.resultBandDiv.hi.toFixed(1)} div · ${nm.confidence} confidence`;
}

/** Alert every user when a recipe passes shouldAlert (throttled by fireAlert). */
function maybeAlert(recipe: CraftRecipe, report: RecipeMarginReport): void {
  if (!shouldAlert(report) || !report.result) return;
  const { alertMarginPct } = config.craftMargin;
  // Recipes are scanned under the owner's cred in the app default league — tag the finding there.
  const league = getDefaultLeague();
  for (const u of listUsers()) {
    fireAlert(u.id, league, {
      type: "CRAFT_MARGIN",
      itemId: recipe.key,
      itemName: recipe.label,
      message:
        `EV ~${report.evDiv.toFixed(1)} div/attempt · ${report.marginPct.toFixed(0)}% margin (hit ${(report.hitRate * 100).toFixed(0)}%, median of the ${report.result.samples} cheapest of ${report.result.total} listed)` +
        bandText(report) +
        (report.returnFlagged ? ` · ⚠ return >${RETURN_FLAG_MULTIPLE}× cost — check the result asks` : ""),
      value: report.marginPct,
      threshold: alertMarginPct,
      link: report.result.searchUrl,
    });
  }
}

/** What a scan did to the stored state — logged by the poller as the real outcome. */
export interface PersistResult {
  key: string;
  kept: boolean; // transient failure: the previous good report was kept, `error` recorded beside it
  report: RecipeMarginReport; // the report now stored (the kept one when `kept`)
  error: string | null; // the scan's error (transient when kept)
}

function persist(league: string, recipe: CraftRecipe, outcome: ScanOutcome): PersistResult {
  const report = outcome.report;
  const previous = storedReport(league, recipe.key);
  if (previous && keepPreviousReport(previous, outcome)) {
    const error = report.error ?? "transient scan failure";
    recordCraftScanError(league, recipe.key, error);
    return { key: recipe.key, kept: true, report: previous, error };
  }
  upsertCraftMargin(league, report.key, JSON.stringify(report), report.evDiv, report.marginPct);
  // Only successful scans feed the EV history — a failed/missing report's evDiv 0 would render as
  // a fake sparkline dip, misrepresenting the trend.
  if (report.status === "ok") insertMarginHistory(league, report.key, report.evDiv, report.marginPct);
  maybeAlert(recipe, report);
  return { key: recipe.key, kept: false, report, error: report.error };
}

/** When a recipe was last ATTEMPTED: the later of its last stored scan and its last transient
 *  failure. sqlite "YYYY-MM-DD HH:MM:SS" stamps sort lexicographically. */
function lastAttempt(row: Pick<CraftMarginRow, "scanned_at" | "last_error_at">): string {
  return row.last_error_at != null && row.last_error_at > row.scanned_at ? row.last_error_at : row.scanned_at;
}

/**
 * Pure round-robin pick: the recipe attempted longest ago (never-scanned first). Ordering on the
 * last ATTEMPT, not the last good scan — a recipe whose rescans keep failing transiently keeps an
 * old scanned_at forever and would otherwise be picked on every tick, starving all the others.
 */
export function pickStalest(
  keys: readonly string[],
  rows: ReadonlyArray<Pick<CraftMarginRow, "recipe_key" | "scanned_at" | "last_error_at">>,
): string | null {
  const attempted = new Map(rows.map((r) => [r.recipe_key, lastAttempt(r)]));
  let best: string | null = null;
  let bestAt: string | null = null;
  for (const key of keys) {
    const at = attempted.get(key) ?? null;
    if (at === null) return key; // never scanned beats everything
    if (best === null || (bestAt !== null && at < bestAt)) {
      best = key;
      bestAt = at;
    }
  }
  return best;
}

function stalestRecipe(league: string): CraftRecipe | null {
  const key = pickStalest(RECIPES.map((r) => r.key), getCraftMargins(league));
  return RECIPES.find((r) => r.key === key) ?? null;
}

/** Shared per-scan context. Rates may be null (no source answered) — listingDiv then falls back to
 *  the ninja currency map, and unrateable listings drop out instead of aborting the scan. */
async function scanContext(league: string, cred: TradeCred): Promise<LegContext> {
  // flagged (fractured/desecrated) stats too: a fractured +3 amulet is a different product
  const { stats, flaggedStats } = await fetchTradeMeta();
  const rates = resolveRates(league)?.rates ?? null;
  if (!rates) console.warn(`[craft-margin] no exchange rates for ${league} — pricing listings via the ninja currency map only`);
  return { idx: buildStatIndex([...stats, ...flaggedStats]), rates, cred, currencyDiv: getCurrencyDivMap(league) };
}

/** Refresh the single stalest recipe (the poller's per-tick unit of work, ≤ 3 searches + 8 fetches). */
export async function refreshStalestRecipe(cred: TradeCred): Promise<PersistResult | null> {
  const league = getDefaultLeague();
  const recipe = stalestRecipe(league);
  if (!recipe) return null;
  const ctx = await scanContext(league, cred);
  const prices = getMaterialPrices(league, recipe.materials.map((m) => m.material.id));
  return persist(league, recipe, await buildReport(recipe, ctx, prices));
}

/** Refresh every recipe now (manual owner trigger, ≤ 11 trade2 calls per recipe through the
 *  shared limiter). buildReport never throws, so one recipe's failure never aborts the rest. */
export async function refreshAllRecipes(cred: TradeCred): Promise<PersistResult[]> {
  const league = getDefaultLeague();
  const ctx = await scanContext(league, cred);
  const prices = getMaterialPrices(league, ALL_MATERIALS.map((m) => m.id));
  const reports: PersistResult[] = [];
  for (const recipe of RECIPES) {
    reports.push(persist(league, recipe, await buildReport(recipe, ctx, prices)));
  }
  return reports;
}
