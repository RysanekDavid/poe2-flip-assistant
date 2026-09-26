import axios, { AxiosError } from "axios";
import Bottleneck from "bottleneck";
import { config } from "../config/env";
import { getDefaultLeague } from "../core/leagueState";
import { buildTradeQuery, type TradeQuery } from "../lib/tradeLink";
import { createRateGovernor } from "./tradeRateLimit";
import { parseFetchResponse, type Listing } from "./tradeListing";

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

// One request at a time, never faster than the configured floor. This limiter lives in the
// POLLER process only: web routes enqueue scans (db/scanRequestQueries) instead of calling
// trade2 themselves, so a single limiter owns the account+IP budget.
const limiter = new Bottleneck({ maxConcurrent: 1, minTime: config.hunt.minRequestMs });
// Live GGG rate-limit state on top of the fixed floor (restrictions, near-cap rules, 429s).
const governor = createRateGovernor();
// A wait longer than this fails the call instead of freezing every queued scan behind it.
const MAX_INLINE_WAIT_MS = 120_000;
let requestCount = 0;

/** Monotonic count of trade2 requests issued by this process — scans meter their budget off it. */
export const tradeRequestCount = (): number => requestCount;

export interface SearchResp {
  id: string; // queryId — reused by the live WebSocket
  result: string[];
  total: number;
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Hold the queue for the governor's wait, or fail fast when the penalty window is long. */
async function awaitBudget(path: string): Promise<void> {
  const wait = governor.waitMs();
  if (wait > MAX_INLINE_WAIT_MS) {
    throw new Error(`trade2 backing off for ${Math.ceil(wait / 1000)}s (rate-limit state) — skipped ${path.split("?")[0]}`);
  }
  if (wait > 0) await sleep(wait);
}

/** Wrap a trade2 call with the limiter + a clear message on the common failure modes. */
async function call<T>(method: "get" | "post", path: string, cred: TradeCred, body?: unknown): Promise<T> {
  return limiter.schedule(async () => {
    await awaitBudget(path);
    requestCount++;
    try {
      const res = await axios.request<T>({
        method,
        url: `${BASE}${path}`,
        data: body,
        timeout: 20_000,
        headers: authHeaders(cred),
      });
      governor.observe(res.status, res.headers);
      return res.data;
    } catch (err) {
      const ax = err as AxiosError;
      const status = ax.response?.status;
      if (ax.response) governor.observe(status ?? null, ax.response.headers);
      if (status === 429) {
        const retry = ax.response?.headers?.["retry-after"];
        throw new Error(`trade2 rate-limited (429)${retry ? ` — backing off ${retry}s` : ""}.`);
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
  const league = encodeURIComponent(getDefaultLeague());
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
  const fetched = await call<unknown>("get", `/fetch/${slice.join(",")}?query=${queryId}&realm=poe2`, cred);
  return parseFetchResponse(fetched);
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
  return `https://www.pathofexile.com/trade2/search/poe2/${encodeURIComponent(getDefaultLeague())}/${id}`;
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
  const league = encodeURIComponent(getDefaultLeague());
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
