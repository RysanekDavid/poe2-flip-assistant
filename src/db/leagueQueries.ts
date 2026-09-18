import type Database from "better-sqlite3";
import { getDb } from "./database";

/** One row of `league_state` (id = 1) — what detection last saw, and what it already alerted on. */
export interface LeagueStateRow {
  detected_current: string | null;
  detected_at: string | null;
  sources_json: string | null;
  alerted_league: string | null;
}

/** Read one runtime setting, or null when it was never written. */
export function getSetting(key: string, database: Database.Database = getDb()): string | null {
  const row = database.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

/** Write one runtime setting (upsert). */
export function setSetting(key: string, value: string, database: Database.Database = getDb()): void {
  database
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    )
    .run(key, value);
}

/** The single league_state row, or null before the first detection. */
export function readLeagueState(database: Database.Database = getDb()): LeagueStateRow | null {
  const row = database
    .prepare("SELECT detected_current, detected_at, sources_json, alerted_league FROM league_state WHERE id = 1")
    .get() as LeagueStateRow | undefined;
  return row ?? null;
}

/** Record what the sources reported. Leaves `alerted_league` alone — that is the dedupe key. */
export function recordLeagueDetection(
  detected: string,
  sources: Record<string, string | null>,
  database: Database.Database = getDb(),
): void {
  database
    .prepare(
      `INSERT INTO league_state (id, detected_current, detected_at, sources_json)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         detected_current = excluded.detected_current,
         detected_at = excluded.detected_at,
         sources_json = excluded.sources_json`,
    )
    .run(detected, new Date().toISOString(), JSON.stringify(sources));
}

/** Mark a league as already alerted on, so the 6h watcher doesn't re-fire the same news. */
export function markLeagueAlerted(league: string, database: Database.Database = getDb()): void {
  database
    .prepare(
      `INSERT INTO league_state (id, alerted_league) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET alerted_league = excluded.alerted_league`,
    )
    .run(league);
}

/**
 * Record first sightings. HC/SSF variants are stored under their base league name so a
 * variant inherits its base's position in the timeline.
 */
export function registerLeagues(names: readonly string[], database: Database.Database = getDb()): void {
  const insert = database.prepare(
    "INSERT OR IGNORE INTO league_registry (league, first_seen_at) VALUES (?, ?)",
  );
  const now = new Date().toISOString();
  for (const name of names) insert.run(baseLeagueName(name), now);
}

/** First-seen timestamps keyed by lowercased base league name. */
export function leagueFirstSeen(database: Database.Database = getDb()): Map<string, string> {
  const rows = database.prepare("SELECT league, first_seen_at FROM league_registry").all() as Array<{
    league: string;
    first_seen_at: string;
  }>;
  return new Map(rows.map((r) => [r.league.toLowerCase(), r.first_seen_at]));
}

/** "HC Forbidden Rites" / "SSF X" / "Ruthless X" → "Forbidden Rites"; others unchanged. */
export function baseLeagueName(name: string): string {
  return name.replace(/^(hc|ssf|ruthless)\s+/i, "").trim();
}
