import { CX_HOUR_SECONDS } from "../../api/cxClient";
import { config } from "../../config/env";
import { cxItemNames, cxMarketsSince, newestCxHour, type CxMarketRow } from "../../db/cxMarketQueries";
import { hourEdges, type ItemHourEdge } from "./cxMarketModel";
import { aggregateItem, LONG_WINDOW_HOURS, type CxItemStats } from "./cxPersistence";

/**
 * The stored exchange history of one league, keyed by OUR item ids (poe.ninja slugs) so Top
 * Flips can attach it to its rows.
 *
 * Identity: GGG base id → name (cx_items, resolved from RePoE at ingest) → the ninja line with
 * that exact name. Nothing fuzzy: a name two exchange ids share is ambiguous and dropped, and
 * every miss is counted in `coverage` so a mapping regression is visible, not silent.
 */

/** Past this, the newest stored hour is no longer "the market now" and rows fall back. */
const CX_MAX_AGE_MS = 3 * 60 * 60 * 1000;

export interface CxCoverage {
  /** Exchange items with a quotable market in the short window. */
  cxItems: number;
  mapped: number;
  /** Base ids the RePoE catalog had no name for. */
  unnamed: number;
  /** Named exchange items with no ninja line of that exact name. */
  unmatched: number;
  /** Names shared by several exchange ids, or by several ninja lines. */
  ambiguous: number;
}

export interface CxMarketView {
  newestHour: number;
  byItemId: Map<string, CxItemStats>;
  coverage: CxCoverage;
}

let memo: { key: string; stats: Map<string, CxItemStats> } | null = null;

/** Stored rows bucketed by digest hour. */
export function groupByHour(rows: readonly CxMarketRow[]): Map<number, CxMarketRow[]> {
  const out = new Map<number, CxMarketRow[]>();
  for (const r of rows) {
    const list = out.get(r.hour) ?? [];
    list.push(r);
    out.set(r.hour, list);
  }
  return out;
}

/** Per-base-id stats from raw stored rows. Pure — exported for the tests. */
export function statsFromRows(
  rows: readonly CxMarketRow[],
  newestHour: number,
  goldPerExalt: number,
  thresholdPct: number,
): Map<string, CxItemStats> {
  const perItem = new Map<string, ItemHourEdge[]>();
  for (const [hour, hourRows] of groupByHour(rows)) {
    for (const [item, edge] of hourEdges(hour, hourRows, goldPerExalt)) {
      const list = perItem.get(item) ?? [];
      list.push(edge);
      perItem.set(item, list);
    }
  }
  const out = new Map<string, CxItemStats>();
  for (const [item, edges] of perItem) {
    const stats = aggregateItem(edges, newestHour, thresholdPct);
    if (stats != null) out.set(item, stats);
  }
  return out;
}

function statsForLeague(league: string, newestHour: number): Map<string, CxItemStats> {
  const { goldPerExalt, edgeThresholdPct } = config.cx;
  const key = `${league}|${newestHour}|${goldPerExalt}|${edgeThresholdPct}`;
  if (memo?.key === key) return memo.stats;
  const rows = cxMarketsSince(league, newestHour - (LONG_WINDOW_HOURS - 1) * CX_HOUR_SECONDS);
  const stats = statsFromRows(rows, newestHour, goldPerExalt, edgeThresholdPct);
  memo = { key, stats };
  return stats;
}

function uniqueIndex<T>(entries: ReadonlyArray<[string, T]>): { unique: Map<string, T>; dup: Set<string> } {
  const unique = new Map<string, T>();
  const dup = new Set<string>();
  for (const [k, v] of entries) {
    if (unique.has(k) || dup.has(k)) {
      unique.delete(k);
      dup.add(k);
    } else unique.set(k, v);
  }
  return { unique, dup };
}

/** GGG base id → ninja item id, by exact name, with every miss counted. Pure. */
export function resolveItemIds(
  baseIds: Iterable<string>,
  names: ReadonlyMap<string, string>,
  ninja: ReadonlyArray<{ itemId: string; itemName: string }>,
): { itemIdOf: Map<string, string>; coverage: CxCoverage } {
  const coverage: CxCoverage = { cxItems: 0, mapped: 0, unnamed: 0, unmatched: 0, ambiguous: 0 };
  const named: Array<[string, string]> = [];
  for (const baseId of baseIds) {
    coverage.cxItems++;
    const name = names.get(baseId);
    if (name == null) coverage.unnamed++;
    else named.push([name, baseId]);
  }
  const cxByName = uniqueIndex(named);
  const ninjaByName = uniqueIndex(ninja.map((n): [string, string] => [n.itemName, n.itemId]));
  coverage.ambiguous = named.filter(([name]) => cxByName.dup.has(name) || ninjaByName.dup.has(name)).length;

  const itemIdOf = new Map<string, string>();
  for (const [name, baseId] of cxByName.unique) {
    if (ninjaByName.dup.has(name)) continue;
    const itemId = ninjaByName.unique.get(name);
    if (itemId == null) coverage.unmatched++;
    else itemIdOf.set(baseId, itemId);
  }
  coverage.mapped = itemIdOf.size;
  return { itemIdOf, coverage };
}

/** Attach base-id stats to ninja item ids by exact name. Pure — exported for the tests. */
export function mapToItemIds(
  stats: ReadonlyMap<string, CxItemStats>,
  names: ReadonlyMap<string, string>,
  ninja: ReadonlyArray<{ itemId: string; itemName: string }>,
): { byItemId: Map<string, CxItemStats>; coverage: CxCoverage } {
  const { itemIdOf, coverage } = resolveItemIds(stats.keys(), names, ninja);
  const byItemId = new Map<string, CxItemStats>();
  for (const [baseId, itemId] of itemIdOf) {
    const s = stats.get(baseId);
    if (s != null) byItemId.set(itemId, s);
  }
  return { byItemId, coverage };
}

/** Newest stored hour when it is recent enough to stand for "the market now", else null. */
export function freshNewestHour(league: string, nowMs: number): number | null {
  const newestHour = newestCxHour(league);
  return newestHour == null || nowMs - newestHour * 1000 > CX_MAX_AGE_MS ? null : newestHour;
}

/** The league's current exchange view, or null when it has no fresh stored history. */
export function loadCxMarketView(
  league: string,
  ninja: ReadonlyArray<{ itemId: string; itemName: string }>,
  nowMs: number = Date.now(),
): CxMarketView | null {
  const newestHour = freshNewestHour(league, nowMs);
  if (newestHour == null) return null;
  const { byItemId, coverage } = mapToItemIds(statsForLeague(league, newestHour), cxItemNames(), ninja);
  return { newestHour, byItemId, coverage };
}
