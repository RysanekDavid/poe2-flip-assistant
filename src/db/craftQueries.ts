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
  icon: string | null; // poecdn item art
  change7d: number | null;
  spark7d: number[] | null;
  ageMin: number | null; // minutes since the snapshot was fetched
}

/**
 * Latest Divine value for every Currency-category item, keyed by ninja item id. Trade2 listing
 * currency codes (alch, aug, regal, transmute, …) match these ids, so this map converts listings
 * priced in small currencies that the scout-rate path (div/ex/chaos) can't.
 */
export function getCurrencyDivMap(): Map<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT s.item_id AS id, s.chaos_equiv AS div
       FROM price_snapshots s
       JOIN (SELECT item_id, MAX(id) AS mx FROM price_snapshots WHERE category = 'Currency' GROUP BY item_id) m
         ON m.item_id = s.item_id AND m.mx = s.id`,
    )
    .all() as Array<{ id: string; div: number }>;
  return new Map(rows.map((r) => [r.id, r.div]));
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
      `SELECT s.item_id AS itemId, s.item_name AS itemName, s.chaos_equiv AS priceDiv, s.icon AS icon,
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
    icon: string | null;
    ageMin: number | null;
    change7d: number | null;
    spark7dJson: string | null;
  }>;
  for (const r of rows) {
    out.set(r.itemId, {
      itemId: r.itemId,
      itemName: r.itemName,
      priceDiv: r.priceDiv,
      icon: r.icon,
      change7d: r.change7d,
      spark7d: r.spark7dJson ? (JSON.parse(r.spark7dJson) as number[]) : null,
      ageMin: r.ageMin != null ? Math.round(r.ageMin) : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Craft P&L — real attempts the user logs (PER-USER), closing the loop on the
// model's EV/hitRate estimates with actual costs, outcomes and sale prices.
// ---------------------------------------------------------------------------

export type AttemptOutcome = "open" | "hit" | "brick";

export interface CraftAttempt {
  id: number;
  user_id: number;
  recipe_key: string;
  base_cost_div: number;
  mats_cost_div: number;
  outcome: AttemptOutcome;
  sold_div: number | null;
  note: string | null;
  created_at: string;
  closed_at: string | null;
}

export function addCraftAttempt(
  userId: number,
  a: { recipeKey: string; baseCostDiv: number; matsCostDiv: number; note?: string | null },
): number {
  const info = getDb()
    .prepare(
      `INSERT INTO craft_attempts (user_id, recipe_key, base_cost_div, mats_cost_div, note)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(userId, a.recipeKey, a.baseCostDiv, a.matsCostDiv, a.note ?? null);
  return Number(info.lastInsertRowid);
}

/** Close (or re-close) an attempt: outcome + realized sale. Sold may be null (kept/unsold). */
export function closeCraftAttempt(
  userId: number,
  id: number,
  outcome: Exclude<AttemptOutcome, "open">,
  soldDiv: number | null,
): void {
  getDb()
    .prepare(
      `UPDATE craft_attempts SET outcome = ?, sold_div = ?, closed_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND id = ?`,
    )
    .run(outcome, soldDiv, userId, id);
}

export function deleteCraftAttempt(userId: number, id: number): void {
  getDb().prepare("DELETE FROM craft_attempts WHERE user_id = ? AND id = ?").run(userId, id);
}

export function listCraftAttempts(userId: number, limit = 100): CraftAttempt[] {
  return getDb()
    .prepare("SELECT * FROM craft_attempts WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?")
    .all(userId, limit) as CraftAttempt[];
}

export interface RecipePnl {
  recipe_key: string;
  attempts: number;
  closed: number;
  hits: number;
  spent_div: number; // base + mats over all attempts
  sold_div: number; // realized sales over closed attempts
}

/** Per-recipe aggregates over the user's attempts — real hit rate + net vs the model. */
export function craftPnlByRecipe(userId: number): RecipePnl[] {
  return getDb()
    .prepare(
      `SELECT recipe_key,
              COUNT(*) AS attempts,
              SUM(CASE WHEN outcome != 'open' THEN 1 ELSE 0 END) AS closed,
              SUM(CASE WHEN outcome = 'hit' THEN 1 ELSE 0 END) AS hits,
              SUM(base_cost_div + mats_cost_div) AS spent_div,
              SUM(COALESCE(sold_div, 0)) AS sold_div
       FROM craft_attempts WHERE user_id = ? GROUP BY recipe_key`,
    )
    .all(userId) as RecipePnl[];
}
