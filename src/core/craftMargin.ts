import { searchListingsLinked, type TradeCred } from "../api/tradeClient";
import { fetchScout, type ScoutRates } from "../api/scoutClient";
import { fetchTradeMeta } from "../api/tradeMeta";
import { buildStatIndex, type StatIndex } from "./statResolver";
import { toDivine } from "./huntEngine";
import { fireAlert } from "./alertEngine";
import { config } from "../config/env";
import { listUsers } from "../db/userQueries";
import {
  upsertCraftMargin,
  insertMarginHistory,
  getCraftMargins,
  getMaterialPrices,
  getCurrencyDivMap,
  type MaterialPrice,
} from "../db/craftQueries";
import { ALL_MATERIALS } from "./craftMaterials";
import { getActiveLeague } from "./leagueState";
import {
  RECIPES,
  type CraftRecipe,
  type RecipeLegSpec,
  type RecipeMarginReport,
  type LegReport,
  type MaterialReportLine,
} from "./craftRecipes";
import type { StatFilter, TradeQuery } from "../lib/tradeLink";

/**
 * Craft-margin engine. Prices each recipe's base + result legs live (cheapest comparables),
 * prices its materials free from the ninja snapshot pipeline, and computes EV per attempt:
 *   EV = hitRate × result-median − base − materials.
 * Read-only: it ranks and alerts; the human crafts. Legs share the trade2 Bottleneck, so the
 * poller runs ONE recipe per tick (the stalest) to stay well inside the rate budget.
 */

// same normalization the stat catalog uses (strip '+', lowercase, collapse spaces)
const norm = (s: string): string => s.toLowerCase().replace(/\+/g, "").replace(/\s+/g, " ").trim();

// A leg with fewer usable comparables than this can't be trusted — priced as "leg-failed", never
// fed a 0/NaN price into EV. Bait = listings under BAIT_FRACTION of the cluster median (fat-finger
// 1-ex dumps of an otherwise valuable item); dropped before valuation so the junk floor doesn't
// collapse the result value. Mirrors the outlier-resistant approach in comparableValuation/autoSnipe.
const MIN_SAMPLES = 3;
const BAIT_FRACTION = 0.2;

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Pure, junk-resistant leg value from raw comparable Div prices. Drops NaN/≤0 (exotic currencies
 * we don't rate), drops bait listings under BAIT_FRACTION × cluster-median, then takes the median
 * of the cheapest half of the survivors (a low percentile — a few whale asks don't inflate the
 * realistic sell price). Reports the survivor count and how many were discarded so the UI stays honest.
 */
export function robustValue(divs: number[]): { value: number; kept: number; dropped: number } {
  const clean = divs.filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
  if (clean.length === 0) return { value: 0, kept: 0, dropped: 0 };
  const clusterMed = median(clean);
  const kept = clean.filter((d) => d >= clusterMed * BAIT_FRACTION);
  const lowHalf = kept.slice(0, Math.max(1, Math.ceil(kept.length / 2)));
  return { value: median(lowHalf), kept: kept.length, dropped: clean.length - kept.length };
}

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

/** Listing price → Divine. Scout rates cover div/ex/chaos; everything else (alch, aug, regal,
 *  transmute… — exactly what the cheapest craft-base listings are priced in) falls back to the
 *  ninja exchange value of that currency item. NaN when neither source knows it. */
function listingDiv(amount: number, currency: string, rates: ScoutRates, currencyDiv: Map<string, number>): number {
  const d = toDivine(amount, currency, rates);
  if (Number.isFinite(d)) return d;
  const unit = currencyDiv.get(currency);
  return unit != null ? amount * unit : NaN;
}

/** Price one leg via a junk-resistant median of priced+online comparables. Throws (→ "leg-failed",
 *  naming the leg) when too few survive the outlier filter, so a 0/NaN price never reaches EV. */
async function priceLeg(
  leg: RecipeLegSpec,
  idx: StatIndex,
  rates: ScoutRates,
  cred: TradeCred,
  currencyDiv: Map<string, number>,
): Promise<LegReport> {
  const { query, unresolved } = legToQuery(leg, idx);
  const { total, listings, searchUrl } = await searchListingsLinked(query, 10, cred);
  const priced = listings.filter((l) => l.price && l.online);
  const divs = priced.map((l) => listingDiv(l.price!.amount, l.price!.currency, rates, currencyDiv));
  const { value, kept, dropped } = robustValue(divs);
  if (kept < MIN_SAMPLES) {
    throw new Error(
      `${leg.label}: only ${kept} usable comparable(s) after outlier filter (need ${MIN_SAMPLES}); ${total} listed, ${dropped} bait dropped`,
    );
  }
  const icon = priced.find((l) => l.icon)?.icon ?? null; // real item art for the recipe card
  return { priceDiv: value, samples: kept, total, searchUrl, outliersDropped: dropped, unresolvedStats: unresolved, icon };
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

/** Pure: EV per attempt and its margin over total cost. */
export function computeMargin(
  baseDiv: number,
  resultDiv: number,
  materialsDiv: number,
  hitRate: number,
): { evDiv: number; marginPct: number } {
  const cost = baseDiv + materialsDiv;
  const evDiv = hitRate * resultDiv - cost;
  const marginPct = cost > 0 ? (evDiv / cost) * 100 : 0;
  return { evDiv, marginPct };
}

/** Build a full report for one recipe: materials (free) → both legs (live) → EV. Never throws. */
async function buildReport(
  recipe: CraftRecipe,
  idx: StatIndex,
  rates: ScoutRates,
  cred: TradeCred,
  prices: Map<string, MaterialPrice>,
  currencyDiv: Map<string, number>,
): Promise<RecipeMarginReport> {
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
  };
  if (missing.length > 0) {
    return {
      ...shell,
      status: "missing-materials",
      error: `no price for: ${missing.join(", ")} — add to a fetched ninja category or set manualPriceDiv`,
    };
  }
  try {
    const base = await priceLeg(recipe.base, idx, rates, cred, currencyDiv);
    const result = await priceLeg(recipe.result, idx, rates, cred, currencyDiv);
    const { evDiv, marginPct } = computeMargin(base.priceDiv, result.priceDiv, materialsDiv, recipe.hitRate);
    return { ...shell, base, result, evDiv, marginPct };
  } catch (e) {
    return { ...shell, status: "leg-failed", error: e instanceof Error ? e.message : String(e) };
  }
}

/** Alert every user when a recipe clears the EV + margin + confidence gate (throttled by fireAlert).
 *  Suppressed when either leg had an unresolved target stat (the search was silently widened, so the
 *  result value can't be trusted for an alert). */
function maybeAlert(recipe: CraftRecipe, report: RecipeMarginReport): void {
  if (report.status !== "ok" || !report.result || !report.base) return;
  if (report.base.unresolvedStats.length > 0 || report.result.unresolvedStats.length > 0) return;
  const { alertMarginPct, alertMinEvDiv } = config.craftMargin;
  if (report.marginPct < alertMarginPct || report.evDiv < alertMinEvDiv) return;
  if (report.base.samples < MIN_SAMPLES || report.result.samples < MIN_SAMPLES) return;
  for (const u of listUsers()) {
    fireAlert(u.id, {
      type: "CRAFT_MARGIN",
      itemId: recipe.key,
      itemName: recipe.label,
      message: `EV ~${report.evDiv.toFixed(1)} div/attempt · ${report.marginPct.toFixed(0)}% margin (hit ${(report.hitRate * 100).toFixed(0)}%, ${report.result.samples} comps)`,
      value: report.marginPct,
      threshold: alertMarginPct,
      link: report.result.searchUrl,
    });
  }
}

function persist(league: string, recipe: CraftRecipe, report: RecipeMarginReport): void {
  upsertCraftMargin(league, report.key, JSON.stringify(report), report.evDiv, report.marginPct);
  // Only successful scans feed the EV history — a failed/missing report's evDiv 0 would render as
  // a fake sparkline dip, misrepresenting the trend.
  if (report.status === "ok") insertMarginHistory(league, report.key, report.evDiv, report.marginPct);
  maybeAlert(recipe, report);
}

/** Is scan-time `a` staler than `b`? Never-scanned (null) beats any real timestamp. */
function isStaler(a: string | null, b: string | null): boolean {
  if (a === null) return b !== null;
  if (b === null) return false;
  return a < b; // sqlite "YYYY-MM-DD HH:MM:SS" sorts lexicographically
}

/** The recipe whose stored report is oldest (or never scanned) — the round-robin pick. */
function stalestRecipe(league: string): CraftRecipe | null {
  if (RECIPES.length === 0) return null;
  const scanned = new Map(getCraftMargins(league).map((r) => [r.recipe_key, r.scanned_at]));
  let best: CraftRecipe | null = null;
  let bestAt: string | null = null;
  for (const r of RECIPES) {
    const at = scanned.get(r.key) ?? null;
    if (best === null || isStaler(at, bestAt)) {
      best = r;
      bestAt = at;
    }
  }
  return best;
}

/** Refresh the single stalest recipe (the poller's per-tick unit of work). */
export async function refreshStalestRecipe(cred: TradeCred): Promise<RecipeMarginReport | null> {
  const league = getActiveLeague();
  const recipe = stalestRecipe(league);
  if (!recipe) return null;
  const { rates } = await fetchScout();
  const { stats } = await fetchTradeMeta();
  const idx = buildStatIndex(stats);
  const prices = getMaterialPrices(league, recipe.materials.map((m) => m.material.id));
  const report = await buildReport(recipe, idx, rates, cred, prices, getCurrencyDivMap(league));
  persist(league, recipe, report);
  return report;
}

/** Refresh every recipe now (manual owner trigger). Per-recipe isolation: one failure never
 *  aborts the rest, it just lands as a "leg-failed" report with the error populated. */
export async function refreshAllRecipes(cred: TradeCred): Promise<RecipeMarginReport[]> {
  const league = getActiveLeague();
  const { rates } = await fetchScout();
  const { stats } = await fetchTradeMeta();
  const idx = buildStatIndex(stats);
  const prices = getMaterialPrices(league, ALL_MATERIALS.map((m) => m.id));
  const currencyDiv = getCurrencyDivMap(league);
  const reports: RecipeMarginReport[] = [];
  for (const recipe of RECIPES) {
    let report: RecipeMarginReport;
    try {
      report = await buildReport(recipe, idx, rates, cred, prices, currencyDiv);
    } catch (e) {
      report = {
        key: recipe.key,
        status: "leg-failed",
        base: null,
        result: null,
        materials: [],
        materialsDiv: 0,
        hitRate: recipe.hitRate,
        evDiv: 0,
        marginPct: 0,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    persist(league, recipe, report);
    reports.push(report);
  }
  return reports;
}
