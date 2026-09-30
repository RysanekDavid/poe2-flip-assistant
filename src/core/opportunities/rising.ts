import type { HistoryPoint } from "../../api/scoutDemand";
import type { MarketUniqueItem } from "../../lib/marketUniquesContract";
import type { Budget, RisingSection, RisingUnique } from "../../lib/opportunitiesContract";
import { withinBudget } from "./budget";

/**
 * "Rising uniques" on Market › Opportunities: uniques worth at least RISING_MIN_VALUE_DIV whose
 * price climbs while their listing count shrinks. Read from data the app already holds (the shared
 * poe2scout demand fill with its PriceHistory points, priced like Market › Prices with the trade2
 * fallback), so it costs no trade2 request. A trend is only called on enough RECENT points; thin or
 * stale history is left out, never shown as a flat 0 or a guess. Listing counts are supply, not sales.
 */

export const RISING_MIN_VALUE_DIV = 1;
/** Fewer points than this cannot tell a trend from one noisy scrape. */
export const MIN_TREND_POINTS = 4;
/** A trend whose newest point is older than this describes a market that has moved on. */
export const MAX_NEWEST_POINT_AGE_MS = 48 * 3_600_000;
export const MIN_PRICE_RISE_PCT = 10;
export const MIN_LISTING_DROP_PCT = 10;
export const RISING_LIMIT = 10;

export interface UniqueTrend {
  priceChangePct: number;
  listedThen: number;
  listedNow: number;
  points: number;
  newestAtMs: number;
}

export type TrendVerdict =
  | { kind: "rising"; trend: UniqueTrend; score: number }
  | { kind: "flat"; trend: UniqueTrend }
  | { kind: "thin" }
  | { kind: "stale" };

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Older half vs newer half, by median — one spiked scrape cannot make a trend. */
function trendOf(points: readonly HistoryPoint[]): UniqueTrend {
  const half = Math.floor(points.length / 2);
  const older = points.slice(0, half);
  const newer = points.slice(half);
  const priceThen = median(older.map((p) => p.price));
  return {
    priceChangePct: ((median(newer.map((p) => p.price)) - priceThen) / priceThen) * 100,
    listedThen: Math.round(median(older.map((p) => p.quantity))),
    listedNow: Math.round(median(newer.map((p) => p.quantity))),
    points: points.length,
    newestAtMs: points[points.length - 1]!.atMs,
  };
}

/**
 * Classify one unique's recent points (oldest → newest, already inside scout's 7-day window).
 * `hasOlder` = scout has points for it, just none recent: that is stale, not thin.
 */
export function uniqueTrend(recent: readonly HistoryPoint[], hasOlder: boolean, nowMs: number): TrendVerdict {
  const priced = recent.filter((p) => p.price > 0);
  const newest = priced.at(-1);
  if (newest == null) return hasOlder ? { kind: "stale" } : { kind: "thin" };
  if (nowMs - newest.atMs > MAX_NEWEST_POINT_AGE_MS) return { kind: "stale" };
  if (priced.length < MIN_TREND_POINTS) return { kind: "thin" };
  const trend = trendOf(priced);
  const drop = trend.listedThen > 0 ? ((trend.listedThen - trend.listedNow) / trend.listedThen) * 100 : 0;
  if (trend.priceChangePct < MIN_PRICE_RISE_PCT || drop < MIN_LISTING_DROP_PCT) return { kind: "flat", trend };
  return { kind: "rising", trend, score: trend.priceChangePct * drop };
}

export interface RisingInput {
  /** Market › Prices' uniques: scout price, else the trade2 fallback, else null. */
  items: readonly MarketUniqueItem[];
  /** Per item id: scout's recent points (the demand fill's `recent`) and its newest point at any age. */
  history: ReadonlyMap<string, { recent: readonly HistoryPoint[]; newestAt: string | null }>;
  /** Newest scout point of any unique (any age); null = scout has none this league. */
  newestPointAt: string | null;
  budget: Budget;
  nowMs: number;
}

interface Tally {
  thin: number;
  stale: number;
  flat: number;
}

function toRow(item: MarketUniqueItem, trend: UniqueTrend, recent: readonly HistoryPoint[]): RisingUnique {
  if (item.valueDiv === null || item.valueSource === null) throw new Error(`rising: ${item.name} reached the list without a value`);
  return {
    id: item.id,
    name: item.name,
    base: item.base,
    icon: item.icon,
    valueDiv: item.valueDiv,
    valueSource: item.valueSource,
    priceChangePct: trend.priceChangePct,
    listedThen: trend.listedThen,
    listedNow: trend.listedNow,
    spark: recent.filter((p) => p.price > 0).map((p) => p.price),
    points: trend.points,
    newestAt: new Date(trend.newestAtMs).toISOString(),
  };
}

function ageText(ms: number): string {
  const h = Math.round(ms / 3_600_000);
  return h <= 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

/** One sentence on why nothing is listed — the data's own state, never a generic "nothing here". */
export function risingEmptyReason(i: { tally: Tally; overBudget: number; newestPointAt: string | null; capDiv: number | null; nowMs: number }): string {
  const cap = i.capDiv == null ? "" : ` (≤ ${i.capDiv.toLocaleString("en", { maximumFractionDigits: 1 })} Div)`;
  if (i.overBudget > 0) return `${i.overBudget} rising unique${i.overBudget === 1 ? " costs" : "s cost"} more than your budget${cap}.`;
  if (i.newestPointAt == null) return "poe2scout has no price history for uniques in this league yet, so there is no trend to show.";
  const age = i.nowMs - Date.parse(i.newestPointAt);
  if (age > MAX_NEWEST_POINT_AGE_MS) {
    return `poe2scout last logged a unique price ${ageText(age)} ago. A trend needs points from the last ${ageText(MAX_NEWEST_POINT_AGE_MS)}, so none is shown.`;
  }
  if (i.tally.flat === 0) return `Too few recent poe2scout points to call a trend for any unique worth ${RISING_MIN_VALUE_DIV} Div or more.`;
  return `No unique worth ${RISING_MIN_VALUE_DIV} Div or more is rising with fewer listings right now.`;
}

export function buildRising(input: RisingInput): Extract<RisingSection, { status: "ok" }> {
  const tally: Tally = { thin: 0, stale: 0, flat: 0 };
  const rising: Array<{ row: RisingUnique; score: number }> = [];
  for (const item of input.items) {
    if (item.valueDiv === null || item.valueDiv < RISING_MIN_VALUE_DIV) continue;
    const h = input.history.get(item.id);
    const recent = h?.recent ?? [];
    const verdict = uniqueTrend(recent, h?.newestAt != null, input.nowMs);
    if (verdict.kind !== "rising") {
      tally[verdict.kind] += 1;
      continue;
    }
    rising.push({ row: toRow(item, verdict.trend, recent), score: verdict.score });
  }
  const ranked = rising.sort((a, b) => b.score - a.score).map((r) => r.row);
  const { kept, hidden } = withinBudget(ranked, (r) => r.valueDiv, input.budget);
  const items = kept.slice(0, RISING_LIMIT);
  const emptyReason =
    items.length > 0 ? null : risingEmptyReason({ tally, overBudget: hidden, newestPointAt: input.newestPointAt, capDiv: input.budget.capDiv, nowMs: input.nowMs });
  return { status: "ok", items, overBudget: hidden, newestPointAt: input.newestPointAt, emptyReason };
}
