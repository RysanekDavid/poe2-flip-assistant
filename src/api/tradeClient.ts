import axios, { AxiosError } from "axios";
import Bottleneck from "bottleneck";
import { config } from "../config/env";
import { getActiveLeague } from "../core/leagueState";
import { buildTradeQuery, type TradeQuery } from "../lib/tradeLink";

/**
 * Read-only client for the official PoE2 trade API. We search and price-check —
 * we NEVER buy, whisper automatically, or sweep listings. The human reviews hits
 * and trades manually. Background scanning is rate-limited and conservative; this
 * is the line between a price-check tool (allowed) and a bot (bannable).
 *
 * Requires a POESESSID (per-user, read-only). Runs fine server-side from a datacenter
 * (Hetzner) — verified 2026-06-28; the old "Cloudflare blocks datacenters" claim was wrong.
 * Each call takes the caller's TradeCred so different users search with their own cookie.
 */
const BASE = "https://www.pathofexile.com/api/trade2";

// One request at a time, never faster than the configured floor — protects against
// the trade API rate limits (429). Background scans queue through this.
const limiter = new Bottleneck({ maxConcurrent: 1, minTime: config.hunt.minRequestMs });

export interface Listing {
  listingId: string; // unique listing hash — for de-duping across re-lists
  price: { amount: number; currency: string } | null;
  account: string;
  online: boolean; // seller currently in-game
  indexed: string | null; // when the listing was indexed (age)
  whisper: string | null;
  itemName: string;
  baseType: string;
  icon: string | null; // rendered item art (trade2 CDN url) — for showing the actual item in results
  stackSize: number; // for currency: how many orbs in the stack (0 if N/A)
  mods: string[]; // explicit + implicit + rune mod lines, as displayed (for mod-value scans)
  stash: string | null; // stash tab the listing sits in (your own listings expose this)
}

export interface SearchResp {
  id: string; // queryId — reused by the live WebSocket
  result: string[];
  total: number;
}
interface FetchResp {
  result: Array<{
    id?: string;
    listing?: {
      indexed?: string;
      price?: { amount?: number; currency?: string } | null;
      account?: { name?: string; online?: unknown };
      whisper?: string;
      stash?: { name?: string };
    };
    item?: {
      name?: string;
      typeLine?: string;
      baseType?: string;
      icon?: string;
      stackSize?: number;
      explicitMods?: string[];
      implicitMods?: string[];
      runeMods?: string[];
      craftedMods?: string[];
      fracturedMods?: string[];
      enchantMods?: string[];
    };
  } | null>;
}

/** Strip trade2 display markup: "[Resistances|Cold Resistance]" → "Cold Resistance", "[Bonded]" → "Bonded". */
function cleanMod(m: string): string {
  return m
    .replace(/\[[^\]|]*\|([^\]]*)\]/g, "$1")
    .replace(/\[([^\]]*)\]/g, "$1")
    .trim();
}

/** Per-user trade2 credentials. Threaded through every call so users search with their own cookie. */
export interface TradeCred {
  poesessid: string; // the caller's session cookie
  contact?: string; // identifying email for the User-Agent
  account?: string; // account name (own-stash / own-listing reads)
}

/** Fall back to the .env.local owner cred when no per-user cred is supplied (local single-tenant mode). */
function configCred(): TradeCred {
  return { poesessid: config.poesessid, contact: config.poeContact, account: config.poeAccount };
}

function authHeaders(cred: TradeCred): Record<string, string> {
  if (!cred.poesessid) {
    throw new Error("POESESSID not set — live trade search disabled. Add your session cookie in Settings to enable.");
  }
  const contact = cred.contact ? ` (${cred.contact})` : "";
  return {
    "Content-Type": "application/json",
    "User-Agent": `poe2-flip-assistant/0.1 read-only price-check${contact}`,
    Cookie: `POESESSID=${cred.poesessid}`,
  };
}

/** Wrap a trade2 call with the limiter + a clear message on the common failure modes. */
async function call<T>(method: "get" | "post", path: string, cred: TradeCred, body?: unknown): Promise<T> {
  return limiter.schedule(async () => {
    try {
      const res = await axios.request<T>({
        method,
        url: `${BASE}${path}`,
        data: body,
        timeout: 20_000,
        headers: authHeaders(cred),
      });
      return res.data;
    } catch (err) {
      const ax = err as AxiosError;
      const status = ax.response?.status;
      if (status === 429) {
        const retry = ax.response?.headers?.["retry-after"];
        throw new Error(`trade2 rate-limited (429)${retry ? ` — retry after ${retry}s` : ""}. Slow the scan cadence.`);
      }
      if (status === 403) {
        throw new Error("trade2 403 — POESESSID invalid/expired or Cloudflare challenge. Refresh your cookie.");
      }
      // surface the API's error body (trade2 explains 400s, e.g. an invalid filter id)
      const body = ax.response?.data ? ` — ${JSON.stringify(ax.response.data).slice(0, 300)}` : "";
      throw new Error(`trade2 ${method.toUpperCase()} ${path} failed (${status ?? "no-status"})${body}`);
    }
  });
}

function parseListing(r: FetchResp["result"][number]): Listing | null {
  if (!r) return null;
  const p = r.listing?.price;
  return {
    listingId: r.id ?? "",
    price: p && p.amount != null && p.currency ? { amount: p.amount, currency: p.currency } : null,
    account: r.listing?.account?.name ?? "?",
    online: r.listing?.account?.online != null,
    indexed: r.listing?.indexed ?? null,
    whisper: r.listing?.whisper ?? null,
    itemName: r.item?.name || r.item?.baseType || r.item?.typeLine || "?",
    baseType: r.item?.baseType || r.item?.typeLine || "",
    icon: r.item?.icon ?? null,
    stackSize: r.item?.stackSize ?? 0,
    mods: [
      ...(r.item?.implicitMods ?? []),
      ...(r.item?.explicitMods ?? []),
      ...(r.item?.craftedMods ?? []),
      ...(r.item?.fracturedMods ?? []),
      ...(r.item?.runeMods ?? []),
      ...(r.item?.enchantMods ?? []),
    ]
      .filter((m): m is string => typeof m === "string")
      .map(cleanMod),
    stash: r.listing?.stash?.name ?? null,
  };
}

/** Sort spec: "asc"/"desc" = by price (the common case), or an explicit field map,
 *  e.g. { indexed: "desc" } for a newest-first recency feed (confirmed supported by trade2). */
export type TradeSort = "asc" | "desc" | Record<string, "asc" | "desc">;

const toSort = (s: TradeSort): Record<string, "asc" | "desc"> => (typeof s === "string" ? { price: s } : s);

/** POST a search and get back the queryId + first result ids. */
export async function createSearch(
  q: TradeQuery,
  sort: TradeSort = "asc",
  cred: TradeCred = configCred(),
): Promise<SearchResp> {
  const league = encodeURIComponent(getActiveLeague());
  const body = { query: buildTradeQuery(q), sort: toSort(sort) };
  return call<SearchResp>("post", `/search/poe2/${league}?realm=poe2`, cred, body);
}

/** Fetch listing details for up to 10 ids against a prior search's queryId. */
export async function fetchListings(
  ids: string[],
  queryId: string,
  cred: TradeCred = configCred(),
): Promise<Listing[]> {
  const slice = ids.slice(0, 10);
  if (slice.length === 0) return [];
  const fetched = await call<FetchResp>("get", `/fetch/${slice.join(",")}?query=${queryId}&realm=poe2`, cred);
  return (fetched.result ?? []).map(parseListing).filter((l): l is Listing => l != null);
}

/**
 * Search live listings for a query and fetch up to `limit`. Default sort is cheapest
 * first; pass { indexed: "desc" } for newest first. Returns the market total too.
 */
export async function searchListings(
  q: TradeQuery,
  limit = 10,
  sort: TradeSort = "asc",
  cred: TradeCred = configCred(),
): Promise<{ total: number; listings: Listing[] }> {
  const search = await createSearch(q, sort, cred);
  const ids = (search.result ?? []).slice(0, Math.min(limit, 30));
  if (ids.length === 0) return { total: search.total ?? 0, listings: [] };
  const listings: Listing[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    listings.push(...(await fetchListings(ids.slice(i, i + 10), search.id, cred)));
  }
  return { total: search.total ?? listings.length, listings };
}

/**
 * Trade site browser URL for a search id. The official site does NOT read a `?q=<json>`
 * param — community tools POST the query, get an id back, and open this id-based URL. That's
 * the only deep-link that actually prefills the search.
 */
function searchPageUrl(id: string): string {
  return `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(getActiveLeague())}/${id}`;
}

/**
 * Search + fetch cheapest `limit` listings AND return a working trade-site URL. The id
 * comes from the same POST, so the link opens the exact prefilled search the user sees
 * in-app (cheapest on top). Read-only — human buys manually.
 */
export async function searchListingsLinked(
  q: TradeQuery,
  limit = 10,
  cred: TradeCred = configCred(),
): Promise<{ total: number; listings: Listing[]; searchUrl: string }> {
  const search = await createSearch(q, "asc", cred);
  const ids = (search.result ?? []).slice(0, Math.min(limit, 30));
  const listings: Listing[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    listings.push(...(await fetchListings(ids.slice(i, i + 10), search.id, cred)));
  }
  return { total: search.total ?? listings.length, listings, searchUrl: searchPageUrl(search.id) };
}

/**
 * Search every item YOU have listed (in public stash tabs), by account name. This is how
 * PoE2 net-worth tools read your stash — the official stash API is PoE1-only, but a trade
 * search filtered to your own account returns all your indexed (public-tab) listings,
 * currency stacks included. Read-only; only sees PUBLIC tabs.
 */
export async function searchAccountListings(
  account: string,
  limit = 200,
  cred: TradeCred = configCred(),
): Promise<{ total: number; listings: Listing[] }> {
  const league = encodeURIComponent(getActiveLeague());
  const body = {
    query: { filters: { trade_filters: { filters: { account: { input: account } } } } },
    sort: { price: "asc" },
  };
  const search = await call<SearchResp>("post", `/search/poe2/${league}?realm=poe2`, cred, body);
  const ids = (search.result ?? []).slice(0, limit);
  const listings: Listing[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    listings.push(...(await fetchListings(ids.slice(i, i + 10), search.id, cred)));
  }
  return { total: search.total ?? listings.length, listings };
}

export const liveSearchEnabled = (cred: TradeCred = configCred()): boolean => cred.poesessid.length > 0;
export const accountReadEnabled = (cred: TradeCred = configCred()): boolean =>
  cred.poesessid.length > 0 && (cred.account ?? "").length > 0;
