import { CX_HOUR_SECONDS } from "../../api/cxClient";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";
import type { NinjaPricePoint, StoredShadowPrice } from "../../db/cxShadowQueries";
import { CX_PRICE_METHODS, type CxPriceMethod } from "./cxPricing";

/**
 * CX-derived shadow prices vs poe.ninja, per item-hour — the evidence for the cutover decision.
 *
 * A shadow hour H (digest next_change_id, the END of the traded hour) is paired with the newest
 * ninja snapshot written in (H − 1h, H + 1h]. ninja republishes about hourly and its dedupe keeps a
 * row at least every ~55 min, so every listed item has a point in that window; the slack also
 * absorbs ninja's own lag behind the digest. Deviation = cx / ninja − 1.
 */

export const NINJA_PAIR_WINDOW_SECONDS = CX_HOUR_SECONDS;
export const SHADOW_OUTLIER_LIMIT = 20;
/** Item lists (only-in-one-source) are capped in the JSON so the endpoint stays small. */
export const SHADOW_LIST_LIMIT = 100;

/** Traded item-hours split by the Divine value filled on the priced leg — thin prints are noisy. */
export const SHADOW_LIQUIDITY_TIERS = [
  { tier: "<1 Div/h", min: 0, max: 1 },
  { tier: "1–10 Div/h", min: 1, max: 10 },
  { tier: "≥10 Div/h", min: 10, max: Infinity },
] as const;

export interface DeviationStats {
  /** Item-hours compared. */
  n: number;
  /** Median |cx/ninja − 1| in percent; null when n = 0. */
  medianAbsPct: number | null;
  p90AbsPct: number | null;
  /** Median signed (cx/ninja − 1) in percent: negative = CX reads cheaper than ninja. */
  medianSignedPct: number | null;
}

export interface ShadowOutlier {
  exchangeId: string;
  name: string;
  /** Hours with both a traded CX price and a ninja price. */
  hours: number;
  medianAbsPct: number;
  medianSignedPct: number;
  /** Newest compared hour's values. */
  cxDiv: number;
  ninjaDiv: number;
  method: CxPriceMethod;
  /** Median Divine traded per hour on the legs the CX price used. */
  medianVolumeDiv: number;
}

export interface ShadowItemRef {
  exchangeId: string;
  name: string;
}

export interface CxShadowReport {
  league: string;
  /** Requested window length and the digest hours (next_change_id) actually covered. */
  hoursRequested: number;
  fromHour: number | null;
  toHour: number | null;
  /** Digest hours the shadow computed in the window (an hour may price nothing). */
  hoursComputed: number;
  coverage: {
    /** Items with at least one TRADED (direct/bridge) CX price in the window. */
    cxTraded: number;
    /** Items the CX shadow only ever carried in the window. */
    cxCarriedOnly: number;
    ninja: number;
    both: number;
    /** Digest ids with fills in the window but no catalog exchange id (fix: npm run sync:entities). */
    unmapped: Array<{ digestId: string; name: string }>;
    ninjaOnly: ShadowItemRef[];
    cxOnly: ShadowItemRef[];
  };
  /** direct + bridge item-hours. */
  traded: DeviationStats;
  byMethod: Record<CxPriceMethod, DeviationStats>;
  /** Traded item-hours by liquidity tier (SHADOW_LIQUIDITY_TIERS order). */
  byLiquidity: Array<{ tier: string } & DeviationStats>;
  /** Worst items by median |deviation| over their traded hours. */
  outliers: ShadowOutlier[];
}

/** Linear-interpolated percentile of an ascending array; null when empty. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

function median(values: readonly number[]): number | null {
  return percentile([...values].sort((a, b) => a - b), 0.5);
}

export function deviationStats(devs: readonly number[]): DeviationStats {
  const abs = devs.map((d) => Math.abs(d) * 100).sort((a, b) => a - b);
  const signed = median(devs);
  return {
    n: devs.length,
    medianAbsPct: percentile(abs, 0.5),
    p90AbsPct: percentile(abs, 0.9),
    medianSignedPct: signed == null ? null : signed * 100,
  };
}

/** Per item: ninja points as [epoch seconds, Divine], ascending. */
function ninjaSeries(points: readonly NinjaPricePoint[]): Map<string, Array<[number, number]>> {
  const out = new Map<string, Array<[number, number]>>();
  for (const p of points) {
    if (!(p.priceDiv > 0)) continue;
    const series = out.get(p.itemId) ?? [];
    series.push([parseSqliteTimestamp(p.fetchedAt) / 1000, p.priceDiv]);
    out.set(p.itemId, series);
  }
  for (const series of out.values()) series.sort((a, b) => a[0] - b[0]);
  return out;
}

/** The ninja price paired with shadow hour `hour`, or null when ninja wrote nothing in the window. */
export function ninjaAt(series: ReadonlyArray<readonly [number, number]> | undefined, hour: number): number | null {
  if (series == null) return null;
  let found: number | null = null;
  for (const [at, price] of series) {
    if (at > hour + NINJA_PAIR_WINDOW_SECONDS) break;
    if (at > hour - NINJA_PAIR_WINDOW_SECONDS) found = price;
  }
  return found;
}

interface Pair {
  row: StoredShadowPrice;
  ninja: number;
  dev: number;
}

function pairRows(shadow: readonly StoredShadowPrice[], ninja: Map<string, Array<[number, number]>>): Pair[] {
  const pairs: Pair[] = [];
  for (const row of shadow) {
    const n = ninjaAt(ninja.get(row.exchangeId), row.hour);
    if (n == null || !(row.priceDiv > 0)) continue;
    pairs.push({ row, ninja: n, dev: row.priceDiv / n - 1 });
  }
  return pairs;
}

function outliers(pairs: readonly Pair[], nameOf: (id: string) => string): ShadowOutlier[] {
  const byItem = new Map<string, Pair[]>();
  for (const p of pairs) {
    if (p.row.method === "carried") continue;
    byItem.set(p.row.exchangeId, [...(byItem.get(p.row.exchangeId) ?? []), p]);
  }
  const rows: ShadowOutlier[] = [];
  for (const [id, list] of byItem) {
    const newest = list.reduce((a, b) => (b.row.hour > a.row.hour ? b : a));
    rows.push({
      exchangeId: id,
      name: nameOf(id),
      hours: list.length,
      medianAbsPct: (median(list.map((p) => Math.abs(p.dev))) ?? 0) * 100,
      medianSignedPct: (median(list.map((p) => p.dev)) ?? 0) * 100,
      cxDiv: newest.row.priceDiv,
      ninjaDiv: newest.ninja,
      method: newest.row.method,
      medianVolumeDiv: median(list.map((p) => p.row.volumeDiv)) ?? 0,
    });
  }
  return rows.sort((a, b) => b.medianAbsPct - a.medianAbsPct).slice(0, SHADOW_OUTLIER_LIMIT);
}

export interface ShadowReportInput {
  league: string;
  hoursRequested: number;
  shadow: readonly StoredShadowPrice[];
  ninja: readonly NinjaPricePoint[];
  unmapped: Array<{ digestId: string; name: string }>;
  hoursComputed: number;
  nameOf: (exchangeId: string) => string;
}

function refs(ids: Iterable<string>, nameOf: (id: string) => string): ShadowItemRef[] {
  return [...ids]
    .map((exchangeId) => ({ exchangeId, name: nameOf(exchangeId) }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, SHADOW_LIST_LIMIT);
}

function coverage(input: ShadowReportInput): CxShadowReport["coverage"] {
  const traded = new Set(input.shadow.filter((r) => r.method !== "carried").map((r) => r.exchangeId));
  const anyCx = new Set(input.shadow.map((r) => r.exchangeId));
  const ninja = new Set(input.ninja.filter((p) => p.priceDiv > 0).map((p) => p.itemId));
  return {
    cxTraded: traded.size,
    cxCarriedOnly: [...anyCx].filter((id) => !traded.has(id)).length,
    ninja: ninja.size,
    both: [...ninja].filter((id) => anyCx.has(id)).length,
    unmapped: input.unmapped.slice(0, SHADOW_LIST_LIMIT),
    ninjaOnly: refs([...ninja].filter((id) => !anyCx.has(id)), input.nameOf),
    cxOnly: refs([...anyCx].filter((id) => !ninja.has(id)), input.nameOf),
  };
}

/** Pure: the whole comparison from already-loaded rows. */
export function buildCxShadowReport(input: ShadowReportInput): CxShadowReport {
  const pairs = pairRows(input.shadow, ninjaSeries(input.ninja));
  const hours = [...new Set(input.shadow.map((r) => r.hour))].sort((a, b) => a - b);
  const devsOf = (methods: readonly CxPriceMethod[]): number[] =>
    pairs.filter((p) => methods.includes(p.row.method)).map((p) => p.dev);
  const byMethod = Object.fromEntries(CX_PRICE_METHODS.map((m) => [m, deviationStats(devsOf([m]))])) as Record<
    CxPriceMethod,
    DeviationStats
  >;
  return {
    league: input.league,
    hoursRequested: input.hoursRequested,
    fromHour: hours[0] ?? null,
    toHour: hours[hours.length - 1] ?? null,
    hoursComputed: input.hoursComputed,
    coverage: coverage(input),
    traded: deviationStats(devsOf(["direct", "bridge"])),
    byMethod,
    byLiquidity: SHADOW_LIQUIDITY_TIERS.map(({ tier, min, max }) => ({
      tier,
      ...deviationStats(
        pairs.filter((p) => p.row.method !== "carried" && p.row.volumeDiv >= min && p.row.volumeDiv < max).map((p) => p.dev),
      ),
    })),
    outliers: outliers(pairs, input.nameOf),
  };
}
