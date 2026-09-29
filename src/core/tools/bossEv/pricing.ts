import type { PricedItem } from "../../../api/types";
import {
  itemValuesAgeHours,
  latestSnapshots,
  lineageValueMap,
  priceHistory,
  SCOUT_LINEAGE_SOURCE,
  SCOUT_UNIQUE_SOURCE,
  scoutZeroKeys,
  uniqueValueMap,
} from "../../../db/marketQueries";
import { uniqueTradeValues, type UniqueTradeRow } from "../../../db/uniqueTradeQueries";
import { timestampAgeMs } from "../../../lib/sqliteTime";
import type { PoolRange, ResolvedPrice } from "../../../lib/tools/bossEvContract";
import { lootNinjaIds, type BossLootFile, type PriceRef } from "./schema";
import { tradeUnpricedNote } from "./tradeText";
import { scoutKey } from "../../../lib/scoutKey";

/** One exchange item as the latest poe.ninja snapshot has it. */
export interface NinjaQuote {
  div: number;
  name: string;
  icon: string | null;
  /** Age of THIS item's newest row, not the league's: an item ninja stopped listing keeps an old row. */
  ageHours: number | null;
  /** ninja's traded volume for the item (its liquidity), as the snapshot stores it. */
  volume: number;
}

/** Everything pricing needs, read once per request so the math below stays pure. */
export interface PriceInputs {
  ninja: ReadonlyMap<string, NinjaQuote>;
  /** poe2scout unique prices, keyed by scoutKey (case, apostrophe and diacritic insensitive). */
  scout: ReadonlyMap<string, number>;
  scoutAgeHours: number | null;
  /** poe2scout lineage-gem prices, keyed by scoutKey; aged on their own refresh. */
  lineage: ReadonlyMap<string, number>;
  lineageAgeHours: number | null;
  /** scoutKeys poe2scout lists at 0 — "listed at 0" rather than "not listed". */
  scoutZero: ReadonlySet<string>;
  /** trade2 fallback checks of the uniques scout does not price, keyed by scoutKey. */
  trade: ReadonlyMap<string, UniqueTradeRow>;
  nowMs: number;
}

export interface PriceLookup {
  price(ref: PriceRef): ResolvedPrice | null;
  /** The spread of a pool line; null for any other kind, or when no member is priced. */
  pool(ref: PriceRef): PoolRange | null;
  /** True when poe2scout lists the name with no current price (0), false when it does not list it. */
  scoutListedAtZero(name: string): boolean;
  /** Why the trade2 fallback has no price for a unique (never searched, failed, too few listings). */
  tradeUnpriced(name: string): string;
  /** Display name, icon and traded volume for an exchange item id, or null when ninja does not list it. */
  item(itemId: string): { name: string; icon: string | null; volume: number } | null;
}

const HOUR_MS = 3_600_000;

function median(sorted: readonly number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Min/median/max over the pool members ninja prices. The weights are unpublished, so no member is
 * favoured; members ninja does not list are named, never counted as 0.
 */
export function poolRange(ref: PriceRef, inputs: PriceInputs): PoolRange | null {
  if (ref.kind !== "pool") return null;
  const priced = ref.members.flatMap((m) => {
    const quote = inputs.ninja.get(m.itemId);
    return quote ? [{ div: quote.div, ageHours: quote.ageHours }] : [];
  });
  if (priced.length === 0) return null;
  const divs = priced.map((p) => p.div).sort((a, b) => a - b);
  const ages = priced.flatMap((p) => (p.ageHours == null ? [] : [p.ageHours]));
  return {
    minDiv: divs[0]!,
    medianDiv: median(divs),
    maxDiv: divs[divs.length - 1]!,
    priced: priced.length,
    total: ref.members.length,
    unpricedMembers: ref.members.filter((m) => !inputs.ninja.has(m.itemId)).map((m) => m.name),
    ageHours: ages.length > 0 ? Math.max(...ages) : null,
  };
}

/** A curated reference → a Divine price with source and age, or null when nothing prices it. */
export function resolvePrice(ref: PriceRef, inputs: PriceInputs): ResolvedPrice | null {
  switch (ref.kind) {
    case "ninja": {
      const quote = inputs.ninja.get(ref.itemId);
      return quote ? { div: quote.div, source: "ninja", ageHours: quote.ageHours } : null;
    }
    case "pool": {
      // the pool's floor: an unknown-weight pick is worth at least its cheapest member
      const range = poolRange(ref, inputs);
      return range ? { div: range.minDiv, source: "ninja", ageHours: range.ageHours } : null;
    }
    case "scout": {
      const key = scoutKey(ref.name);
      const unique = inputs.scout.get(key);
      if (unique != null && unique > 0) return { div: unique, source: "scout", ageHours: inputs.scoutAgeHours };
      const gem = inputs.lineage.get(key);
      if (gem != null && gem > 0) return { div: gem, source: "scout", ageHours: inputs.lineageAgeHours };
      return tradePrice(inputs.trade.get(key), inputs.nowMs);
    }
    case "manual":
      return { div: ref.div, source: "manual", ageHours: (inputs.nowMs - Date.parse(`${ref.asOf}T00:00:00Z`)) / HOUR_MS };
    case "unpriced":
      return null;
  }
}

/** The trade2 fallback, read only after both scout lists: a positive observed price, aged from its search. */
function tradePrice(row: UniqueTradeRow | undefined, nowMs: number): ResolvedPrice | null {
  const seen = row?.observed;
  if (seen?.div == null || !(seen.div > 0)) return null;
  return { div: seen.div, source: "trade", ageHours: (nowMs - seen.atMs) / HOUR_MS, listed: seen.listed, samples: seen.samples };
}

export function priceLookup(inputs: PriceInputs): PriceLookup {
  return {
    price: (ref) => resolvePrice(ref, inputs),
    pool: (ref) => poolRange(ref, inputs),
    scoutListedAtZero: (name) => inputs.scoutZero.has(scoutKey(name)),
    tradeUnpriced: (name) => tradeUnpricedNote(inputs.trade.get(scoutKey(name)) ?? null, inputs.nowMs),
    item: (itemId) => {
      const quote = inputs.ninja.get(itemId);
      return quote ? { name: quote.name, icon: quote.icon, volume: quote.volume } : null;
    },
  };
}

/** Every exchange item id the curated file prices (entry items, recipe parts, ninja loot). */
export function referencedNinjaIds(file: BossLootFile): Set<string> {
  const ids = new Set<string>();
  for (const boss of file.bosses) {
    for (const tier of boss.tiers) {
      for (const line of tier.entry) {
        ids.add(line.itemId);
        for (const part of line.craftFrom ?? []) ids.add(part.itemId);
      }
      for (const id of lootNinjaIds(tier.loot)) ids.add(id);
    }
  }
  return ids;
}

/**
 * Read the league's market once. Only the referenced ids get a per-item age lookup (one indexed
 * query each, ~40 items) — the league-wide latestFetchedAt would call a delisted item fresh.
 */
export function loadPriceInputs(
  league: string,
  ids: ReadonlySet<string>,
  nowMs: number = Date.now(),
  // the farm route already read the league's latest snapshots for the mechanic heat — reuse them
  snapshots: readonly PricedItem[] = latestSnapshots(league),
): PriceInputs {
  const ninja = new Map<string, NinjaQuote>();
  for (const row of snapshots) {
    if (!ids.has(row.itemId) || !(row.baseValue > 0)) continue;
    const newest = priceHistory(league, row.itemId, 1)[0];
    ninja.set(row.itemId, {
      div: row.baseValue,
      name: row.itemName,
      icon: row.icon,
      ageHours: newest ? timestampAgeMs(newest.fetchedAt, nowMs) / HOUR_MS : null,
      volume: row.volume,
    });
  }
  return {
    ninja,
    scout: byScoutKey(uniqueValueMap(league)),
    scoutAgeHours: itemValuesAgeHours(league, SCOUT_UNIQUE_SOURCE),
    lineage: byScoutKey(lineageValueMap(league)),
    lineageAgeHours: itemValuesAgeHours(league, SCOUT_LINEAGE_SOURCE),
    scoutZero: new Set([...scoutZeroKeys(league)].map(scoutKey)),
    trade: uniqueTradeValues(league),
    nowMs,
  };
}

/** Re-key an item_values map (lowercased names) by scoutKey, so curated spellings still match. */
export function byScoutKey(values: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  for (const [k, v] of values) {
    const key = scoutKey(k);
    // two stored names folding onto one key would price a drop from whichever came last
    if (out.has(key)) throw new Error(`poe2scout names collide after normalising: "${k}" and another row both read as "${key}"`);
    out.set(key, v);
  }
  return out;
}
