import { getDb } from "./database";
import { config } from "../config/env";
import type { PricedItem } from "../api/types";

/**
 * Market-table persistence — extracted from queries.ts (already over the file-size cap) when
 * market data became league-scoped.
 *
 * Every read and write here is scoped by an EXPLICIT `league` first parameter rather than
 * reaching for getDefaultLeague() internally: the poller, the web process and the tests all read
 * the setting at different moments, and a query that silently resolved its own league would mix
 * two markets' prices in one result set. Callers pass the league they mean.
 *
 * Prune functions are the deliberate exception — retention is time-based and league-agnostic, so
 * they sweep every league at once. A dead league's rows age out on the same 30-day clock.
 */

/** Latest stored value + age per item, for the insert dedupe below. */
function lastSnapshotPerItem(league: string): Map<string, { baseValue: number; ageMin: number }> {
  const rows = getDb()
    .prepare(
      `SELECT s.item_id AS id, s.chaos_equiv AS baseValue,
              (julianday('now') - julianday(s.fetched_at)) * 1440 AS ageMin
       FROM price_snapshots s
       JOIN (SELECT item_id, MAX(id) mx FROM price_snapshots WHERE league = ? GROUP BY item_id) m
         ON m.item_id = s.item_id AND m.mx = s.id`,
    )
    .all(league) as Array<{ id: string; baseValue: number; ageMin: number }>;
  return new Map(rows.map((r) => [r.id, { baseValue: r.baseValue, ageMin: r.ageMin }]));
}

/** Bulk-insert a fetch's worth of snapshots for one league, skipping no-op repeats.
 *
 *  poe.ninja is cached ~1h, so the 5-min poller sees identical data ~12× in a row. Writing
 *  only when an item's value actually moved (plus a ≥55-min heartbeat so flat items still
 *  mark continuity) cuts the row count ~12× with zero information loss. Returns rows written. */
export function insertSnapshots(league: string, items: PricedItem[]): number {
  const db = getDb();
  const last = lastSnapshotPerItem(league);

  const HEARTBEAT_MIN = 55;
  // Dedup on PRICE only. volume and change_7d drift on almost every ninja fetch, so including
  // them in the change test inserted a row every poll (≈12×/h of redundant data — the size bug).
  // The hourly heartbeat still records a fresh volume point even when the price holds.
  const changed = items.filter((r) => {
    const p = last.get(r.itemId);
    if (!p) return true; // never seen in this league
    if (p.ageMin >= HEARTBEAT_MIN) return true; // heartbeat — keep ≥1 row/hour
    return p.baseValue !== r.baseValue;
  });

  const stmt = db.prepare(
    `INSERT INTO price_snapshots (league, item_id, item_name, category, chaos_equiv, volume, icon)
     VALUES (@league, @itemId, @itemName, @category, @baseValue, @volume, @icon)`,
  );
  // spark_7d/change_7d are "latest per item" data (chart + flip model) — keep ONE upserted row in
  // item_spark instead of duplicating the sparkline JSON into every snapshot.
  const sparkStmt = db.prepare(
    `INSERT INTO item_spark (league, item_id, spark_7d, change_7d, updated_at)
     VALUES (@league, @itemId, @spark7d, @change7d, CURRENT_TIMESTAMP)
     ON CONFLICT(league, item_id) DO UPDATE SET
       spark_7d = excluded.spark_7d, change_7d = excluded.change_7d, updated_at = CURRENT_TIMESTAMP`,
  );

  const tx = db.transaction((rows: PricedItem[], all: PricedItem[]) => {
    for (const r of rows) {
      stmt.run({
        league,
        itemId: r.itemId,
        itemName: r.itemName,
        category: r.category,
        baseValue: r.baseValue,
        volume: r.volume,
        icon: r.icon,
      });
    }
    // refresh the latest spark for EVERY item, not just the ones that got a new snapshot row
    for (const r of all) {
      sparkStmt.run({
        league,
        itemId: r.itemId,
        spark7d: r.spark7d ? JSON.stringify(r.spark7d) : null,
        change7d: r.change7d,
      });
    }
  });
  tx(changed, items);
  return changed.length;
}

/** Drop snapshots older than `retentionDays` across ALL leagues — the storage ceiling. */
export function pruneSnapshots(retentionDays: number): number {
  return getDb()
    .prepare(`DELETE FROM price_snapshots WHERE fetched_at < datetime('now', ?)`)
    .run(`-${retentionDays} days`).changes;
}

/** Search one league's known items by name (for the watchlist add-search). */
export function searchItems(
  league: string,
  q: string,
  limit = 25,
): Array<{ itemId: string; itemName: string; category: string }> {
  return getDb()
    .prepare(
      `SELECT item_id AS itemId, item_name AS itemName, category
       FROM price_snapshots WHERE league = ? AND item_name LIKE ? COLLATE NOCASE
       GROUP BY item_id ORDER BY item_name LIMIT ?`,
    )
    .all(league, `%${q}%`, limit) as Array<{ itemId: string; itemName: string; category: string }>;
}

/** Latest snapshot per item in one league (for current-price views). */
export function latestSnapshots(league: string): PricedItem[] {
  const rows = getDb()
    .prepare(
      `SELECT s.item_id AS itemId, s.item_name AS itemName, s.category,
              s.chaos_equiv AS baseValue, s.volume, s.icon,
              sp.change_7d AS change7d, sp.spark_7d AS spark7dJson
       FROM price_snapshots s
       JOIN (
         SELECT item_id, MAX(id) AS mx FROM price_snapshots WHERE league = ? GROUP BY item_id
       ) m ON m.item_id = s.item_id AND m.mx = s.id
       LEFT JOIN item_spark sp ON sp.item_id = s.item_id AND sp.league = s.league`,
    )
    .all(league) as Array<Omit<PricedItem, "spark7d"> & { spark7dJson: string | null }>;
  return rows.map(({ spark7dJson, ...r }) => ({
    ...r,
    spark7d: spark7dJson ? (JSON.parse(spark7dJson) as number[]) : null,
  }));
}

/** Price history for one item in one league, oldest→newest, limited. */
export function priceHistory(
  league: string,
  itemId: string,
  limit = 168,
): Array<{ baseValue: number; volume: number; fetchedAt: string }> {
  return getDb()
    .prepare(
      `SELECT chaos_equiv AS baseValue, volume, fetched_at AS fetchedAt
       FROM price_snapshots WHERE league = ? AND item_id = ?
       ORDER BY fetched_at DESC LIMIT ?`,
    )
    .all(league, itemId, limit)
    .reverse() as Array<{ baseValue: number; volume: number; fetchedAt: string }>;
}

/** Latest ninja 7d sparkline + change + current price for one item in one league.
 *  Lets the chart show a retroactive 7-day curve before our own DB has spanned that long. */
export function itemSpark(
  league: string,
  itemId: string,
): { spark7d: number[] | null; change7d: number | null; baseValue: number | null } {
  const db = getDb();
  const sp = db
    .prepare(
      `SELECT spark_7d AS spark7dJson, change_7d AS change7d FROM item_spark
       WHERE league = ? AND item_id = ?`,
    )
    .get(league, itemId) as { spark7dJson: string | null; change7d: number | null } | undefined;
  const base = db
    .prepare(
      `SELECT chaos_equiv AS baseValue FROM price_snapshots
       WHERE league = ? AND item_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(league, itemId) as { baseValue: number } | undefined;
  return {
    spark7d: sp?.spark7dJson ? (JSON.parse(sp.spark7dJson) as number[]) : null,
    change7d: sp?.change7d ?? null,
    baseValue: base?.baseValue ?? null,
  };
}

/** Newest snapshot time across one league's items — for the "data age" indicator. */
export function latestFetchedAt(league: string): string | null {
  const row = getDb()
    .prepare("SELECT MAX(fetched_at) AS mx FROM price_snapshots WHERE league = ?")
    .get(league) as { mx: string | null };
  return row.mx ?? null;
}

// --- market valuation cache (item_values) ---

/** Bulk-upsert resolved item values (e.g. scout uniques) for one league, keyed by lowercased name. */
export function upsertItemValues(
  league: string,
  rows: Array<{ nameKey: string; div: number; source: string }>,
): void {
  if (rows.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO item_values (league, name_key, value_div, source, updated_at)
     VALUES (@league, @nameKey, @div, @source, CURRENT_TIMESTAMP)
     ON CONFLICT(league, name_key) DO UPDATE SET
       value_div = excluded.value_div, source = excluded.source, updated_at = CURRENT_TIMESTAMP`,
  );
  const tx = db.transaction((rs: Array<{ nameKey: string; div: number; source: string }>) => {
    for (const r of rs) stmt.run({ ...r, league });
  });
  tx(rows);
}

/** name(lowercased) → unit Div value in one league, from the valuation cache. */
export function uniqueValueMap(league: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of getDb()
    .prepare("SELECT name_key, value_div FROM item_values WHERE league = ?")
    .all(league) as Array<{ name_key: string; value_div: number }>) {
    m.set(r.name_key, r.value_div);
  }
  return m;
}

/** Hours since this league's valuation cache was last refreshed, or null if empty. */
export function itemValuesAgeHours(league: string): number | null {
  const row = getDb()
    .prepare("SELECT MAX(updated_at) AS mx FROM item_values WHERE league = ?")
    .get(league) as { mx: string | null };
  if (!row.mx) return null;
  return (Date.now() - new Date(row.mx.replace(" ", "T") + "Z").getTime()) / 3600_000;
}

// --- price book (observed listings for rare-item valuation / snipe detection) ---

/** Record one observed listing under its signature. De-duped by listing_id (re-lists ignored). */
export function recordObservation(
  league: string,
  sig: string,
  baseType: string,
  priceDiv: number,
  listingId?: string | null,
): void {
  if (!(priceDiv > 0)) return;
  getDb()
    .prepare(
      `INSERT INTO price_book_obs (league, sig, base_type, price_div, listing_id)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(listing_id) WHERE listing_id IS NOT NULL DO NOTHING`,
    )
    .run(league, sig, baseType, priceDiv, listingId ?? null);
}

/** Recent observed prices for a signature in one league (within retention), for valuation.
 *  `excludeListingId` keeps the listing being judged out of its own reference distribution. */
export function observedPrices(league: string, sig: string, excludeListingId: string | null = null): number[] {
  return (
    getDb()
      .prepare(
        `SELECT price_div FROM price_book_obs
         WHERE league = ? AND sig = ? AND seen_at >= datetime('now', ?)
           AND (? IS NULL OR listing_id IS NULL OR listing_id != ?)`,
      )
      .all(league, sig, `-${config.snipe.obsRetentionDays} days`, excludeListingId, excludeListingId) as Array<{
      price_div: number;
    }>
  ).map((r) => r.price_div);
}

/** Drop price-book observations older than the snipe retention window, across ALL leagues. */
export function pruneObservations(): number {
  return getDb()
    .prepare(`DELETE FROM price_book_obs WHERE seen_at < datetime('now', ?)`)
    .run(`-${config.snipe.obsRetentionDays} days`).changes;
}
