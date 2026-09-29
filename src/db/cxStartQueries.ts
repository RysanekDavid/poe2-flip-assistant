import type Database from "better-sqlite3";
import { getDb } from "./database";

/**
 * League-start curves (tables in featureMigrations.ts): each challenge league's first weeks of
 * exchange prices, one row per (league, day, item), folded from sampled GGG digest hours.
 *
 * Hours here are digest REQUEST hours (unix seconds at the start of the sampled hour), unlike
 * cx_ingest which keys by next_change_id: a league's start_hour is "the first hour it traded",
 * and day d covers [start_hour + d·24h, start_hour + (d+1)·24h).
 *
 * Never pruned — past league starts are the whole point, and one league is ~14 × a few hundred rows.
 */

export interface LeagueStartMeta {
  league: string;
  /** Request hour of the first digest that lists the league. */
  startHour: number;
  /** Days 0..daysAvailable−1 are folded (contiguous from day 0). */
  daysAvailable: number;
  /** Epoch ms when the configured curve length was reached; null while still recording. */
  backfilledAt: number | null;
}

export interface StartDayRow {
  day: number;
  /** GGG base id. */
  item: string;
  /** Median Div mid over the day's sampled hours in which the item traded. Always > 0. */
  midDiv: number;
  /** Item units through the most liquid quote, summed over the sampled hours (not scaled up). */
  volumeUnits: number;
  /** Sampled hours in which the item traded. */
  hours: number;
}

/** One sampled hour of a folded day: how many of the league's markets that digest carried. */
export interface SampledHour {
  hour: number;
  markets: number;
}

interface MetaRow {
  league: string;
  start_hour: number;
  days_available: number;
  backfilled_at: number | null;
}

const toMeta = (r: MetaRow): LeagueStartMeta => ({
  league: r.league,
  startHour: r.start_hour,
  daysAvailable: r.days_available,
  backfilledAt: r.backfilled_at,
});

/** Every league whose start hour is known, oldest start first. */
export function listStartMeta(database: Database.Database = getDb()): LeagueStartMeta[] {
  const rows = database
    .prepare("SELECT league, start_hour, days_available, backfilled_at FROM cx_start_meta ORDER BY start_hour ASC")
    .all() as MetaRow[];
  return rows.map(toMeta);
}

export function getStartMeta(league: string, database: Database.Database = getDb()): LeagueStartMeta | null {
  const row = database
    .prepare("SELECT league, start_hour, days_available, backfilled_at FROM cx_start_meta WHERE league = ?")
    .get(league) as MetaRow | undefined;
  return row == null ? null : toMeta(row);
}

/**
 * Record a league's start hour. A different start for a league that already has folded days is
 * a contradiction (the days would be shifted), so it throws instead of silently re-keying them.
 */
export function recordStartHour(league: string, startHour: number, database: Database.Database = getDb()): void {
  const existing = getStartMeta(league, database);
  if (existing != null) {
    if (existing.startHour === startHour) return;
    throw new Error(`league "${league}" already starts at ${existing.startHour}, refusing to move it to ${startHour}`);
  }
  database.prepare("INSERT INTO cx_start_meta (league, start_hour, days_available) VALUES (?, ?, 0)").run(league, startHour);
}

/**
 * Fold one day: its item rows, the sampled hours that produced them, and the meta advance, in ONE
 * transaction — a crash between them would leave a day counted but empty, or stored but re-fetched.
 * Days must arrive in order, so `day` has to equal the league's current days_available.
 */
export function storeStartDay(
  league: string,
  day: number,
  rows: readonly StartDayRow[],
  sampled: readonly SampledHour[],
  complete: { curveDays: number; nowMs: number },
  database: Database.Database = getDb(),
): void {
  const insertDay = database.prepare(
    `INSERT INTO cx_start_days (league, day, item, mid_div, volume_units, hours) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(league, day, item) DO UPDATE SET mid_div = excluded.mid_div, volume_units = excluded.volume_units, hours = excluded.hours`,
  );
  const insertHour = database.prepare(
    `INSERT INTO cx_start_ingest (league, hour, markets) VALUES (?, ?, ?)
     ON CONFLICT(league, hour) DO UPDATE SET markets = excluded.markets`,
  );
  const advance = database.prepare(
    "UPDATE cx_start_meta SET days_available = ?, backfilled_at = COALESCE(backfilled_at, ?) WHERE league = ? AND days_available = ?",
  );
  database.transaction(() => {
    for (const r of rows) {
      if (r.day !== day) throw new Error(`day ${r.day} row passed to storeStartDay(${league}, ${day})`);
      insertDay.run(league, day, r.item, r.midDiv, r.volumeUnits, r.hours);
    }
    for (const h of sampled) insertHour.run(league, h.hour, h.markets);
    const done = day + 1 >= complete.curveDays ? complete.nowMs : null;
    if (advance.run(day + 1, done, league, day).changes !== 1) {
      throw new Error(`league "${league}" is not at day ${day} (unknown league or days folded out of order)`);
    }
  })();
}

/** Every folded day row of one league. */
export function startDays(league: string, database: Database.Database = getDb()): StartDayRow[] {
  return database
    .prepare(
      `SELECT day, item, mid_div AS midDiv, volume_units AS volumeUnits, hours
       FROM cx_start_days WHERE league = ? ORDER BY day ASC, item ASC`,
    )
    .all(league) as StartDayRow[];
}

/** league_registry rows (base league names), newest first-sighting first. */
export function registryLeagues(database: Database.Database = getDb()): Array<{ league: string; firstSeenAt: string }> {
  return database
    .prepare("SELECT league, first_seen_at AS firstSeenAt FROM league_registry ORDER BY first_seen_at DESC")
    .all() as Array<{ league: string; firstSeenAt: string }>;
}

/** Sampled hours folded for a league (tests and the backfill CLI's progress line). */
export function startIngestCount(league: string, database: Database.Database = getDb()): number {
  const row = database.prepare("SELECT COUNT(*) AS c FROM cx_start_ingest WHERE league = ?").get(league) as { c: number };
  return row.c;
}
