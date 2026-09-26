import { createSearch, fetchListings, type TradeCred } from "../api/tradeClient";
import type { Listing } from "../api/tradeListing";
import { fetchTradeMeta } from "../api/tradeMeta";
import { buildStatIndex, type StatIndex } from "./statResolver";
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
import type { ExchangeRates } from "./priceEngine";
import {
  LEG_SAMPLE,
  MIN_LEG_SAMPLES,
  BASE_PERCENTILE,
  RESULT_PERCENTILE,
  floorValue,
  computeMargin,
  legFloorDiv,
  RETURN_FLAG_MULTIPLE,
  rankGate,
} from "./craftValuation";
import {
  RECIPES,
  type CraftRecipe,
  type RecipeLegSpec,
  type RecipeMarginReport,
  type LegReport,
  type MaterialReportLine,
} from "./craftRecipes";
import { tradeSearchPageUrl, type StatFilter, type TradeQuery } from "../lib/tradeLink";

/**
 * Craft-margin engine. Prices each recipe's base + result legs live (floor-and-percentile over up
 * to LEG_SAMPLE comparables — see craftValuation), prices its materials free from the ninja
 * snapshot pipeline, and computes EV per attempt:
 *   EV = hitRate × result − base − materials  (flagged when the return is > 10× cost).
 * Read-only: it ranks and alerts; the human crafts. Legs share the trade2 Bottleneck, so the
 * poller runs ONE recipe per tick (the stalest) to stay well inside the rate budget.
 */

// same normalization the stat catalog uses (strip '+', lowercase, collapse spaces)
const norm = (s: string): string => s.toLowerCase().replace(/\+/g, "").replace(/\s+/g, " ").trim();

/** Resolve a leg's target mod texts to trade ids and assemble the search query. Texts the catalog
 *  can't resolve are returned in `unresolved` (never silently swallowed) so the caller can widen
 *  the search caveat AND suppress alerts — a renamed stat must not become an any-rare search. */
export function legToQuery(leg: RecipeLegSpec, idx: StatIndex): { query: TradeQuery; unresolved: string[] } {
  const filters: StatFilter[] = [];
  const unresolved: string[] = [];
  for (const s of leg.stats) {
    const matches = idx.byText.get(norm(s.text));
    if (!matches || matches.length === 0) {
      unresolved.push(s.text);
      continue;
    }
    const pick = s.pseudoFirst ? (matches.find((m) => m.group === "pseudo") ?? matches[0]!) : matches[0]!;
    filters.push({ id: pick.id, min: s.min });
  }
  const query: TradeQuery = {
    name: leg.name,
    type: leg.type,
    category: leg.category,
    rarity: leg.rarity,
    ilvlMin: leg.ilvlMin,
    pdpsMin: leg.pdpsMin,
    esMin: leg.esMin,
    evMin: leg.evMin,
    // comparables default to uncorrupted (a corrupted result isn't reforge-able) — vaal-gamble
    // recipes override per leg ("any" = both, their outputs mix corrupted and clean)
    corrupted: leg.corrupted === "any" ? undefined : (leg.corrupted ?? false),
    online: true,
    stats: filters,
  };
  return { query, unresolved };
}

/**
 * Listing price → Divine. Rates come from the league rate ladder (cx → ninja → scout), so a
 * poe2scout outage no longer aborts a craft scan. Small currencies (alch, aug, regal… — exactly
 * what junk base listings are priced in) fall back to the ninja exchange value of that item, as
 * do exalt/chaos when no rate source answers. NaN when nothing knows the currency (dropped).
 */
export function listingDiv(
  amount: number,
  currency: string,
  rates: ExchangeRates | null,
  currencyDiv: ReadonlyMap<string, number>,
): number {
  if (currency === "divine") return amount;
  if (rates && (currency === "exalted" || currency === "exalt")) return amount / rates.exaltPerDivine;
  if (rates && currency === "chaos") return amount / rates.chaosPerDivine;
  const unit = currencyDiv.get(currency === "exalt" ? "exalted" : currency);
  return unit != null ? amount * unit : NaN;
}

interface LegContext {
  idx: StatIndex;
  rates: ExchangeRates | null;
  cred: TradeCred;
  currencyDiv: ReadonlyMap<string, number>;
}

/** Up to LEG_SAMPLE cheapest priced listings for a query: 1 search + ≤4 fetches. */
async function sampleListings(
  query: TradeQuery,
  cred: TradeCred,
): Promise<{ total: number; listings: Listing[]; searchUrl: string }> {
  const search = await createSearch(query, "asc", cred);
  const ids = (search.result ?? []).slice(0, LEG_SAMPLE);
  const listings: Listing[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    listings.push(...(await fetchListings(ids.slice(i, i + 10), search.id, cred)));
  }
  return { total: search.total ?? listings.length, listings, searchUrl: tradeSearchPageUrl(getDefaultLeague(), search.id) };
}

/** A leg the market itself failed to price (too few asks above its floor) — a real finding about
 *  the market. Any OTHER error from a leg (transport, 429, a rate governor giving up) is transient. */
class LegFloorError extends Error {}

/** Price one leg at `pctl` of its floor-passing asks. Throws (→ "leg-failed", naming the leg)
 *  when fewer than MIN_LEG_SAMPLES asks clear the floor, so a junk price never reaches EV. */
async function priceLeg(leg: RecipeLegSpec, pctl: number, ctx: LegContext): Promise<LegReport> {
  const { query, unresolved } = legToQuery(leg, ctx.idx);
  const { total, listings, searchUrl } = await sampleListings(query, ctx.cred);
  const priced = listings.filter((l) => l.price && l.online);
  const divs = priced.map((l) => listingDiv(l.price!.amount, l.price!.currency, ctx.rates, ctx.currencyDiv));
  const { value, kept, dropped, floorDiv } = floorValue(divs, pctl, legFloorDiv(leg, ctx.rates));
  if (kept < MIN_LEG_SAMPLES) {
    throw new LegFloorError(
      `${leg.label}: only ${kept} ask(s) at or above the ${floorDiv.toFixed(3)} Div floor (need ${MIN_LEG_SAMPLES}); ` +
        `${total} listed, ${listings.length} sampled, ${dropped} below the floor — leg not priced`,
    );
  }
  return {
    priceDiv: value,
    samples: kept,
    total,
    searchUrl,
    outliersDropped: dropped,
    unresolvedStats: unresolved,
    icon: priced.find((l) => l.icon)?.icon ?? null, // real item art for the recipe card
    floorDiv,
    percentile: pctl,
    sampled: listings.length,
  };
}

/**
 * Pure: price a recipe's materials from the snapshot map. A material with neither a live snapshot
 * nor a manualPriceDiv fallback is reported in `missing` so the caller can fail loud (status
 * "missing-materials") instead of silently pricing it at zero.
 */
export function priceMaterials(
  recipe: CraftRecipe,
  prices: Map<string, MaterialPrice>,
): { lines: MaterialReportLine[]; missing: string[] } {
  const lines: MaterialReportLine[] = [];
  const missing: string[] = [];
  for (const m of recipe.materials) {
    const p = prices.get(m.material.id);
    let unitDiv: number | null = null;
    let source: "ninja" | "manual" = "ninja";
    let ageMin: number | null = null;
    if (p) {
      unitDiv = p.priceDiv;
      ageMin = p.ageMin;
    } else if (m.manualPriceDiv != null) {
      unitDiv = m.manualPriceDiv;
      source = "manual";
    } else {
      missing.push(m.material.id);
    }
    lines.push({
      id: m.material.id,
      label: m.material.label,
      qty: m.qtyPerAttempt,
      unitDiv,
      totalDiv: unitDiv != null ? unitDiv * m.qtyPerAttempt : null,
      source,
      ageMin,
    });
  }
  return { lines, missing };
}

interface LegFailure {
  error: string;
  transient: boolean; // transport / rate-limit, not a verdict about the market
}

/** Price one leg, turning a failure into a classified LegFailure instead of an exception. */
async function tryLeg(leg: RecipeLegSpec, pctl: number, ctx: LegContext): Promise<LegReport | LegFailure> {
  try {
    return await priceLeg(leg, pctl, ctx);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), transient: !(e instanceof LegFloorError) };
  }
}

const isFailure = (x: LegReport | LegFailure): x is LegFailure => "error" in x;

/** A scan outcome: the report plus whether its failure was only transient. */
export interface ScanOutcome {
  report: RecipeMarginReport;
  transient: boolean;
}

/** Build a full report for one recipe: materials (free) → both legs (live) → EV. Never throws.
 *  Each leg is priced independently, so a base that cleared the floor stays in the report (and
 *  can prefill attempt costs) even when the result leg failed. */
async function buildReport(recipe: CraftRecipe, ctx: LegContext, prices: Map<string, MaterialPrice>): Promise<ScanOutcome> {
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
    valuation: "floor-percentile",
    returnFlagged: false,
  };
  if (missing.length > 0) {
    const error = `no price for: ${missing.join(", ")} — add to a fetched ninja category or set manualPriceDiv`;
    return { report: { ...shell, status: "missing-materials", error }, transient: false };
  }
  const base = await tryLeg(recipe.base, BASE_PERCENTILE, ctx);
  const result = await tryLeg(recipe.result, RESULT_PERCENTILE, ctx);
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
  const { evDiv, marginPct, returnFlagged } = computeMargin(base.priceDiv, result.priceDiv, materialsDiv, recipe.hitRate);
  return { report: { ...shell, base, result, evDiv, marginPct, returnFlagged }, transient: false };
}

/** Pure: keep the stored report instead of the new one? Only when the new scan failed for a
 *  transient reason AND what we already have is a good report — a 429 or a rate-governor timeout
 *  must not wipe a valid EV (and its rank / prefill / hunt-preset) until the next clean scan. */
export function keepPreviousReport(previous: RecipeMarginReport | null, outcome: ScanOutcome): boolean {
  return outcome.transient && previous?.status === "ok";
}

/** Pure: does this report warrant a CRAFT_MARGIN alert? EV + margin thresholds AND the confidence
 *  gate (≥8 listed, ≥5 usable asks per leg, bait not dominating, no widened search). */
export function shouldAlert(report: RecipeMarginReport): boolean {
  const { alertMarginPct, alertMinEvDiv } = config.craftMargin;
  return rankGate(report).ok && report.marginPct >= alertMarginPct && report.evDiv >= alertMinEvDiv;
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
        `EV ~${report.evDiv.toFixed(1)} div/attempt · ${report.marginPct.toFixed(0)}% margin (hit ${(report.hitRate * 100).toFixed(0)}%, ${report.result.samples} comps)` +
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
  const { stats } = await fetchTradeMeta();
  const rates = resolveRates(league)?.rates ?? null;
  if (!rates) console.warn(`[craft-margin] no exchange rates for ${league} — pricing listings via the ninja currency map only`);
  return { idx: buildStatIndex(stats), rates, cred, currencyDiv: getCurrencyDivMap(league) };
}

/** Refresh the single stalest recipe (the poller's per-tick unit of work, ≤ 10 trade2 calls). */
export async function refreshStalestRecipe(cred: TradeCred): Promise<PersistResult | null> {
  const league = getDefaultLeague();
  const recipe = stalestRecipe(league);
  if (!recipe) return null;
  const ctx = await scanContext(league, cred);
  const prices = getMaterialPrices(league, recipe.materials.map((m) => m.material.id));
  return persist(league, recipe, await buildReport(recipe, ctx, prices));
}

/** Refresh every recipe now (manual owner trigger, ≤ 10 trade2 calls per recipe through the
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
