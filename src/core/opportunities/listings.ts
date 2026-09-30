import type { TradeCred } from "../../api/tradeClient";
import type { Listing } from "../../api/tradeListing";
import { LIVE_LISTINGS_SHOWN, type ListingsResponse, type LiveListing } from "../../lib/opportunitiesContract";
import { scoutKey } from "../../lib/scoutKey";
import { createLiveLimiter, meteredSpend, type LiveLimiter } from "../tools/modpool/liveLimit";

/**
 * Live cheapest listings behind a Market › Opportunities row: ONE trade2 search + ONE fetch per
 * click, through the shared governor (tradeClient). Nothing runs in the background. A shared cache
 * answers repeat clicks for free (listings are public, so every viewer may share them), and each
 * user is capped at LIVE_LISTINGS_PER_HOUR searches that actually went out.
 */

export const LIVE_LISTINGS_PER_HOUR = 10;
/** Cheapest listings go stale fast; five minutes still saves the repeat click and the second viewer. */
export const LISTINGS_CACHE_TTL_MS = 5 * 60_000;
const LISTINGS_CACHE_MAX = 200;

/** The process-wide per-user cap the listings route uses (its own window, apart from mod-pool's). */
export const listingsLimiter: LiveLimiter = createLiveLimiter({ maxFailures: LIVE_LISTINGS_PER_HOUR }, "opportunity-listings");

export interface ListingsCache {
  get(key: string, nowMs: number): ListingsResponse | null;
  set(key: string, body: ListingsResponse, nowMs: number): void;
}

/** A TTL cache with a size bound (oldest entry out first). */
export function createListingsCache(ttlMs: number = LISTINGS_CACHE_TTL_MS, max: number = LISTINGS_CACHE_MAX): ListingsCache {
  const entries = new Map<string, { body: ListingsResponse; atMs: number }>();
  return {
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

/** Cache hit → free. Miss → cred, per-user cap, then one metered search + fetch. Errors propagate. */
export async function lookupListings(q: { userId: number; key: string; name: string; nowMs: number }, deps: LookupDeps): Promise<ListingsOutcome> {
  const hit = deps.cache.get(q.key, q.nowMs);
  if (hit) return { kind: "ok", body: hit };
  if (!deps.cred) return { kind: "no-cred" };
  const gate = deps.limiter.check(q.userId);
  if (!gate.allowed) return { kind: "limited", retryAfterSec: gate.retryAfterSec };
  const cred = deps.cred;
  const found = await meteredSpend(deps.limiter, q.userId, deps.notSpent, () => deps.search(cred));
  const body: ListingsResponse = {
    name: q.name,
    total: found.total,
    searchUrl: found.searchUrl,
    listings: found.listings.slice(0, LIVE_LISTINGS_SHOWN).map(toLiveListing),
    cached: false,
    fetchedAt: new Date(q.nowMs).toISOString(),
  };
  deps.cache.set(q.key, body, q.nowMs);
  return { kind: "ok", body };
}
