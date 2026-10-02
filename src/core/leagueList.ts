import type Database from "better-sqlite3";
import { z } from "zod";
import { fetchTradeLeagues, TradeLeaguesError } from "../api/tradeLeagues";
import { getDb } from "../db/database";
import { getSetting, registerLeagues, setSetting } from "../db/leagueQueries";

/**
 * The PoE2 league list, from GGG's trade2 `/data/leagues` only, behind a cache shared by the web
 * process and the poller (app_settings), so the two together ask GGG about once per TTL.
 *
 * Failure policy: a failed refresh with a cached list serves that list and records why, so the
 * owner's System panel shows the list's age and the error; a failed refresh with NO cached list
 * throws — an empty picker or an unvalidated league switch would be a silent wrong answer.
 */

/** Leagues change a few times a year; an hour keeps a launch-day list timely and GGG unbothered. */
export const LEAGUE_LIST_TTL_MS = 60 * 60_000;

/** After a failure, wait this long (or GGG's Retry-After, if longer) before asking again. */
export const LEAGUE_LIST_RETRY_MS = 5 * 60_000;

const CACHE_KEY = "trade2_leagues";
const ERROR_KEY = "trade2_leagues_error";

const CacheSchema = z.object({ fetchedAt: z.number(), names: z.array(z.string().min(1)).min(1) });
const ErrorSchema = z.object({ at: z.number(), message: z.string(), retryAt: z.number() });

type CachedList = z.infer<typeof CacheSchema>;
type ListError = z.infer<typeof ErrorSchema>;

export interface LeagueListSnapshot {
  /** GGG's league ids, GGG's order. */
  names: string[];
  /** When GGG last answered (ms epoch). */
  fetchedAt: number;
  /** Set when this is the last good list served because a refresh failed. */
  staleReason: string | null;
}

/** Owner-facing state of the list, for System Health. */
export interface LeagueListStatus {
  fetchedAt: number | null;
  leagues: number;
  lastError: string | null;
  lastErrorAt: number | null;
}

export interface LeagueListDeps {
  fetch: () => Promise<string[]>;
  now: () => number;
  database: Database.Database;
}

const liveDeps = (): LeagueListDeps => ({ fetch: fetchTradeLeagues, now: () => Date.now(), database: getDb() });

/** One refresh at a time per process: the dropdown and the watcher can ask in the same second. */
let inFlight: Promise<LeagueListSnapshot> | null = null;

function readJson<T>(key: string, schema: z.ZodType<T>, database: Database.Database): T | null {
  const raw = getSetting(key, database);
  if (raw == null) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (err: unknown) {
    throw new Error(`app_settings.${key} is not JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new Error(`app_settings.${key} has an unexpected shape: ${parsed.error.message}`);
  return parsed.data;
}

const readCache = (database: Database.Database): CachedList | null => readJson(CACHE_KEY, CacheSchema, database);
const readError = (database: Database.Database): ListError | null => readJson(ERROR_KEY, ErrorSchema, database);

/** What System Health shows: how old the list is and the last refresh failure, if any. */
export function leagueListStatus(database: Database.Database = getDb()): LeagueListStatus {
  const cache = readCache(database);
  const error = readError(database);
  return {
    fetchedAt: cache?.fetchedAt ?? null,
    leagues: cache?.names.length ?? 0,
    lastError: error?.message ?? null,
    lastErrorAt: error?.at ?? null,
  };
}

async function refresh(deps: LeagueListDeps, cache: CachedList | null): Promise<LeagueListSnapshot> {
  const now = deps.now();
  try {
    const names = await deps.fetch();
    const fresh: CachedList = { fetchedAt: now, names };
    deps.database.transaction(() => {
      setSetting(CACHE_KEY, JSON.stringify(fresh), deps.database);
      deps.database.prepare("DELETE FROM app_settings WHERE key = ?").run(ERROR_KEY);
      // First sightings date the dropdown's newest-first order and the league-start backfill.
      registerLeagues(names, deps.database);
    })();
    return { names, fetchedAt: now, staleReason: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const wait = Math.max(LEAGUE_LIST_RETRY_MS, err instanceof TradeLeaguesError ? (err.retryAfterMs ?? 0) : 0);
    const failure: ListError = { at: now, message, retryAt: now + wait };
    setSetting(ERROR_KEY, JSON.stringify(failure), deps.database);
    if (cache == null) throw new Error(`trade2 league list unavailable and nothing cached: ${message}`);
    console.warn(`[league] trade2 league list refresh failed, serving list from ${new Date(cache.fetchedAt).toISOString()}: ${message}`);
    return { names: cache.names, fetchedAt: cache.fetchedAt, staleReason: message };
  }
}

/**
 * The league list: cached if younger than the TTL, else refreshed from GGG. While a previous
 * failure's back-off runs, the cached list is served as stale without asking again — and with
 * nothing cached, the remembered failure is thrown rather than hammering a refusing endpoint.
 */
export async function getLeagueList(deps: LeagueListDeps = liveDeps()): Promise<LeagueListSnapshot> {
  const cache = readCache(deps.database);
  const now = deps.now();
  if (cache != null && now - cache.fetchedAt < LEAGUE_LIST_TTL_MS) {
    return { names: cache.names, fetchedAt: cache.fetchedAt, staleReason: null };
  }
  const error = readError(deps.database);
  if (error != null && now < error.retryAt) {
    if (cache == null) throw new Error(`trade2 league list unavailable and nothing cached: ${error.message}`);
    return { names: cache.names, fetchedAt: cache.fetchedAt, staleReason: error.message };
  }
  if (inFlight == null) {
    inFlight = refresh(deps, cache).finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}
