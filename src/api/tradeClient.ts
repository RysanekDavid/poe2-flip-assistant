import axios, { AxiosError } from "axios";
import Bottleneck from "bottleneck";
import { config } from "../config/env";
import { getDefaultLeague } from "../core/leagueState";
import { buildTradeQuery, type TradeQuery } from "../lib/tradeLink";
import { createRateGovernor, type RateGovernor, type TradeEndpoint } from "./tradeRateLimit";
import { scheduleMetered } from "./tradeMeter";
import { TradeAuthError, TradeRateLimitedError } from "./tradeErrors";
import { dbRateStore } from "../db/tradeRateQueries";
import { parseFetchResponse, parseFetchStates, type Listing } from "./tradeListing";

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

// One request at a time per process, never faster than the configured floor. Two processes call
// trade2 — the poller (scans) and the web server (interactive lookups: snipe listings, craft
// rolls, balance reads) — so each has its own limiter; the shared account+IP budget is enforced by
// the governor, whose request log and restriction state live in the DB both processes read.
const limiter = new Bottleneck({ maxConcurrent: 1, minTime: config.trade.minRequestMs });
let governor: RateGovernor | null = null;
const gov = (): RateGovernor => (governor ??= createRateGovernor(dbRateStore()));

/**
 * Longest budget wait a call may sit out inline before failing with TradeRateLimitedError. The
 * default suits the WEB process: an HTTP request must not hang for a minute behind the 36s search
 * pace, so the route answers 503 + Retry-After instead. The poller raises it at startup — its
 * scans are background work and simply queue behind the pace.
 */
let maxInlineWaitMs = 10_000;
export const POLLER_MAX_INLINE_WAIT_MS = 120_000;
export function setMaxInlineWaitMs(ms: number): void {
  maxInlineWaitMs = ms;
}

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
  /** stored = the user's own saved cookie; env = the owner's .env fallback. Only a stored cookie's health is recorded. */
  source?: "stored" | "env";
}

/** Fall back to the .env.local owner cred when no per-user cred is supplied (local single-tenant mode). */
function configCred(): TradeCred {
  return { poesessid: config.poesessid, contact: config.poeContact, account: config.poeAccount, source: "env" };
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

const endpointOf = (path: string): TradeEndpoint => (path.startsWith("/fetch/") ? "fetch" : "search");

/** Wait until the shared budget admits this request (and record it), or fail fast on a long block. */
async function reserveBudget(kind: TradeEndpoint): Promise<void> {
  for (;;) {
    const wait = gov().reserve(kind);
    if (wait === 0) return;
    if (wait > maxInlineWaitMs) throw new TradeRateLimitedError(kind, wait);
    await sleep(wait);
  }
}

/**
 * A trade2 answer outside 2xx that is not one of the typed cases (403 auth, budget wait). Carries
 * the status so a caller can tell "this query id is no longer served" (400/404) from a transient
 * failure; `status` is null when no response arrived at all (timeout, connection reset).
 */
export class TradeHttpError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = "TradeHttpError";
    this.status = status;
  }
}

function describeFailure(err: unknown, method: string, path: string): Error {
  const ax = err as AxiosError;
  const status = ax.response?.status;
  if (status === 429) {
    const retry = ax.response?.headers?.["retry-after"];
    return new TradeHttpError(`trade2 rate-limited (429)${retry ? ` — backing off ${retry}s` : ""}.`, 429);
  }
  if (status === 403) return new TradeAuthError(method, path);
  // surface the API's error body (trade2 explains 400s, e.g. an invalid filter id)
  const body = ax.response?.data ? ` — ${JSON.stringify(ax.response.data).slice(0, 300)}` : "";
  return new TradeHttpError(`trade2 ${method.toUpperCase()} ${path} failed (${status ?? "no-status"})${body}`, status ?? null);
}

/** Wrap a trade2 call with the limiter + governor + a clear message on the common failure modes. */
async function call<T>(method: "get" | "post", path: string, cred: TradeCred, body?: unknown): Promise<T> {
  return (await request<T>(method, path, cred, body)).data;
}

/** `call` that also reports the HTTP status of a successful answer (a non-2xx still throws). */
async function request<T>(
  method: "get" | "post",
  path: string,
  cred: TradeCred,
  body?: unknown,
): Promise<{ status: number; data: T }> {
  const kind = endpointOf(path);
  // the caller's scan meter is captured HERE, before the queue (see tradeMeter.scheduleMetered)
  return scheduleMetered(limiter, kind, async (count) => {
    await reserveBudget(kind);
    count();
    try {
      const res = await axios.request<T>({ method, url: `${BASE}${path}`, data: body, timeout: 20_000, headers: authHeaders(cred) });
      gov().observe(kind, res.status, res.headers);
      return { status: res.status, data: res.data };
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response) gov().observe(kind, ax.response.status ?? null, ax.response.headers);
      throw describeFailure(err, method, path);
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
 * One /fetch with the body left unparsed. parseFetchResponse drops `null` entries (a listing
 * trade2 no longer serves), and a probe asking "is this listing gone?" needs to see exactly those.
 */
export async function fetchListingsRaw(
  ids: string[],
  queryId: string,
  cred: TradeCred = configCred(),
): Promise<{ status: number; body: unknown }> {
  const slice = ids.slice(0, 10);
  if (slice.length === 0) throw new Error("fetchListingsRaw: no listing ids");
  const res = await request<unknown>("get", `/fetch/${slice.join(",")}?query=${queryId}&realm=poe2`, cred);
  return { status: res.status, body: res.data };
}

/**
 * Is each listing still served? One /fetch for up to 10 ids against `queryId` (the search that
 * found them), one state per id in request order: the Listing (current ask) or null (gone).
 * A stale query id surfaces as TradeHttpError 400/404 — the caller decides whether to re-search.
 */
export async function fetchListingStates(
  ids: string[],
  queryId: string,
  cred: TradeCred = configCred(),
): Promise<Array<Listing | null>> {
  if (ids.length === 0 || ids.length > 10) throw new Error(`fetchListingStates: 1–10 ids per fetch, got ${ids.length}`);
  const fetched = await call<unknown>("get", `/fetch/${ids.join(",")}?query=${queryId}&realm=poe2`, cred);
  return parseFetchStates(fetched, ids);
}

/**
 * Search live listings for a query and fetch up to `limit`. Default sort is cheapest
 * first; pass { indexed: "desc" } for newest first. Returns the market total too, and the
 * search's query id — the id a later /fetch of these listings must quote.
 */
export async function searchListings(
  q: TradeQuery,
  limit = 10,
  sort: TradeSort = "asc",
  cred: TradeCred = configCred(),
): Promise<{ total: number; listings: Listing[]; queryId: string }> {
  const search = await createSearch(q, sort, cred);
  const ids = (search.result ?? []).slice(0, Math.min(limit, 30));
  if (ids.length === 0) return { total: search.total ?? 0, listings: [], queryId: search.id };
  const listings: Listing[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    listings.push(...(await fetchListings(ids.slice(i, i + 10), search.id, cred)));
  }
  return { total: search.total ?? listings.length, listings, queryId: search.id };
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

export const liveSearchEnabled = (cred: TradeCred = configCred()): boolean => cred.poesessid.length > 0;
export const accountReadEnabled = (cred: TradeCred = configCred()): boolean =>
  cred.poesessid.length > 0 && (cred.account ?? "").length > 0;
