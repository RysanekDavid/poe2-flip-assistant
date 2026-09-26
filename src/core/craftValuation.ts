import type { RecipeMarginReport } from "./craftRecipes";

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

/** Asks under this are junk/bait for any leg this engine prices (1-alch dumps, price-fixers). */
export const ABS_FLOOR_DIV = 0.05;
/** …and asks under this share of the cluster median are bait relative to the item's own market. */
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
/** Expected return (hitRate × result) above this multiple of the attempt cost is capped and
 *  flagged: at that ratio the result leg is almost certainly pricing outlier asks. */
export const RETURN_CAP_MULTIPLE = 10;

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
 * cannot rate) are discarded before anything else and are not counted as dropped bait.
 */
export function floorValue(divs: readonly number[], pctl: number): FloorValuation {
  const clean = divs.filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => a - b);
  const clusterP50 = percentile(clean, 0.5);
  const floorDiv = Math.max(ABS_FLOOR_DIV, REL_FLOOR * clusterP50);
  const kept = clean.filter((d) => d >= floorDiv);
  return { value: percentile(kept, pctl), kept: kept.length, dropped: clean.length - kept.length, floorDiv };
}

/** EV per attempt with the expected return capped at RETURN_CAP_MULTIPLE × cost (flagged). */
export function cappedMargin(
  baseDiv: number,
  resultDiv: number,
  materialsDiv: number,
  hitRate: number,
): { evDiv: number; marginPct: number; returnCapped: boolean } {
  const cost = baseDiv + materialsDiv;
  const rawReturn = hitRate * resultDiv;
  const cap = cost * RETURN_CAP_MULTIPLE;
  const returnCapped = cost > 0 && rawReturn > cap;
  const evDiv = (returnCapped ? cap : rawReturn) - cost;
  return { evDiv, marginPct: cost > 0 ? (evDiv / cost) * 100 : 0, returnCapped };
}

export interface RankGate {
  ok: boolean;
  reasons: string[]; // why a report may not drive an alert / top pick (empty when ok)
}

/**
 * May this report drive a CRAFT_MARGIN alert or a "craft right now" top pick? A report that is
 * shown but fails this gate is still visible in the recipe list — it just can't be broadcast.
 */
export function rankGate(report: RecipeMarginReport): RankGate {
  const reasons: string[] = [];
  if (report.status !== "ok" || !report.base || !report.result) return { ok: false, reasons: [report.status] };
  if (report.valuation !== "floor-percentile") reasons.push("legacy valuation — awaiting rescan");
  for (const [name, leg] of [["base", report.base], ["result", report.result]] as const) {
    if (leg.total < GATE_MIN_TOTAL) reasons.push(`${name}: only ${leg.total} listed (need ${GATE_MIN_TOTAL})`);
    if (leg.samples < GATE_MIN_SAMPLES) reasons.push(`${name}: only ${leg.samples} usable asks (need ${GATE_MIN_SAMPLES})`);
    if (leg.outliersDropped >= leg.samples) reasons.push(`${name}: more asks dropped as bait than kept`);
    if (leg.unresolvedStats.length > 0) reasons.push(`${name}: search widened (unresolved stats)`);
  }
  if (report.returnCapped) reasons.push(`return capped at ${RETURN_CAP_MULTIPLE}× cost — result likely priced from outliers`);
  return { ok: reasons.length === 0, reasons };
}
