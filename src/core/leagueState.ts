import type Database from "better-sqlite3";
import { config } from "../config/env";
import { getDb } from "../db/database";
import { getSetting, setSetting, markLeagueAlerted } from "../db/leagueQueries";

/** app_settings key holding the league the app currently tracks. */
export const LEAGUE_SETTING_KEY = "league";

export const MAX_LEAGUE_LENGTH = 60;

/**
 * The stored league is read on every ninja/scout/trade call, so the DB hit is cached for a
 * minute. A switch clears the cache immediately (same process); other processes — the poller
 * runs separately from the web server — pick the new league up within the TTL.
 */
const CACHE_TTL_MS = 60_000;

let cache: { at: number; league: string } | null = null;

/** Drop the memoized league. Called on every switch, and by tests between DB fixtures. */
export function clearLeagueCache(): void {
  cache = null;
}

/**
 * The league the app tracks right now: the runtime setting if present, else LEAGUE_NAME from env.
 *
 * Only the default (process) database is memoized — an explicit `database` is a test or
 * maintenance connection, and caching its value would hand the wrong league to the next
 * production caller for up to a minute.
 */
export function getActiveLeague(database?: Database.Database): string {
  const explicit = database != null;
  if (!explicit && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.league;

  const stored = getSetting(LEAGUE_SETTING_KEY, database ?? getDb());
  const league = stored != null && stored.trim() !== "" ? stored.trim() : config.league;
  if (!explicit) cache = { at: Date.now(), league };
  return league;
}

/** Trimmed and safe to store, or throw. The value reaches URLs and the Coach system prompt. */
function normalizeLeague(league: string): string {
  const normalized = league.trim();
  if (normalized === "") throw new Error("league must not be empty");
  if (normalized.length > MAX_LEAGUE_LENGTH) {
    throw new Error(`league must be at most ${MAX_LEAGUE_LENGTH} characters`);
  }
  // trim() already removed surrounding whitespace; this catches INTERIOR newlines/control bytes,
  // which would otherwise be injected into the Coach system prompt and trade2 URLs.
  if ([...normalized].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)) {
    throw new Error("league must not contain control characters");
  }
  return normalized;
}

/**
 * Switch the tracked league at runtime (no redeploy). Nothing is deleted: every market table
 * carries a `league` column, so the previous league's history stays queryable and switching
 * back restores the full picture instantly. The earlier purge-on-switch emptied the app and
 * flipped the Coach to "sources unavailable" — the league column exists to make that
 * unnecessary, not to make the purge cheaper.
 *
 * Also clears the "new league" banner by marking the target as already alerted.
 *
 * `changed` is false when the request resolves to the league already tracked; callers use it to
 * skip the "league switched" alert. It is decided from a FRESH read, not the memoized one, so a
 * stale cache cannot turn a no-op into an alert.
 */
export function setActiveLeague(
  league: string,
  database: Database.Database = getDb(),
): { league: string; changed: boolean } {
  const normalized = normalizeLeague(league);
  const previous = getActiveLeague(database);
  const changed = normalized !== previous;

  database.transaction(() => {
    setSetting(LEAGUE_SETTING_KEY, normalized, database);
    markLeagueAlerted(normalized, database);
  })();

  if (changed) console.log(`[league] switched ${previous} → ${normalized}; data retained per league`);
  clearLeagueCache();
  return { league: normalized, changed };
}
