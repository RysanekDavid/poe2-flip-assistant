import { CX_HOUR_SECONDS } from "../../api/cxClient";
import type { EdgeIssue, EdgeKind, HourEdge, ItemHour, LegPrice } from "./cxEdges";

/**
 * Collapse an item's per-hour results into the numbers a row is ranked on. Pure.
 *
 * A single hour is the digest's weakest signal: thin markets print one-hour VWAP spikes that are
 * gone by the time anyone acts. The window rules therefore never CENSOR a bad hour:
 *  - any implausible hour in the 6h window marks the whole item implausible (a market that
 *    printed +70% an hour ago is not trustworthy at +45% now);
 *  - the edge is the median over ALL six slots, invalid and silent hours counting as 0;
 *  - fewer than MIN_VALID_HOURS valid hours → no edge at all (`sporadic`);
 *  - persistence counts only valid hours at or above the threshold.
 */

export const SHORT_WINDOW_HOURS = 6;
export const LONG_WINDOW_HOURS = 24;
/** A 6h "median" of fewer valid hours than this is one or two prints, not a market. */
export const MIN_VALID_HOURS = 3;
/** An edge is published (ranked, logged for outcomes) only when it held this many of 6 hours. */
export const MIN_HELD_HOURS = 4;

/** The observed edge over the window. */
export interface CxEdgeStats {
  kind: EdgeKind;
  /** Median net edge (%) over all 6 slots, invalid/silent hours as 0. */
  edgePct: number;
  edgeLatestPct: number | null;
  /** Same rule over the 24 slots of the long window. */
  edgeMedian24Pct: number | null;
  /** Hours (of 6 / of 24) with a valid net edge ≥ the threshold. */
  persistence6: number;
  persistence24: number;
  validHours6: number;
  /** Median over all 6 slots, like edgePct. */
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
  /** Null when the window supports no edge — `issue` says why. */
  edge: CxEdgeStats | null;
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

/** Median over `slots` slots: the valid hours' values, every other slot counted as 0. */
function slotMedian(values: readonly number[], slots: number): number {
  return median([...values, ...Array<number>(Math.max(0, slots - values.length)).fill(0)])!;
}

function edgeStats(short: readonly ItemHour[], long: readonly ItemHour[], newestHour: number, thresholdPct: number): CxEdgeStats {
  const valid = validOf(short);
  const valid24 = validOf(long);
  const latest = newest(valid);
  const held = (list: readonly ValidHour[]): number => list.filter((h) => h.edge.netPct >= thresholdPct).length;
  return {
    kind: latest.edge.kind,
    edgePct: slotMedian(valid.map((h) => h.edge.netPct), SHORT_WINDOW_HOURS),
    edgeLatestPct: latest.hour === newestHour ? latest.edge.netPct : null,
    edgeMedian24Pct: slotMedian(valid24.map((h) => h.edge.netPct), LONG_WINDOW_HOURS),
    persistence6: held(valid),
    persistence24: held(valid24),
    validHours6: valid.length,
    netDivPerUnit: slotMedian(valid.map((h) => h.edge.netDivPerUnit), SHORT_WINDOW_HOURS),
    slowerUnitsPerHour: valid.reduce((sum, h) => sum + h.edge.slowerUnits, 0) / SHORT_WINDOW_HOURS,
    buy: latest.edge.buy,
    sell: latest.edge.sell,
    legsHour: latest.hour,
    feeGoldPerUnit: latest.edge.feeGoldPerUnit,
    feeDivPerUnit: latest.edge.feeDivPerUnit,
    feeComplete: latest.edge.feeComplete,
  };
}

/** Why the short window supports no edge, or null when it does. */
function windowIssue(short: readonly ItemHour[]): { issue: EdgeIssue; raw: number | null } | null {
  const implausible = short.filter((h) => h.issue === "implausible");
  if (implausible.length > 0) return { issue: "implausible", raw: newest(implausible).rawNetPct };
  const valid = validOf(short).length;
  if (valid >= MIN_VALID_HOURS) return null;
  if (valid > 0) return { issue: "sporadic", raw: null };
  const latest = newest(short);
  return { issue: latest.issue ?? "sporadic", raw: latest.rawNetPct };
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
  const problem = windowIssue(short);
  return {
    newestHour,
    midDiv: latest.midDiv,
    bandDiv: latest.bandDiv,
    marketUnitsPerHour: short.reduce((sum, h) => sum + h.marketUnits, 0) / SHORT_WINDOW_HOURS,
    edge: problem == null ? edgeStats(short, inWindow(hours, newestHour, LONG_WINDOW_HOURS), newestHour, thresholdPct) : null,
    issue: problem?.issue ?? null,
    rawNetPct: problem?.raw ?? null,
  };
}

/** Div/hour the slower leg moved over the window — the rank gate's liquidity. */
export function slowerLegDivPerHour(stats: CxItemStats): number {
  return stats.edge == null ? 0 : stats.edge.slowerUnitsPerHour * stats.midDiv;
}

/**
 * The single rank gate for observed edges: held ≥ MIN_HELD_HOURS of 6 AND the slower leg moved
 * at least `minDivPerHour` on average. Scoring (flipModel) and the outcome log both use this.
 */
export function isPublishable(stats: CxItemStats, minDivPerHour: number): boolean {
  return stats.edge != null && stats.edge.persistence6 >= MIN_HELD_HOURS && slowerLegDivPerHour(stats) >= minDivPerHour;
}
