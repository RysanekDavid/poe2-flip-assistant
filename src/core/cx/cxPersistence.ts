import { CX_HOUR_SECONDS } from "../../api/cxClient";
import type { EdgeKind, ItemHourEdge } from "./cxMarketModel";

/**
 * Collapse an item's per-hour edges into the numbers a row is ranked on. Pure.
 *
 * A single hour is the digest's weakest signal: thin markets print one-hour VWAP spikes that are
 * gone by the time anyone acts. So the row's edge is the MEDIAN over the recent window, and
 * persistence counts how many of those hours actually cleared the threshold.
 */

export const SHORT_WINDOW_HOURS = 6;
export const LONG_WINDOW_HOURS = 24;

export interface CxItemStats {
  newestHour: number;
  kind: EdgeKind;
  /** Median net edge (%) over the hours of the 6h window that traded. */
  edgePct: number;
  edgeLatestPct: number | null;
  edgeMedian24Pct: number | null;
  /** Hours (of 6 / of 24) whose net edge was ≥ the threshold; hours without trades count as misses. */
  persistence6: number;
  persistence24: number;
  netDivPerUnit: number;
  /** Mean item units/hour on the slower leg over the 6h window, silent hours counted as 0. */
  slowerUnitsPerHour: number;
  midDiv: number;
  bandDiv: { low: number; high: number } | null;
  buy: ItemHourEdge["buy"];
  sell: ItemHourEdge["sell"];
  feeGoldPerUnit: number;
  feeDivPerUnit: number | null;
  feeComplete: boolean;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function inWindow(edges: readonly ItemHourEdge[], newestHour: number, hours: number): ItemHourEdge[] {
  const from = newestHour - (hours - 1) * CX_HOUR_SECONDS;
  return edges.filter((e) => e.hour >= from && e.hour <= newestHour);
}

/**
 * Stats for one item, or null when it did not trade at all inside the short window — an item
 * whose last trade was 20 hours ago has no current market to quote.
 *
 * `newestHour` is the league's newest stored digest hour, NOT the item's: an item that went
 * silent must lose persistence for the hours it missed.
 */
export function aggregateItem(
  edges: readonly ItemHourEdge[],
  newestHour: number,
  thresholdPct: number,
): CxItemStats | null {
  const short = inWindow(edges, newestHour, SHORT_WINDOW_HOURS);
  if (short.length === 0) return null;
  const long = inWindow(edges, newestHour, LONG_WINDOW_HOURS);
  const latest = short.reduce((x, y) => (y.hour > x.hour ? y : x));
  const held = (list: readonly ItemHourEdge[]): number => list.filter((e) => e.netPct >= thresholdPct).length;

  return {
    newestHour,
    kind: latest.kind,
    edgePct: median(short.map((e) => e.netPct))!,
    edgeLatestPct: latest.hour === newestHour ? latest.netPct : null,
    edgeMedian24Pct: median(long.map((e) => e.netPct)),
    persistence6: held(short),
    persistence24: held(long),
    netDivPerUnit: median(short.map((e) => e.netDivPerUnit))!,
    slowerUnitsPerHour: short.reduce((sum, e) => sum + e.slowerUnits, 0) / SHORT_WINDOW_HOURS,
    midDiv: latest.midDiv,
    bandDiv: latest.bandDiv,
    buy: latest.buy,
    sell: latest.sell,
    feeGoldPerUnit: latest.feeGoldPerUnit,
    feeDivPerUnit: latest.feeDivPerUnit,
    feeComplete: latest.feeComplete,
  };
}
