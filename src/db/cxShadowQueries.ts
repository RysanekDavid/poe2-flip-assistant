import type Database from "better-sqlite3";
import { z } from "zod";
import { getDb } from "./database";
import { CX_PRICE_METHODS, type CxPriceMethod, type CxShadowPrice } from "../core/cx/cxPricing";

/**
 * Persistence for the CX-derived shadow prices (tables in cxMigrations.ts) and the ninja reads the
 * shadow comparison needs. Every read is scoped by an explicit league, like cxMarketQueries.
 */

type Db = Database.Database;

interface RawShadowRow {
  hour: number;
  exchange_id: string;
  price_div: number;
  method: string;
  units: number;
  volume_div: number;
  legs: number;
  traded_hour: number;
}

export interface StoredShadowPrice extends CxShadowPrice {
  hour: number;
}

const SHADOW_COLUMNS = "hour, exchange_id, price_div, method, units, volume_div, legs, traded_hour";

const isMethod = (m: string): m is CxPriceMethod => (CX_PRICE_METHODS as readonly string[]).includes(m);

function toPrice(r: RawShadowRow): StoredShadowPrice {
  // The CHECK constraint makes this unreachable unless the schema and the code drift apart.
  if (!isMethod(r.method)) throw new Error(`cx_price_shadow row ${r.exchange_id}@${r.hour} has unknown method "${r.method}"`);
  return {
    hour: r.hour,
    exchangeId: r.exchange_id,
    priceDiv: r.price_div,
    method: r.method,
    units: r.units,
    volumeDiv: r.volume_div,
    legs: r.legs,
    tradedHour: r.traded_hour,
  };
}

export interface ShadowHourSummary {
  /** Digest ids with fills but no catalog exchange id. */
  unmappedIds: readonly string[];
}

/**
 * Store one league-hour's shadow prices and mark it computed, and forget every priced hour in
 * (hour, invalidateThrough], all in ONE transaction. Those later hours carried forward without
 * this hour's trades; forgetting them puts them back in the queue to be re-priced on top of it.
 * Returns the number of later hours forgotten.
 */
export function storeShadowHour(
  league: string,
  hour: number,
  prices: readonly CxShadowPrice[],
  summary: ShadowHourSummary,
  invalidateThrough: number,
  db: Db = getDb(),
): number {
  const insert = db.prepare(
    `INSERT INTO cx_price_shadow (league, ${SHADOW_COLUMNS})
     VALUES (@league, @hour, @exchangeId, @priceDiv, @method, @units, @volumeDiv, @legs, @tradedHour)`,
  );
  const mark = db.prepare(
    `INSERT INTO cx_price_shadow_hours (league, hour, priced, carried, unmapped_ids) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(league, hour) DO UPDATE SET priced = excluded.priced, carried = excluded.carried,
       unmapped_ids = excluded.unmapped_ids, computed_at = CURRENT_TIMESTAMP`,
  );
  const carried = prices.filter((p) => p.method === "carried").length;
  return db.transaction(() => {
    db.prepare("DELETE FROM cx_price_shadow WHERE league = ? AND hour = ?").run(league, hour);
    for (const p of prices) insert.run({ ...p, league, hour }); // a StoredShadowPrice carries its own hour: never let it win
    mark.run(league, hour, prices.length - carried, carried, JSON.stringify(summary.unmappedIds));
    db.prepare("DELETE FROM cx_price_shadow WHERE league = ? AND hour > ? AND hour <= ?").run(league, hour, invalidateThrough);
    return db.prepare("DELETE FROM cx_price_shadow_hours WHERE league = ? AND hour > ? AND hour <= ?").run(league, hour, invalidateThrough)
      .changes;
  })();
}

/** Hours already priced for a league at or after `fromHour`. */
export function shadowedHours(league: string, fromHour: number, db: Db = getDb()): Set<number> {
  const rows = db
    .prepare("SELECT hour FROM cx_price_shadow_hours WHERE league = ? AND hour >= ?")
    .all(league, fromHour) as Array<{ hour: number }>;
  return new Set(rows.map((r) => r.hour));
}

/** Every shadow price of the newest priced hour strictly before `hour` — the carry-forward source. */
export function shadowPricesBefore(league: string, hour: number, db: Db = getDb()): StoredShadowPrice[] {
  const prev = db
    .prepare("SELECT MAX(hour) AS mx FROM cx_price_shadow_hours WHERE league = ? AND hour < ?")
    .get(league, hour) as { mx: number | null };
  if (prev.mx == null) return [];
  return (
    db.prepare(`SELECT ${SHADOW_COLUMNS} FROM cx_price_shadow WHERE league = ? AND hour = ?`).all(league, prev.mx) as RawShadowRow[]
  ).map(toPrice);
}

/** Every shadow price of a league in [fromHour, toHour], oldest first. */
export function shadowPricesBetween(league: string, fromHour: number, toHour: number, db: Db = getDb()): StoredShadowPrice[] {
  return (
    db
      .prepare(`SELECT ${SHADOW_COLUMNS} FROM cx_price_shadow WHERE league = ? AND hour BETWEEN ? AND ? ORDER BY hour ASC`)
      .all(league, fromHour, toHour) as RawShadowRow[]
  ).map(toPrice);
}

const UnmappedIdsSchema = z.array(z.string().min(1));

export interface ShadowHourStats {
  /** Computed hours in the range. */
  hours: number;
  /** Oldest and newest computed hour, or null when none. */
  fromHour: number | null;
  toHour: number | null;
  /** Distinct unmapped digest ids over those hours. */
  unmappedIds: string[];
}

/** What the shadow computed for a league in [fromHour, toHour]. */
export function shadowHourStats(league: string, fromHour: number, toHour: number, db: Db = getDb()): ShadowHourStats {
  const rows = db
    .prepare("SELECT hour, unmapped_ids AS ids FROM cx_price_shadow_hours WHERE league = ? AND hour BETWEEN ? AND ? ORDER BY hour")
    .all(league, fromHour, toHour) as Array<{ hour: number; ids: string }>;
  const ids = new Set<string>();
  for (const row of rows) {
    const parsed = UnmappedIdsSchema.safeParse(JSON.parse(row.ids));
    if (!parsed.success) throw new Error(`cx_price_shadow_hours ${league}@${row.hour}: unmapped_ids is not a string array`);
    for (const id of parsed.data) ids.add(id);
  }
  return {
    hours: rows.length,
    fromHour: rows[0]?.hour ?? null,
    toHour: rows[rows.length - 1]?.hour ?? null,
    unmappedIds: [...ids].sort(),
  };
}

/** Drop shadow hours older than `beforeHour`, one league at a time (key-range deletes). Returns price rows removed. */
export function pruneShadowPrices(beforeHour: number, db: Db = getDb()): number {
  const leagues = db.prepare("SELECT DISTINCT league FROM cx_price_shadow_hours").all() as Array<{ league: string }>;
  const prices = db.prepare("DELETE FROM cx_price_shadow WHERE league = ? AND hour < ?");
  const hours = db.prepare("DELETE FROM cx_price_shadow_hours WHERE league = ? AND hour < ?");
  let removed = 0;
  db.transaction(() => {
    for (const { league } of leagues) {
      removed += prices.run(league, beforeHour).changes;
      hours.run(league, beforeHour);
    }
  })();
  return removed;
}

export interface NinjaPricePoint {
  itemId: string;
  itemName: string;
  /** Divine per item (primaryValue). */
  priceDiv: number;
  /** SQLite UTC text. */
  fetchedAt: string;
}

/**
 * Ninja snapshots of the given items written in [from, to] (SQLite UTC text), oldest first. One
 * index seek per item on (league, item_id, fetched_at): a bare fetched_at range would walk the
 * league's whole 30-day history.
 */
export function ninjaPricesBetween(
  league: string,
  itemIds: readonly string[],
  from: string,
  to: string,
  db: Db = getDb(),
): NinjaPricePoint[] {
  if (itemIds.length === 0) return [];
  return db
    .prepare(
      `WITH ids(itemId) AS (SELECT DISTINCT value FROM json_each(@itemIds))
       SELECT s.item_id AS itemId, s.item_name AS itemName, s.chaos_equiv AS priceDiv, s.fetched_at AS fetchedAt
       FROM ids JOIN price_snapshots s ON s.league = @league AND s.item_id = ids.itemId AND s.fetched_at BETWEEN @from AND @to
       ORDER BY s.fetched_at ASC, s.id ASC`,
    )
    .all({ league, itemIds: JSON.stringify(itemIds), from, to }) as NinjaPricePoint[];
}
