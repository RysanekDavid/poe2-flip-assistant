import type Database from "better-sqlite3";
import { getDb } from "../db/database";
import { getDefaultLeague, normalizeLeague } from "./leagueState";

/**
 * Per-user league: which market a signed-in account is LOOKING at.
 *
 * The league used to be one global setting only the owner could move, which made a personal view
 * preference an admin operation. It is now stored on the user row (`users.league`, NULL = follow
 * the app default) and anyone may change their own. Nothing is purged and no alert is fired —
 * switching a view is not news.
 *
 * The poller cannot collect every league someone briefly clicked through, so `getPolledLeagues`
 * applies a dwell debounce and a hard cap; everything else here is a plain read of that column.
 */

/** A league must be held this long before the poller starts collecting it. */
export const LEAGUE_DWELL_MS = 5 * 60 * 1000;

/**
 * Safety valve on the ninja budget. Steady state is ~13 requests per league per hour (one sweep
 * per category, 1h response cache) against a 144/h limiter, so four leagues is comfortable and
 * a fifth is a sign something is wrong rather than a workload to serve.
 */
export const MAX_POLLED_LEAGUES = 4;

/** Same 60s window leagueState uses — this is read on every request that touches market data. */
const CACHE_TTL_MS = 60_000;

const cache = new Map<number, { at: number; league: string }>();

/** Drop memoized user leagues — one user's on a switch, all of them between test fixtures. */
export function clearUserLeagueCache(userId?: number): void {
  if (userId == null) cache.clear();
  else cache.delete(userId);
}

interface HeldLeague {
  league: string;
  since: string;
}

/** Distinct leagues users have pinned, longest-held first. */
function heldLeagues(database?: Database.Database): HeldLeague[] {
  return (database ?? getDb())
    .prepare(
      `SELECT league, MIN(league_set_at) AS since FROM users
       WHERE league IS NOT NULL AND TRIM(league) <> '' AND league_set_at IS NOT NULL
       GROUP BY league ORDER BY since ASC`,
    )
    .all() as HeldLeague[];
}

/**
 * Every league spelling in play, keyed by lowercase → the ONE spelling the app uses for it.
 *
 * League names reach SQL as exact values (`WHERE league = ?`), so two spellings of one league are
 * two separate markets: the poller would sweep "standard" while a user's panels read "Standard"
 * and found nothing, forever. That is not hypothetical — LEAGUE_NAME comes from .env and the
 * stored names come from poe2scout, and the two disagree on case sooner or later.
 *
 * The app default's spelling always wins its key; for any other league the longest-held spelling
 * does, so every process resolves the same string for the same market.
 */
function canonicalMap(database?: Database.Database): Map<string, string> {
  const fallback = getDefaultLeague(database);
  const map = new Map<string, string>([[fallback.toLowerCase(), fallback]]);
  for (const row of heldLeagues(database)) {
    const held = row.league.trim();
    if (held === "") continue;
    const key = held.toLowerCase();
    if (!map.has(key)) map.set(key, held); // rows arrive oldest-held first
  }
  return map;
}

/** The one spelling this app uses for `name`'s market. Unknown names pass through trimmed. */
export function canonicalLeague(name: string, database?: Database.Database): string {
  const trimmed = name.trim();
  return canonicalMap(database).get(trimmed.toLowerCase()) ?? trimmed;
}

/** True when two names denote the same market — league names differ only by case at worst. */
export function sameLeague(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** This user's OWN pinned league, or null when they follow the app default. Never cached. */
export function ownLeague(userId: number, database?: Database.Database): string | null {
  const row = (database ?? getDb()).prepare("SELECT league FROM users WHERE id = ?").get(userId) as
    | { league: string | null }
    | undefined;
  const own = row?.league?.trim() ?? "";
  return own === "" ? null : own;
}

/**
 * The league this user is viewing: their own if pinned, else the app default — in either case in
 * the canonical spelling, so it can be compared and queried against anything else in the app.
 *
 * As in leagueState, an explicit `database` bypasses the cache in both directions: a test or
 * maintenance connection must neither read nor populate the process-wide memo.
 */
export function leagueForUser(userId: number, database?: Database.Database): string {
  const explicit = database != null;
  if (!explicit) {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.league;
  }

  const own = ownLeague(userId, database);
  const league = own != null ? canonicalLeague(own, database) : getDefaultLeague(database);
  if (!explicit) cache.set(userId, { at: Date.now(), league });
  return league;
}

/**
 * Point one user's view at `league`. Validated exactly like the app default (the value reaches
 * trade2 URLs and the Coach system prompt either way), stamped so the poller can tell a settled
 * choice from a click-through, and confined to that user: no purge, no global side effects.
 */
export function setUserLeague(
  userId: number,
  league: string,
  database: Database.Database = getDb(),
): { league: string } {
  const normalized = normalizeLeague(league);
  const info = database
    .prepare("UPDATE users SET league = ?, league_set_at = ? WHERE id = ?")
    .run(normalized, new Date().toISOString(), userId);
  if (info.changes === 0) throw new Error(`cannot set league: no user with id ${userId}`);
  clearUserLeagueCache(userId);
  return { league: normalized };
}

/** Clear a user's own league so they follow the app default again. */
export function clearUserLeague(userId: number, database: Database.Database = getDb()): void {
  database.prepare("UPDATE users SET league = NULL, league_set_at = NULL WHERE id = ?").run(userId);
  clearUserLeagueCache(userId);
}

/**
 * Every league the poller should collect this tick: the app default, plus each league some user
 * has held for at least LEAGUE_DWELL_MS — each in its canonical spelling, which is the spelling
 * every reader resolves to. Emitting a user's raw spelling here would sweep a market nobody ever
 * queries.
 *
 * The debounce exists because a user browsing the dropdown would otherwise add a full ninja sweep
 * per click. Past the cap the LONGEST-held leagues win — a league four people have sat on all
 * evening matters more than the one somebody opened six minutes ago.
 */
export function getPolledLeagues(database?: Database.Database, nowMs: number = Date.now()): string[] {
  const fallback = getDefaultLeague(database);
  const canon = canonicalMap(database);

  const polled = [fallback];
  const seen = new Set([fallback.toLowerCase()]);
  for (const row of heldLeagues(database)) {
    const held = row.league.trim();
    const key = held.toLowerCase();
    const since = Date.parse(row.since);
    if (held === "" || !Number.isFinite(since) || nowMs - since < LEAGUE_DWELL_MS) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    polled.push(canon.get(key) ?? held);
  }

  if (polled.length <= MAX_POLLED_LEAGUES) return polled;
  const dropped = polled.slice(MAX_POLLED_LEAGUES);
  console.warn(
    `[league] ${polled.length} leagues in use — polling the ${MAX_POLLED_LEAGUES} longest-held, ` +
      `skipping: ${dropped.join(", ")}`,
  );
  return polled.slice(0, MAX_POLLED_LEAGUES);
}
