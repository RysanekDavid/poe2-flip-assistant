import type { RecipeLegSpec, RecipeMarginReport } from "./craftRecipes";
import type { ExchangeRates } from "./priceEngine";

/**
 * Pure valuation + confidence rules for craft-margin legs. Kept apart from the engine (which does
 * I/O) so the numbers that decide "craft this now" are unit-testable without trade2.
 *
 * Why this exists: the first engine valued BOTH legs from the 10 cheapest asks and dropped "bait"
 * relative to the median of those same 10. When all 10 were 1-alch junk the median was junk too,
 * nothing got dropped, and 13/14 recipes priced a 400-pdps bow at 0.03 Div. The fixes below are
 * (1) a wider sample, (2) an ABSOLUTE ask floor so an all-junk window is rejected rather than
 * priced, and (3) a percentile of the surviving asks instead of the cheapest half.
 */

/** Listings sampled per leg: 1 search + ceil(40/10) = 4 fetches, so ≤ 5 trade2 calls per leg and
 *  ≤ 10 per recipe. The poller prices one recipe per craft tick, so a tick stays at ≤ 10 calls;
 *  a manual full refresh is RECIPES.length × 10, all queued through the shared trade2 limiter. */
export const LEG_SAMPLE = 40;

/** Default absolute ask floor: under this an ask is junk/bait (1-alch dumps, price-fixers) for a
 *  leg worth real money. Legs whose correct price IS ~1 exalt (putrefaction bases, plain rare
 *  glove/amulet bases) override it via RecipeLegSpec.minAskEx — at 0.05 they could never price. */
export const ABS_FLOOR_DIV = 0.05;
/** Absolute floor, in EXALTS, for legs whose honest price is ~1 exalt: cheap putrefaction bases,
 *  plain high-ilvl rare glove bases, magic amulet bases. Denominated in exalts because that is
 *  what those bases are priced in — a Div-denominated floor drifts with ex/div inflation and
 *  would push 1-ex bases back to leg-failed late league. Still above sub-exalt alch/aug dumps. */
export const CHEAP_BASE_FLOOR_EX = 0.7;
/** Div fallback for an exalt floor when no rate source answers (≈0.7 ex at ~350 ex/div). */
export const CHEAP_BASE_FLOOR_FALLBACK_DIV = 0.002;
/** On every leg, asks under this share of the cluster median are bait relative to the item's own market. */
export const REL_FLOOR = 0.05;
/** Fewer floor-passing asks than this and the leg is rejected (never priced at a guess). */
export const MIN_LEG_SAMPLES = 3;

/** The base is what YOU buy: the cheap end of realistic asks. */
export const BASE_PERCENTILE = 0.25;
/** The result is what you SELL into: p30 sits inside the p25–p40 band of instant-buyout asks —
 *  below the whale asks that never fill, above the undercut floor. */
export const RESULT_PERCENTILE = 0.3;

/** Alert / top-pick gate: a leg needs a real market behind it, not a handful of listings. */
export const GATE_MIN_TOTAL = 8;
export const GATE_MIN_SAMPLES = 5;
/** A flagged (>10× cost) return needs a deeper result market before it may rank or alert: a
 *  5-of-8 whale cluster clears the base gate, 20 listings behind the result rarely are all whales. */
export const GATE_FLAGGED_MIN_RESULT_TOTAL = 20;
/** Expected return (hitRate × result) above this multiple of the attempt cost is FLAGGED for a
 *  manual look. It never alters EV: cheap-base crafts (1-ex putrefaction base → multi-div result)
 *  legitimately return 10×+ cost. It only raises the result-depth bar in rankGate. */
export const RETURN_FLAG_MULTIPLE = 10;

/** Linear-interpolated percentile of an ASCENDING array; 0 for an empty one. */
export function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const pos = Math.min(Math.max(p, 0), 1) * (sortedAsc.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sortedAsc[lo]!;
  const b = sortedAsc[hi]!;
  return a + (b - a) * (pos - lo);
}

export interface FloorValuation {
  value: number; // the leg price (percentile of floor-passing asks), 0 when nothing survived
  kept: number; // floor-passing asks
  dropped: number; // finite, positive asks rejected by the floor
  floorDiv: number; // the floor actually applied
}

/**
 * Floor-and-percentile leg value from raw comparable Div prices. NaN/≤0 prices (currencies we
 * cannot rate) are discarded before anything else and are not counted as dropped bait. The
 * relative floor (REL_FLOOR × cluster p50) always applies; `absFloorDiv` is the leg's own
 * absolute floor (ABS_FLOOR_DIV unless the recipe says the leg is legitimately cheap).
 */
export function floorValue(divs: readonly number[], pctl: number, absFloorDiv: number = ABS_FLOOR_DIV): FloorValuation {
  const clean = divs.filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
  const clusterP50 = percentile(clean, 0.5);
  const floorDiv = Math.max(absFloorDiv, REL_FLOOR * clusterP50);
  const kept = clean.filter((d) => d >= floorDiv);
  return { value: percentile(kept, pctl), kept: kept.length, dropped: clean.length - kept.length, floorDiv };
}

/** The absolute ask floor (Div) for one leg at scan-time rates. */
export function legFloorDiv(leg: Pick<RecipeLegSpec, "minAskEx">, rates: ExchangeRates | null): number {
  if (leg.minAskEx == null) return ABS_FLOOR_DIV;
  return rates && rates.exaltPerDivine > 0 ? leg.minAskEx / rates.exaltPerDivine : CHEAP_BASE_FLOOR_FALLBACK_DIV;
}

/** EV per attempt = hitRate × result − base − materials, plus a high-return FLAG. The EV itself
 *  is never altered — a flag must not rewrite the number that feeds the EV history. */
export function computeMargin(
  baseDiv: number,
  resultDiv: number,
  materialsDiv: number,
  hitRate: number,
): { evDiv: number; marginPct: number; returnFlagged: boolean } {
  const cost = baseDiv + materialsDiv;
  const expectedReturn = hitRate * resultDiv;
  const evDiv = expectedReturn - cost;
  const returnFlagged = cost > 0 && expectedReturn > cost * RETURN_FLAG_MULTIPLE;
  return { evDiv, marginPct: cost > 0 ? (evDiv / cost) * 100 : 0, returnFlagged };
}

export interface RankGate {
  ok: boolean;
  reasons: string[]; // why a report may not drive an alert / top pick (empty when ok)
}

/** How old the report's last GOOD scan is vs. how old it may get before it stops ranking. */
export interface ReportFreshness {
  ageMs: number;
  maxAgeMs: number;
}

/**
 * May this report drive a CRAFT_MARGIN alert or a "craft right now" top pick? A report that is
 * shown but fails this gate is still visible in the recipe list — it just can't be broadcast.
 * A kept report (newer scans failing transiently) stops ranking once `freshness` says it's stale.
 */
export function rankGate(report: RecipeMarginReport, freshness?: ReportFreshness): RankGate {
  const reasons: string[] = [];
  if (report.status !== "ok" || !report.base || !report.result) return { ok: false, reasons: [report.status] };
  if (report.valuation !== "floor-percentile") reasons.push("legacy valuation — awaiting rescan");
  if (freshness && freshness.ageMs > freshness.maxAgeMs) {
    reasons.push(`stale: last good scan ${Math.round(freshness.ageMs / 3_600_000)}h ago — newer scans keep failing`);
  }
  if (report.returnFlagged && report.result.total < GATE_FLAGGED_MIN_RESULT_TOTAL) {
    reasons.push(`return >${RETURN_FLAG_MULTIPLE}× cost needs ≥${GATE_FLAGGED_MIN_RESULT_TOTAL} result listings (${report.result.total})`);
  }
  for (const [name, leg] of [["base", report.base], ["result", report.result]] as const) {
    if (leg.total < GATE_MIN_TOTAL) reasons.push(`${name}: only ${leg.total} listed (need ${GATE_MIN_TOTAL})`);
    if (leg.samples < GATE_MIN_SAMPLES) reasons.push(`${name}: only ${leg.samples} usable asks (need ${GATE_MIN_SAMPLES})`);
    if (leg.outliersDropped >= leg.samples) reasons.push(`${name}: more asks dropped as bait than kept`);
    if (leg.unresolvedStats.length > 0) reasons.push(`${name}: search widened (unresolved stats)`);
  }
  return { ok: reasons.length === 0, reasons };
}
