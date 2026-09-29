import { HORIZON_HOURS, HORIZON_KEYS, type HorizonKey, type ImpactPoint } from "../../lib/patchImpactContract";
import type { PricePoint } from "../../db/priceAtQueries";

/**
 * Price moves around a patch instant. Pure.
 *
 * pre = the last snapshot at least an hour BEFORE the patch (forum times are approximate and the
 * patch may deploy a little before its thread), looked up no further back than PRE_LOOKBACK — an
 * older row would measure a poller outage, not the patch. Each horizon takes the snapshot nearest
 * its target within ±TOLERANCE; none close enough → null, never 0.
 */

const HOUR_MS = 3_600_000;
export const PRE_GAP_MS = HOUR_MS;
export const PRE_LOOKBACK_MS = 6 * HOUR_MS;
export const TOLERANCE_MS = 3 * HOUR_MS;

/** Everything any lookup can touch, for one bounded read per item. */
export function snapshotWindow(patchMs: number): { fromMs: number; toMs: number } {
  return { fromMs: patchMs - PRE_GAP_MS - PRE_LOOKBACK_MS, toMs: patchMs + HORIZON_HOURS.d7 * HOUR_MS + TOLERANCE_MS };
}

/** The only stretches any lookup reads: the pre window and ±TOLERANCE around each horizon. */
export function lookupRanges(patchMs: number): Array<{ fromMs: number; toMs: number }> {
  const latestPre = patchMs - PRE_GAP_MS;
  const ranges = [{ fromMs: latestPre - PRE_LOOKBACK_MS, toMs: latestPre }];
  for (const key of HORIZON_KEYS) {
    const target = horizonTargetMs(patchMs, key);
    ranges.push({ fromMs: target - TOLERANCE_MS, toMs: target + TOLERANCE_MS });
  }
  return ranges;
}

export function horizonTargetMs(patchMs: number, key: HorizonKey): number {
  return patchMs + HORIZON_HOURS[key] * HOUR_MS;
}

export function horizonDue(patchMs: number, nowMs: number, key: HorizonKey): boolean {
  return horizonTargetMs(patchMs, key) <= nowMs;
}

/** Last price in [patch − 1h − lookback, patch − 1h]; points are oldest first. */
export function prePrice(points: readonly PricePoint[], patchMs: number): number | null {
  const latest = patchMs - PRE_GAP_MS;
  const earliest = latest - PRE_LOOKBACK_MS;
  let found: number | null = null;
  for (const p of points) {
    if (p.ms > latest) break;
    if (p.ms >= earliest) found = p.div;
  }
  return found;
}

/** Price nearest the target within ±TOLERANCE (ties → the earlier row), else null. */
export function priceNear(points: readonly PricePoint[], targetMs: number): number | null {
  let best: PricePoint | null = null;
  for (const p of points) {
    const gap = Math.abs(p.ms - targetMs);
    if (gap > TOLERANCE_MS) continue;
    if (best === null || gap < Math.abs(best.ms - targetMs)) best = p;
  }
  return best?.div ?? null;
}

export function pctMove(pre: number | null, later: number | null): number | null {
  if (pre === null || later === null || !(pre > 0) || !(later > 0)) return null;
  return (later / pre - 1) * 100;
}

export interface ItemMoves {
  preDiv: number | null;
  points: Record<HorizonKey, ImpactPoint>;
}

export function itemMoves(points: readonly PricePoint[], patchMs: number, nowMs: number): ItemMoves {
  const preDiv = prePrice(points, patchMs);
  const at = (key: HorizonKey): ImpactPoint => {
    if (!horizonDue(patchMs, nowMs, key)) return { div: null, pct: null };
    const div = priceNear(points, horizonTargetMs(patchMs, key));
    return { div: div !== null && div > 0 ? div : null, pct: pctMove(preDiv, div) };
  };
  return { preDiv: preDiv !== null && preDiv > 0 ? preDiv : null, points: { h24: at("h24"), h72: at("h72"), d7: at("d7") } };
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Median % per horizon over the items that have one; n = how many did. */
export function categoryMedians(moves: readonly ItemMoves[]): Record<HorizonKey, { pct: number | null; n: number }> {
  const at = (key: HorizonKey): { pct: number | null; n: number } => {
    const pcts = moves.map((m) => m.points[key].pct).filter((p): p is number => p !== null);
    return { pct: median(pcts), n: pcts.length };
  };
  return { h24: at("h24"), h72: at("h72"), d7: at("d7") };
}
