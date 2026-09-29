/*
 * "What is this?" rows: a catalog entity plus what a new player needs next — its live price (with
 * the time it was stored), where to sell it, and the ≥1 ex "pick up?" rule of thumb.
 */
import {
  SCOUT_UNIQUE_SOURCE,
  latestItemValuesUpdatedAt,
  uniqueValueMap,
} from "../../db/marketQueries";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";
import { scoutKey } from "../../lib/scoutKey";
import {
  isWorthPickingUp,
  type EntityLookup,
  type LookupPrice,
  type PickupHint,
  type SellRoute,
} from "../../lib/learnContract";
import { searchEntities } from "../entities/load";
import { exchangePriceMap } from "../entities/prices";
import type { EntityRow } from "../entities/schema";
import { resolveRates } from "../rates";

export const ENTITY_SEARCH_MAX_LIMIT = 20;

/**
 * Stackables with a trade2 static id trade on the Currency Exchange; uniques are individual items
 * listed on the trade site. Anything else we cannot route honestly, so it says "unknown".
 */
export function sellRouteOf(row: Pick<EntityRow, "kind" | "exchange_id">): SellRoute {
  if (row.exchange_id !== null) return "cx";
  if (row.kind === "unique") return "trade";
  return "unknown";
}

/** Rule of thumb only (isWorthPickingUp). Unknown without both numbers. */
export function pickupHintOf(div: number | null, exPerDiv: number | null): PickupHint {
  if (div === null || exPerDiv === null) return "unknown";
  return isWorthPickingUp(div * exPerDiv) ? "pick_up" : "low_value";
}

/** Every price source a lookup needs for one league, read once per request. */
export interface LookupPrices {
  exchange: ReadonlyMap<string, { div: number; fetchedAt: string }>;
  /** scoutKey(name) → Divine. */
  uniques: ReadonlyMap<string, number>;
  /** ISO time of the newest poe2scout unique refresh, or null when never refreshed. */
  uniquesAt: string | null;
  exPerDiv: number | null;
}

export function loadLookupPrices(league: string, nowMs: number): LookupPrices {
  const uniquesStamp = latestItemValuesUpdatedAt(league, SCOUT_UNIQUE_SOURCE);
  return {
    exchange: exchangePriceMap(league),
    uniques: uniqueValueMap(league),
    uniquesAt: uniquesStamp === null ? null : new Date(parseSqliteTimestamp(uniquesStamp)).toISOString(),
    exPerDiv: resolveRates(league, nowMs)?.rates.exaltPerDivine ?? null,
  };
}

function priceOf(row: EntityRow, prices: LookupPrices): LookupPrice | null {
  if (row.exchange_id !== null) {
    const hit = prices.exchange.get(row.exchange_id);
    return hit ? { div: hit.div, at: hit.fetchedAt, source: "ninja" } : null;
  }
  if (row.kind !== "unique" || prices.uniquesAt === null) return null;
  const div = prices.uniques.get(scoutKey(row.name));
  return div === undefined ? null : { div, at: prices.uniquesAt, source: "scout" };
}

export function toEntityLookup(row: EntityRow, prices: LookupPrices): EntityLookup {
  const price = priceOf(row, prices);
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    icon_url: row.icon_url,
    summary: row.summary,
    directions: row.directions,
    poe2db_url: row.poe2db_url,
    exchange_id: row.exchange_id,
    price,
    sell_route: sellRouteOf(row),
    pickup_hint: pickupHintOf(price?.div ?? null, prices.exPerDiv),
  };
}

/** Typeahead results priced for one league. */
export function lookupEntities(query: string, limit: number, prices: LookupPrices): EntityLookup[] {
  if (limit > ENTITY_SEARCH_MAX_LIMIT) throw new RangeError(`entity search limit ${limit} exceeds ${ENTITY_SEARCH_MAX_LIMIT}`);
  return searchEntities(query, limit).map((row) => toEntityLookup(row, prices));
}
