import type { TradeCred } from "../../api/tradeClient";
import type { Listing } from "../../api/tradeListing";
import { LIVE_LISTINGS_SHOWN, type ListingsResponse, type LiveListing } from "../../lib/opportunitiesContract";
import { scoutKey } from "../../lib/scoutKey";
import { spendReserved, type LiveLimiter } from "../tools/modpool/liveLimit";

/**
 * Live cheapest listings behind a Trade › Opportunities row: ONE trade2 search + ONE fetch per
 * click, through the shared governor (tradeClient). Nothing runs in the background. A shared cache
 * answers repeat clicks for free (listings are public, so every viewer may share them), a click on
 * a search already in flight waits for it for free, and each user's spent searches count against
 * the one live-lookup window they share with Mod pool live values (liveLimit).
 */

/** Cheapest listings go stale fast; five minutes still saves the repeat click and the second viewer. */
export const LISTINGS_CACHE_TTL_MS = 5 * 60_000;
const LISTINGS_CACHE_MAX = 200;

export interface ListingsCache {
  get(key: string, nowMs: number): ListingsResponse | null;
  set(key: string, body: ListingsResponse, nowMs: number): void;
  /** Searches in flight by key, so a second click on the same row never spends a second search. */
  inflight: Map<string, Promise<ListingsResponse>>;
}

/** A TTL cache with a size bound (oldest entry out first). */
export function createListingsCache(ttlMs: number = LISTINGS_CACHE_TTL_MS, max: number = LISTINGS_CACHE_MAX): ListingsCache {
  const entries = new Map<string, { body: ListingsResponse; atMs: number }>();
  return {
    inflight: new Map(),
    get(key, nowMs) {
      const hit = entries.get(key);
      if (!hit) return null;
      if (nowMs - hit.atMs >= ttlMs) {
        entries.delete(key);
        return null;
      }
      return { ...hit.body, cached: true };
    },
    set(key, body, nowMs) {
      entries.delete(key);
      entries.set(key, { body, atMs: nowMs });
      while (entries.size > max) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}

export const listingsCache: ListingsCache = createListingsCache();

export const listingsKey = (league: string, name: string, base: string | undefined): string => `${league}|${scoutKey(name)}|${scoutKey(base ?? "")}`;

function toLiveListing(l: Listing): LiveListing {
  return { price: l.price, account: l.account, online: l.online, indexed: l.indexed, mods: l.mods.slice(0, 12).map((m) => m.slice(0, 200)) };
}

export interface SearchResult {
  total: number;
  listings: Listing[];
  searchUrl: string;
}

export type ListingsOutcome =
  | { kind: "ok"; body: ListingsResponse }
  | { kind: "no-cred" }
  | { kind: "limited"; retryAfterSec: number };

export interface LookupDeps {
  cache: ListingsCache;
  limiter: LiveLimiter;
  /** The caller's stored POESESSID; only needed on a cache miss. */
  cred: TradeCred | null;
  search: (cred: TradeCred) => Promise<SearchResult>;
  /** Errors known to fire before anything reached trade2 (the shared budget being busy). */
  notSpent: (e: unknown) => boolean;
}

function toBody(name: string, found: SearchResult, nowMs: number): ListingsResponse {
  return {
    name,
    total: found.total,
    searchUrl: found.searchUrl,
    listings: found.listings.slice(0, LIVE_LISTINGS_SHOWN).map(toLiveListing),
    cached: false,
    fetchedAt: new Date(nowMs).toISOString(),
  };
}

/**
 * Cache hit or a search already in flight → free. Otherwise: cred, a RESERVED slot of the caller's
 * live-lookup window, then one search + fetch. A failure before anything reached trade2 hands the
 * slot back (spendReserved). Errors propagate.
 */
export async function lookupListings(q: { userId: number; key: string; name: string; nowMs: number }, deps: LookupDeps): Promise<ListingsOutcome> {
  const hit = deps.cache.get(q.key, q.nowMs);
  if (hit) return { kind: "ok", body: hit };
  const pending = deps.cache.inflight.get(q.key);
  if (pending) return { kind: "ok", body: { ...(await pending), cached: true } };
  if (!deps.cred) return { kind: "no-cred" };
  const slot = deps.limiter.reserve(q.userId);
  if (!slot.allowed) return { kind: "limited", retryAfterSec: slot.retryAfterSec };
  const cred = deps.cred;
  const run = spendReserved(slot, deps.notSpent, () => deps.search(cred)).then((found) => toBody(q.name, found, q.nowMs));
  deps.cache.inflight.set(q.key, run);
  try {
    const body = await run;
    deps.cache.set(q.key, body, q.nowMs);
    return { kind: "ok", body };
  } finally {
    deps.cache.inflight.delete(q.key);
  }
}
