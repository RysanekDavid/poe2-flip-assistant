import { getDb } from "./database";

/**
 * Craft-margin persistence — kept out of queries.ts, which is already over the file-size cap.
 * Reports are SHARED (market-derived, not per-user): the poller writes, every web client reads.
 */

export interface CraftMarginRow {
  recipe_key: string;
  report_json: string;
  ev_div: number;
  margin_pct: number;
  scanned_at: string;
}

/** Upsert the latest report for one recipe (poller writes it each scan). */
export function upsertCraftMargin(key: string, reportJson: string, evDiv: number, marginPct: number): void {
  getDb()
    .prepare(
      `INSERT INTO craft_margin_reports (recipe_key, report_json, ev_div, margin_pct, scanned_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(recipe_key) DO UPDATE SET
         report_json = excluded.report_json, ev_div = excluded.ev_div,
         margin_pct = excluded.margin_pct, scanned_at = CURRENT_TIMESTAMP`,
    )
    .run(key, reportJson, evDiv, marginPct);
}

/** All stored recipe reports, newest scan first. */
export function getCraftMargins(): CraftMarginRow[] {
  return getDb()
    .prepare("SELECT recipe_key, report_json, ev_div, margin_pct, scanned_at FROM craft_margin_reports ORDER BY scanned_at DESC")
    .all() as CraftMarginRow[];
}

/** Append one EV point to a recipe's history (drives the margin sparkline). */
export function insertMarginHistory(key: string, evDiv: number, marginPct: number): void {
  getDb()
    .prepare("INSERT INTO craft_margin_history (recipe_key, ev_div, margin_pct) VALUES (?, ?, ?)")
    .run(key, evDiv, marginPct);
}

/** A recipe's recent EV history, oldest→newest, for a sparkline. */
export function getMarginHistory(key: string, limit = 30): Array<{ ev_div: number; scanned_at: string }> {
  return (
    getDb()
      .prepare(
        `SELECT ev_div, scanned_at FROM craft_margin_history WHERE recipe_key = ? ORDER BY scanned_at DESC LIMIT ?`,
      )
      .all(key, limit) as Array<{ ev_div: number; scanned_at: string }>
  ).reverse();
}

/** Drop craft-margin history rows older than the retention window. Returns rows deleted. */
export function pruneMarginHistory(retentionDays: number): number {
  return getDb()
    .prepare(`DELETE FROM craft_margin_history WHERE scanned_at < datetime('now', ?)`)
    .run(`-${retentionDays} days`).changes;
}

/** Delete stored reports/history for recipe keys no longer present in code (recipe removed/renamed). */
export function pruneStaleRecipeReports(validKeys: readonly string[]): number {
  const db = getDb();
  const stored = (db.prepare("SELECT recipe_key FROM craft_margin_reports").all() as Array<{ recipe_key: string }>).map(
    (r) => r.recipe_key,
  );
  const valid = new Set(validKeys);
  let deleted = 0;
  for (const key of stored) {
    if (valid.has(key)) continue;
    db.prepare("DELETE FROM craft_margin_reports WHERE recipe_key = ?").run(key);
    db.prepare("DELETE FROM craft_margin_history WHERE recipe_key = ?").run(key);
    deleted++;
  }
  return deleted;
}

/** Queue a full-refresh request (web POST) for the poller to consume — the web + poller are
 *  separate processes with separate rate limiters, so the web must NOT call trade2 directly. */
export function requestCraftRefresh(): void {
  getDb()
    .prepare(
      `INSERT INTO craft_refresh_request (id, requested, requested_at) VALUES (1, 1, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET requested = 1, requested_at = CURRENT_TIMESTAMP`,
    )
    .run();
}

/** Atomically read-and-clear the refresh flag. Returns true iff a refresh was pending. */
export function consumeCraftRefresh(): boolean {
  const changes = getDb().prepare("UPDATE craft_refresh_request SET requested = 0 WHERE id = 1 AND requested = 1").run().changes;
  return changes > 0;
}

export interface MaterialPrice {
  itemId: string;
  itemName: string;
  priceDiv: number; // latest snapshot value in Divine (exchange base unit)
  change7d: number | null;
  spark7d: number[] | null;
  ageMin: number | null; // minutes since the snapshot was fetched
}

/**
 * Latest priced snapshot for a set of material ids (Div price + 7d spark + age). One query, so the
 * margin engine and the materials panel share the same source. Ids with no snapshot are absent
 * from the map (the caller decides whether that's "missing-materials" or falls back to a manual price).
 */
export function getMaterialPrices(ids: readonly string[]): Map<string, MaterialPrice> {
  const out = new Map<string, MaterialPrice>();
  if (ids.length === 0) return out;
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT s.item_id AS itemId, s.item_name AS itemName, s.chaos_equiv AS priceDiv,
              (julianday('now') - julianday(s.fetched_at)) * 1440 AS ageMin,
              sp.change_7d AS change7d, sp.spark_7d AS spark7dJson
       FROM price_snapshots s
       JOIN (SELECT item_id, MAX(id) AS mx FROM price_snapshots WHERE item_id IN (${placeholders}) GROUP BY item_id) m
         ON m.item_id = s.item_id AND m.mx = s.id
       LEFT JOIN item_spark sp ON sp.item_id = s.item_id`,
    )
    .all(...ids) as Array<{
    itemId: string;
    itemName: string;
    priceDiv: number;
    ageMin: number | null;
    change7d: number | null;
    spark7dJson: string | null;
  }>;
  for (const r of rows) {
    out.set(r.itemId, {
      itemId: r.itemId,
      itemName: r.itemName,
      priceDiv: r.priceDiv,
      change7d: r.change7d,
      spark7d: r.spark7dJson ? (JSON.parse(r.spark7dJson) as number[]) : null,
      ageMin: r.ageMin != null ? Math.round(r.ageMin) : null,
    });
  }
  return out;
}
