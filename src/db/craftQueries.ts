import { getDb } from "./database";
import { addHunt, updateHunt, setHuntActive, type Hunt } from "./queries";

/**
 * Craft-margin persistence — kept out of queries.ts, which is already over the file-size cap.
 * Reports are SHARED (market-derived, not per-user): the poller writes, every web client reads.
 * They are LEAGUE-SCOPED: EV computed from one league's prices says nothing about another's.
 */

export interface CraftMarginRow {
  recipe_key: string;
  report_json: string;
  ev_div: number;
  margin_pct: number;
  scanned_at: string;
  last_error: string | null; // transient failure kept beside (not over) the last good report
  last_error_at: string | null;
}

/** Upsert the latest report for one recipe (poller writes it each scan). */
export function upsertCraftMargin(
  league: string,
  key: string,
  reportJson: string,
  evDiv: number,
  marginPct: number,
): void {
  getDb()
    .prepare(
      `INSERT INTO craft_margin_reports (league, recipe_key, report_json, ev_div, margin_pct, scanned_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(league, recipe_key) DO UPDATE SET
         report_json = excluded.report_json, ev_div = excluded.ev_div,
         margin_pct = excluded.margin_pct, scanned_at = CURRENT_TIMESTAMP,
         last_error = NULL, last_error_at = NULL`,
    )
    .run(league, key, reportJson, evDiv, marginPct);
}

/**
 * Record a transient scan failure (trade2 transport / rate-limit) WITHOUT touching the stored
 * report: a good report stays visible and rankable, the failure is shown beside it. scanned_at is
 * left alone on purpose, so the recipe stays stalest and the next tick retries it.
 */
export function recordCraftScanError(league: string, key: string, error: string): void {
  getDb()
    .prepare(
      `UPDATE craft_margin_reports SET last_error = ?, last_error_at = CURRENT_TIMESTAMP
       WHERE league = ? AND recipe_key = ?`,
    )
    .run(error, league, key);
}

/** One league's stored recipe reports, newest scan first. */
export function getCraftMargins(league: string): CraftMarginRow[] {
  return getDb()
    .prepare(
      `SELECT recipe_key, report_json, ev_div, margin_pct, scanned_at, last_error, last_error_at FROM craft_margin_reports
       WHERE league = ? ORDER BY scanned_at DESC`,
    )
    .all(league) as CraftMarginRow[];
}

/** Append one EV point to a recipe's history (drives the margin sparkline). */
export function insertMarginHistory(league: string, key: string, evDiv: number, marginPct: number): void {
  getDb()
    .prepare("INSERT INTO craft_margin_history (league, recipe_key, ev_div, margin_pct) VALUES (?, ?, ?, ?)")
    .run(league, key, evDiv, marginPct);
}

/** A recipe's recent EV history, oldest→newest, for a sparkline. */
export function getMarginHistory(
  league: string,
  key: string,
  limit = 30,
): Array<{ ev_div: number; scanned_at: string }> {
  return (
    getDb()
      .prepare(
        `SELECT ev_div, scanned_at FROM craft_margin_history
         WHERE league = ? AND recipe_key = ? ORDER BY scanned_at DESC LIMIT ?`,
      )
      .all(league, key, limit) as Array<{ ev_div: number; scanned_at: string }>
  ).reverse();
}

/** Drop craft-margin history older than the retention window, across ALL leagues (time-based). */
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
export function getCurrencyDivMap(league: string): Map<string, number> {
  const rows = getDb()
    .prepare(
      `SELECT s.item_id AS id, s.chaos_equiv AS div
       FROM price_snapshots s
       JOIN (SELECT item_id, MAX(id) AS mx FROM price_snapshots
             WHERE league = ? AND category = 'Currency' GROUP BY item_id) m
         ON m.item_id = s.item_id AND m.mx = s.id`,
    )
    .all(league) as Array<{ id: string; div: number }>;
  return new Map(rows.map((r) => [r.id, r.div]));
}

/**
 * Latest priced snapshot for a set of material ids (Div price + 7d spark + age). One query, so the
 * margin engine and the materials panel share the same source. Ids with no snapshot are absent
 * from the map (the caller decides whether that's "missing-materials" or falls back to a manual price).
 */
export function getMaterialPrices(league: string, ids: readonly string[]): Map<string, MaterialPrice> {
  const out = new Map<string, MaterialPrice>();
  if (ids.length === 0) return out;
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(
      `SELECT s.item_id AS itemId, s.item_name AS itemName, s.chaos_equiv AS priceDiv, s.icon AS icon,
              (julianday('now') - julianday(s.fetched_at)) * 1440 AS ageMin,
              sp.change_7d AS change7d, sp.spark_7d AS spark7dJson
       FROM price_snapshots s
       JOIN (SELECT item_id, MAX(id) AS mx FROM price_snapshots
             WHERE league = ? AND item_id IN (${placeholders}) GROUP BY item_id) m
         ON m.item_id = s.item_id AND m.mx = s.id
       LEFT JOIN item_spark sp ON sp.item_id = s.item_id AND sp.league = s.league`,
    )
    .all(league, ...ids) as Array<{
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
  spent_div: number; // base + mats over REALIZED attempts (bricks + sold hits)
  sold_div: number; // realized sales
  pending: number; // open attempts + hits kept/unsold — outcome value not known yet
  pending_cost_div: number; // capital tied up in those pending attempts
}

// An attempt's value is known once it bricked or its hit was sold.
const REALIZED = "(outcome = 'brick' OR (outcome = 'hit' AND sold_div IS NOT NULL))";

/**
 * Per-recipe aggregates over the user's attempts — real hit rate + realized net vs the model.
 * A hit with no sale price is KEPT/PENDING, not a loss: counting its cost against a 0 sale would
 * show every unsold hit as a brick. Realized = bricks + hits with a recorded sale.
 */
export function craftPnlByRecipe(userId: number): RecipePnl[] {
  return getDb()
    .prepare(
      `SELECT recipe_key,
              COUNT(*) AS attempts,
              SUM(CASE WHEN outcome != 'open' THEN 1 ELSE 0 END) AS closed,
              SUM(CASE WHEN outcome = 'hit' THEN 1 ELSE 0 END) AS hits,
              SUM(CASE WHEN ${REALIZED} THEN base_cost_div + mats_cost_div ELSE 0 END) AS spent_div,
              SUM(CASE WHEN ${REALIZED} THEN COALESCE(sold_div, 0) ELSE 0 END) AS sold_div,
              SUM(CASE WHEN ${REALIZED} THEN 0 ELSE 1 END) AS pending,
              SUM(CASE WHEN ${REALIZED} THEN 0 ELSE base_cost_div + mats_cost_div END) AS pending_cost_div
       FROM craft_attempts WHERE user_id = ? GROUP BY recipe_key`,
    )
    .all(userId) as RecipePnl[];
}

export type CraftBaseHunt = Omit<Hunt, "id" | "user_id" | "active" | "last_scan_at" | "last_hit_at" | "created_at">;

/**
 * Create or refresh the user's craft-base hunt for one recipe in one league. Clicking
 * "hunt this base" again must move the existing hunt's cap, not stack a duplicate that scans
 * (and spends trade2 budget) twice. Identity is hunts.recipe_key (survives a label rename); a
 * pre-recipe_key preset row is adopted by its deterministic label once, then keyed. The hunt is
 * re-activated because re-clicking means "I want this running".
 */
export function upsertCraftBaseHunt(
  userId: number,
  league: string,
  recipeKey: string,
  hunt: CraftBaseHunt,
): { id: number; created: boolean } {
  const db = getDb();
  const existing = (db
    .prepare(
      `SELECT id FROM hunts WHERE user_id = ? AND league = ? AND mode = 'CRAFT_BASE'
         AND (recipe_key = ? OR (recipe_key IS NULL AND label = ?))
       ORDER BY (recipe_key IS NULL), id LIMIT 1`,
    )
    .get(userId, league, recipeKey, hunt.label) as { id: number } | undefined)?.id;
  const id = existing ?? addHunt(userId, league, hunt);
  if (existing != null) {
    updateHunt(userId, existing, hunt);
    setHuntActive(userId, existing, true);
  }
  db.prepare("UPDATE hunts SET recipe_key = ? WHERE user_id = ? AND id = ?").run(recipeKey, userId, id);
  // The old label-keyed upsert let repeated clicks stack duplicates, each still scanning with a
  // junk-floor cap. The keyed row above is now the one; switch the leftovers off (kept, not
  // deleted — they are the user's rows and carry hit history).
  db.prepare(
    `UPDATE hunts SET active = 0
     WHERE user_id = ? AND league = ? AND mode = 'CRAFT_BASE' AND recipe_key IS NULL AND label = ? AND id != ?`,
  ).run(userId, league, hunt.label, id);
  return { id, created: existing == null };
}
