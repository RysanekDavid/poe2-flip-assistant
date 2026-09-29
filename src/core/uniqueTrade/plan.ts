import type { Listing } from "../../api/tradeListing";
import type { UniqueOption } from "../../api/tradeMeta";
import type { UniqueTradeRow } from "../../db/uniqueTradeQueries";
import type { TradeQuery } from "../../lib/tradeLink";
import { scoutKey } from "../../lib/scoutKey";
import { valueFromComparables } from "../comparableValuation";
import type { DivRates } from "../listingPrice";
import type { BossLootFile } from "../tools/bossEv/schema";

/*
 * trade2 fallback pricing for curated boss uniques poe2scout does not price — the pure half:
 * which names to search, how many searches this tick may spend, what to search, and how the
 * listings become one price. The poller job (run.ts) wires these to trade2 and the DB.
 */

/** Listings fetched per search: exactly one 10-id /fetch page, cheapest first. */
export const TRADE_COMPARABLES = 10;
/** Fewer usable listings than this after bait trimming is no price: one or two asks are not a market. */
export const TRADE_MIN_SAMPLES = 3;
/** A failed attempt is retried sooner than the daily refresh; a success waits the full refresh. */
export const TRADE_RETRY_AFTER_ERROR_MS = 2 * 3_600_000;
const HOUR_MS = 3_600_000;

/**
 * The curated uniques poe2scout is asked to price, in file order, one spelling per scoutKey.
 * Lineage gems are left out: scout's lineage list prices them.
 */
export function curatedTradeNames(file: BossLootFile): string[] {
  const byKey = new Map<string, string>();
  for (const boss of file.bosses) {
    for (const tier of boss.tiers) {
      for (const line of tier.loot) {
        if (line.priceRef.kind !== "scout" || line.lineage === true) continue;
        const key = scoutKey(line.priceRef.name);
        if (!byKey.has(key)) byKey.set(key, line.priceRef.name);
      }
    }
  }
  return [...byKey.values()];
}

/** When a stored unique may be searched again: sooner after a failure than after a success. */
export function dueAtMs(row: Pick<UniqueTradeRow, "checkedAtMs" | "error">, refreshMs: number): number {
  return row.checkedAtMs + (row.error != null ? Math.min(TRADE_RETRY_AFTER_ERROR_MS, refreshMs) : refreshMs);
}

/**
 * Names due a trade2 search: no positive scout price, and never searched or past their refresh.
 * Never-searched names first (curated order), then the longest-waiting, so every candidate gets
 * covered before any is repeated.
 */
export function pickCandidates(
  names: readonly string[],
  scoutPriced: ReadonlySet<string>,
  stored: ReadonlyMap<string, Pick<UniqueTradeRow, "checkedAtMs" | "error">>,
  nowMs: number,
  refreshMs: number,
): string[] {
  const due = names.flatMap((name, order) => {
    const key = scoutKey(name);
    if (scoutPriced.has(key)) return [];
    const row = stored.get(key);
    if (row && dueAtMs(row, refreshMs) > nowMs) return [];
    return [{ name, order, since: row ? row.checkedAtMs : -Infinity }];
  });
  return due.sort((a, b) => a.since - b.since || a.order - b.order).map((d) => d.name);
}

/**
 * Searches this tick may spend: at most `perTick`, and never past `capPerHour` counting every
 * attempt of the last rolling hour (restarts and back-to-back ticks included).
 */
export function searchSlots(recentChecksMs: readonly number[], nowMs: number, capPerHour: number, perTick: number): number {
  const lastHour = recentChecksMs.filter((t) => t > nowMs - HOUR_MS && t <= nowMs).length;
  return Math.max(0, Math.min(perTick, capPerHour - lastHour));
}

/** Spread the hourly cap over the 10-minute ticks, so the searches do not arrive as one burst. */
export const perTickOf = (capPerHour: number, tickMin: number): number => Math.max(1, Math.ceil((capPerHour * tickMin) / 60));

/**
 * trade2's own spelling and base type for a curated name (its /data/items catalog, matched by
 * scoutKey), or null when trade2 does not know the unique. A name listed on several bases searches
 * by name alone rather than guessing one base.
 */
export function tradeUniqueFor(name: string, catalog: readonly UniqueOption[]): UniqueOption | null {
  const key = scoutKey(name);
  const hits = catalog.filter((u) => scoutKey(u.name) === key);
  const first = hits[0];
  if (!first) return null;
  return new Set(hits.map((h) => h.type)).size === 1 ? first : { name: first.name, type: "" };
}

/** Uncorrupted (a boss drop never is), instant-buyout, priced listings of exactly this unique. */
export function uniqueTradeQuery(u: UniqueOption): TradeQuery {
  return { name: u.name, type: u.type || undefined, rarity: "unique", instantBuyout: true, corrupted: false };
}

export interface TradePrice {
  /** Per-item Divine price; null when fewer than TRADE_MIN_SAMPLES listings survive (never 0). */
  div: number | null;
  /** Live listings trade2 reported for the search. */
  listed: number;
  /** Listings the price stands on after bait trimming. */
  samples: number;
  /** Cheap outliers (bait) dropped. */
  dropped: number;
}

/**
 * The cheapest listings → one price: the snipe/valuation outlier rule (priceBook.referenceValue:
 * cheap bait under 30% of the rest's median dropped, at most three) and then the median of what
 * survives. Of the cheapest ten that is a low-side market price, not the asking-price tail.
 */
export function tradePriceFrom(listings: readonly Listing[], total: number, rates: DivRates): TradePrice {
  const v = valueFromComparables([...listings], total, rates);
  const listed = Math.max(total, listings.length);
  if (v.valueDiv == null || v.samples < TRADE_MIN_SAMPLES) return { div: null, listed, samples: v.samples, dropped: v.dropped };
  return { div: v.valueDiv, listed, samples: v.samples, dropped: v.dropped };
}
