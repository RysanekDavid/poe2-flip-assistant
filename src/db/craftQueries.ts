import { timestampAgeMs } from "../lib/sqliteTime";
import { getDb } from "./database";
import { latestPriceRows, latestPriceRowsFor } from "./latestSnapshotQueries";

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
  return new Map(
    latestPriceRows(league)
      .filter((r) => r.category === "Currency")
      .map((r) => [r.itemId, r.baseValue]),
  );
}

/**
 * Latest priced snapshot for a set of material ids (Div price + 7d spark + age). One query, so the
 * margin engine and the materials panel share the same source. Ids with no snapshot are absent
 * from the map (the caller decides whether that's "missing-materials" or falls back to a manual price).
 */
export function getMaterialPrices(league: string, ids: readonly string[]): Map<string, MaterialPrice> {
  const nowMs = Date.now();
  return new Map(
    latestPriceRowsFor(league, ids).map((r) => [
      r.itemId,
      {
        itemId: r.itemId,
        itemName: r.itemName,
        priceDiv: r.baseValue,
        icon: r.icon,
        change7d: r.change7d,
        spark7d: r.spark7d,
        ageMin: Math.round(timestampAgeMs(r.fetchedAt, nowMs) / 60_000),
      },
    ]),
  );
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

export interface CraftAttemptSampleRow {
  recipeKey: string;
  userId: number;
  outcome: "hit" | "brick";
  costDiv: number;
  createdAt: string;
}

/**
 * Every closed attempt (hit or brick) of EVERY user — the raw calibration sample; the pooling rules
 * (per-user cap, cost and patch cutoffs) live in craftProvenance/calibration.ts. Unlike
 * craftPnlByRecipe this ignores sale prices: a kept, unsold hit is still a hit.
 */
export function craftAttemptSampleRows(): CraftAttemptSampleRow[] {
  return getDb()
    .prepare(
      `SELECT recipe_key AS recipeKey, user_id AS userId, outcome, base_cost_div + mats_cost_div AS costDiv, created_at AS createdAt
       FROM craft_attempts WHERE outcome IN ('hit', 'brick')`,
    )
    .all() as CraftAttemptSampleRow[];
}

/** When a patch thread with this version went live (published, else first seen); null if unknown. */
export function officialPatchSeenAt(version: string): string | null {
  const row = getDb()
    .prepare("SELECT COALESCE(published_at, first_seen_at) AS at FROM official_patch WHERE lower(version_text) = ? ORDER BY source_order LIMIT 1")
    .get(version.toLowerCase()) as { at: string } | undefined;
  return row?.at ?? null;
}

/** Official patch threads with a valid body — the candidates a recipe can go stale on. */
export function officialPatchVersions(): Array<{ threadId: number; versionText: string; title: string }> {
  return getDb()
    .prepare("SELECT thread_id AS threadId, version_text AS versionText, title FROM official_patch WHERE body_valid = 1 ORDER BY source_order")
    .all() as Array<{ threadId: number; versionText: string; title: string }>;
}
