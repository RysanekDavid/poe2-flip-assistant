import { CX_HOUR_SECONDS } from "../../api/cxClient";
import { config } from "../../config/env";
import { cxItemNames, cxMarketsSince, ingestedCxHours, newestCxHour, type CxMarketRow } from "../../db/cxMarketQueries";
import { hourEdges, type ItemHour } from "./cxEdges";
import { modelParams, type ModelParams } from "./cxMarketModel";
import { aggregateItem, LONG_WINDOW_HOURS, MIN_HELD_HOURS, SHORT_WINDOW_HOURS, type CxItemStats } from "./cxPersistence";

/**
 * The stored exchange history of one league, keyed by OUR item ids (poe.ninja slugs) so Top
 * Flips can attach it to its rows.
 *
 * Identity: GGG base id → name (cx_items, resolved from RePoE at ingest) → the ninja line with
 * that exact name. Nothing fuzzy: a name that two exchange ids share ANYWHERE in cx_items (not
 * just in this window) is ambiguous and dropped, and every miss is counted in `coverage` so a
 * mapping regression is visible, not silent.
 */

/** Past this, the newest stored hour is no longer "the market now" and rows fall back. */
const CX_MAX_AGE_MS = 3 * 60 * 60 * 1000;

export interface CxCoverage {
  /** Exchange items that traded in the short window. */
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

/** One memo slot PER LEAGUE: several polled leagues must not evict each other every request. */
const memo = new Map<string, { key: string; stats: Map<string, CxItemStats> }>();

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
  params: ModelParams,
  thresholdPct: number,
): Map<string, CxItemStats> {
  const perItem = new Map<string, ItemHour[]>();
  for (const [hour, hourRows] of groupByHour(rows)) {
    for (const [item, result] of hourEdges(hour, hourRows, params)) {
      const list = perItem.get(item) ?? [];
      list.push(result);
      perItem.set(item, list);
    }
  }
  const out = new Map<string, CxItemStats>();
  for (const [item, hours] of perItem) {
    const stats = aggregateItem(hours, newestHour, thresholdPct);
    if (stats != null) out.set(item, stats);
  }
  return out;
}

/**
 * Per-base-id stats of one league at `newestHour`, memoized per league. The key carries how many
 * hours of the window are stored: a backfill that lands OLDER hours after the newest one must
 * invalidate it, or persistence would stay computed on the partial window.
 */
export function leagueStats(league: string, newestHour: number): Map<string, CxItemStats> {
  const params = modelParams();
  const fromHour = newestHour - (LONG_WINDOW_HOURS - 1) * CX_HOUR_SECONDS;
  const stored = ingestedCxHours(league, fromHour).size;
  const key = `${newestHour}|${stored}|${config.cx.edgeThresholdPct}|${JSON.stringify(params)}`;
  const hit = memo.get(league);
  if (hit?.key === key) return hit.stats;
  const rows = cxMarketsSince(league, fromHour);
  const stats = statsFromRows(rows, newestHour, params, config.cx.edgeThresholdPct);
  memo.set(league, { key, stats });
  return stats;
}

/** Keys that occur more than once. */
function duplicates(keys: Iterable<string>): Set<string> {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const k of keys) (seen.has(k) ? dup : seen).add(k);
  return dup;
}

/**
 * GGG base id → ninja item id, by exact name, with every miss counted. Pure.
 * `names` must be ALL resolved names (cx_items), so ambiguity is judged globally.
 */
export function resolveItemIds(
  baseIds: Iterable<string>,
  names: ReadonlyMap<string, string>,
  ninja: ReadonlyArray<{ itemId: string; itemName: string }>,
): { itemIdOf: Map<string, string>; coverage: CxCoverage } {
  const coverage: CxCoverage = { cxItems: 0, mapped: 0, unnamed: 0, unmatched: 0, ambiguous: 0 };
  const cxDup = duplicates(names.values());
  const ninjaDup = duplicates(ninja.map((n) => n.itemName));
  const ninjaByName = new Map(ninja.map((n) => [n.itemName, n.itemId]));
  const itemIdOf = new Map<string, string>();
  for (const baseId of baseIds) {
    coverage.cxItems++;
    const name = names.get(baseId);
    if (name == null) coverage.unnamed++;
    else if (cxDup.has(name) || ninjaDup.has(name)) coverage.ambiguous++;
    else {
      const itemId = ninjaByName.get(name);
      if (itemId == null) coverage.unmatched++;
      else itemIdOf.set(baseId, itemId);
    }
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

/** The rank gate's values, for the UI to quote instead of hardcoding them. */
export interface CxRankGate {
  minHeldHours: number;
  windowHours: number;
  minSlowerDivPerHour: number;
}

export function cxRankGate(): CxRankGate {
  return { minHeldHours: MIN_HELD_HOURS, windowHours: SHORT_WINDOW_HOURS, minSlowerDivPerHour: config.cx.liquidityRiskyDivH };
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
  const { byItemId, coverage } = mapToItemIds(leagueStats(league, newestHour), cxItemNames(), ninja);
  return { newestHour, byItemId, coverage };
}
