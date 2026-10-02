import type Database from "better-sqlite3";
import { getDb } from "./database";

/** One public league's exchange activity in one digest hour (table cx_league_activity). */
export interface LeagueActivityRow {
  league: string;
  /** Digest next_change_id — the END boundary of the covered hour. */
  hour: number;
  markets: number;
  divineVolume: number;
}

/** A league's activity summed over a window. */
export interface LeagueActivityTotal {
  league: string;
  hours: number;
  markets: number;
  divineVolume: number;
}

/** Upsert one digest's per-league activity. Idempotent: a re-ingested hour overwrites itself. */
export function recordLeagueActivity(rows: readonly LeagueActivityRow[], database: Database.Database = getDb()): void {
  const upsert = database.prepare(
    `INSERT INTO cx_league_activity (league, hour, markets, divine_volume) VALUES (?, ?, ?, ?)
     ON CONFLICT(league, hour) DO UPDATE SET markets = excluded.markets, divine_volume = excluded.divine_volume`,
  );
  database.transaction(() => {
    for (const r of rows) upsert.run(r.league, r.hour, r.markets, r.divineVolume);
  })();
}

/** Every league's activity summed over digest hours ≥ `fromHour`. */
export function leagueActivitySince(fromHour: number, database: Database.Database = getDb()): LeagueActivityTotal[] {
  return database
    .prepare(
      `SELECT league, COUNT(*) AS hours, SUM(markets) AS markets, SUM(divine_volume) AS divineVolume
       FROM cx_league_activity WHERE hour >= ? GROUP BY league`,
    )
    .all(fromHour) as LeagueActivityTotal[];
}

/**
 * The first stored hour in which `league` traded, and the first stored hour of ANY league — the
 * latter is how far back our record reaches, so a league first seen at that very hour may simply
 * predate it.
 */
export function activityBounds(
  league: string,
  database: Database.Database = getDb(),
): { leagueFirst: number | null; recordFirst: number | null } {
  const first = database
    .prepare("SELECT MIN(hour) AS h FROM cx_league_activity WHERE league = ? AND markets > 0")
    .get(league) as { h: number | null };
  const record = database.prepare("SELECT MIN(hour) AS h FROM cx_league_activity").get() as { h: number | null };
  return { leagueFirst: first.h, recordFirst: record.h };
}

/** Drop activity older than `beforeHour`; same retention as the market history. */
export function pruneLeagueActivity(beforeHour: number, database: Database.Database = getDb()): number {
  return database.prepare("DELETE FROM cx_league_activity WHERE hour < ?").run(beforeHour).changes;
}
