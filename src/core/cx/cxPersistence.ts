import { CX_HOUR_SECONDS } from "../../api/cxClient";
import type { EdgeIssue, EdgeKind, HourEdge, ItemHour, LegPrice } from "./cxEdges";

/**
 * Collapse an item's per-hour results into the numbers a row is ranked on. Pure.
 *
 * A single hour is the digest's weakest signal: thin markets print one-hour VWAP spikes that are
 * gone by the time anyone acts. So the edge is the MEDIAN over the recent window's valid hours,
 * and persistence counts how many hours actually cleared the threshold — an hour whose edge
 * failed a guard (thin, coarse, implausible…) is a miss, never a hit.
 */

export const SHORT_WINDOW_HOURS = 6;
export const LONG_WINDOW_HOURS = 24;

/** The observed edge, from the window's valid hours only. */
export interface CxEdgeStats {
  kind: EdgeKind;
  /** Median net edge (%) over the valid hours of the 6h window. */
  edgePct: number;
  edgeLatestPct: number | null;
  edgeMedian24Pct: number | null;
  /** Hours (of 6 / of 24) with a valid net edge ≥ the threshold. */
  persistence6: number;
  persistence24: number;
  netDivPerUnit: number;
  /** Mean item units/hour on the slower leg over the 6h window, other hours counted as 0. */
  slowerUnitsPerHour: number;
  /** The newest valid hour's legs — "last hour", not the median. */
  buy: LegPrice;
  sell: LegPrice;
  legsHour: number;
  feeGoldPerUnit: number;
  feeDivPerUnit: number | null;
  feeComplete: boolean;
}

export interface CxItemStats {
  newestHour: number;
  midDiv: number;
  bandDiv: { low: number; high: number } | null;
  /** Mean item units/hour through the most liquid quote over the 6h window. */
  marketUnitsPerHour: number;
  /** Null when no hour of the short window produced a valid edge. */
  edge: CxEdgeStats | null;
  /** Why `edge` is null (the latest hour's reason). */
  issue: EdgeIssue | null;
  /** Net % the rejected candidate would have shown — tooltip/debug only. */
  rawNetPct: number | null;
}

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function inWindow(hours: readonly ItemHour[], newestHour: number, span: number): ItemHour[] {
  const from = newestHour - (span - 1) * CX_HOUR_SECONDS;
  return hours.filter((h) => h.hour >= from && h.hour <= newestHour);
}

type ValidHour = ItemHour & { edge: HourEdge };
const validOf = (hours: readonly ItemHour[]): ValidHour[] => hours.filter((h): h is ValidHour => h.edge != null);
const newest = <T extends { hour: number }>(list: readonly T[]): T => list.reduce((x, y) => (y.hour > x.hour ? y : x));

function edgeStats(short: readonly ItemHour[], long: readonly ItemHour[], newestHour: number, thresholdPct: number): CxEdgeStats | null {
  const valid = validOf(short);
  if (valid.length === 0) return null;
  const valid24 = validOf(long);
  const latest = newest(valid);
  const held = (list: readonly ValidHour[]): number => list.filter((h) => h.edge.netPct >= thresholdPct).length;
  return {
    kind: latest.edge.kind,
    edgePct: median(valid.map((h) => h.edge.netPct))!,
    edgeLatestPct: latest.hour === newestHour ? latest.edge.netPct : null,
    edgeMedian24Pct: median(valid24.map((h) => h.edge.netPct)),
    persistence6: held(valid),
    persistence24: held(valid24),
    netDivPerUnit: median(valid.map((h) => h.edge.netDivPerUnit))!,
    slowerUnitsPerHour: valid.reduce((sum, h) => sum + h.edge.slowerUnits, 0) / SHORT_WINDOW_HOURS,
    buy: latest.edge.buy,
    sell: latest.edge.sell,
    legsHour: latest.hour,
    feeGoldPerUnit: latest.edge.feeGoldPerUnit,
    feeDivPerUnit: latest.edge.feeDivPerUnit,
    feeComplete: latest.edge.feeComplete,
  };
}

/**
 * Stats for one item, or null when it did not trade at all inside the short window.
 * `newestHour` is the league's newest stored hour, NOT the item's: an item that went silent
 * must lose persistence for the hours it missed.
 */
export function aggregateItem(hours: readonly ItemHour[], newestHour: number, thresholdPct: number): CxItemStats | null {
  const short = inWindow(hours, newestHour, SHORT_WINDOW_HOURS);
  if (short.length === 0) return null;
  const latest = newest(short);
  const edge = edgeStats(short, inWindow(hours, newestHour, LONG_WINDOW_HOURS), newestHour, thresholdPct);
  return {
    newestHour,
    midDiv: latest.midDiv,
    bandDiv: latest.bandDiv,
    marketUnitsPerHour: short.reduce((sum, h) => sum + h.marketUnits, 0) / SHORT_WINDOW_HOURS,
    edge,
    issue: edge == null ? latest.issue : null,
    rawNetPct: edge == null ? latest.rawNetPct : null,
  };
}
