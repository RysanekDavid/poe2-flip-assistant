import type Database from "better-sqlite3";
import { z } from "zod";
import { getDb } from "./database";
import type { TradeQuery } from "../lib/tradeLink";
import { OUTCOME_METHODS, OUTCOME_STATES, type Checkpoint, type OutcomeMethod, type OutcomeState } from "../lib/snipeOutcomeContract";

/**
 * snipe_outcomes: one row per alerted snipe listing, re-checked ~2 h and ~24 h later
 * (core/snipeOutcomes/check). Time columns are epoch ms from the caller's clock.
 *
 * Wave 0 created the table; the columns below were found missing when the checker was built
 * (which method answered, the re-search query for an expired search id, the retry counter). They
 * are added here, idempotently, on first use by each connection.
 */
const OUTCOME_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["check_2h_method", "TEXT CHECK (check_2h_method IS NULL OR check_2h_method IN ('fetch', 'search'))"],
  ["check_24h_method", "TEXT CHECK (check_24h_method IS NULL OR check_24h_method IN ('fetch', 'search'))"],
  // JSON TradeQuery (seller account + base) for the re-search fallback; NULL = seller unknown
  ["recheck_query", "TEXT"],
  // failed attempts at the pending checkpoint; the second failure records 'error'
  ["attempts", "INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)"],
];

const ensured = new WeakSet<Database.Database>();

export function ensureSnipeOutcomeColumns(conn: Database.Database): void {
  const existing = new Set((conn.prepare("PRAGMA table_info(snipe_outcomes)").all() as Array<{ name: string }>).map((r) => r.name));
  if (existing.size === 0) throw new Error("snipe_outcomes missing — ensureFeatureTables must run first");
  for (const [name, def] of OUTCOME_COLUMNS) {
    if (!existing.has(name)) conn.exec(`ALTER TABLE snipe_outcomes ADD COLUMN ${name} ${def}`);
  }
}

function conn(): Database.Database {
  const c = getDb();
  if (!ensured.has(c)) {
    ensureSnipeOutcomeColumns(c);
    ensured.add(c);
  }
  return c;
}

const RecheckQuerySchema = z
  .object({
    name: z.string().optional(),
    type: z.string().optional(),
    online: z.boolean().optional(),
    account: z.string().min(1),
    ilvlMin: z.number().int().positive().optional(),
  })
  .strict();

const State = z.enum(OUTCOME_STATES).nullable();
const Method = z.enum(OUTCOME_METHODS).nullable();

const OutcomeRowSchema = z.object({
  listing_id: z.string(),
  league: z.string(),
  profile: z.string(),
  margin_pct: z.number(),
  query_id: z.string().nullable(),
  alerted_at: z.number().int(),
  check_2h: State,
  check_2h_at: z.number().int().nullable(),
  check_2h_ask_div: z.number().nullable(),
  check_2h_method: Method,
  check_24h: State,
  check_24h_at: z.number().int().nullable(),
  check_24h_ask_div: z.number().nullable(),
  check_24h_method: Method,
  recheck_query: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  last_error: z.string().nullable(),
});
export type OutcomeRow = z.infer<typeof OutcomeRowSchema>;

const ROW_COLUMNS = OutcomeRowSchema.keyof().options.join(", ");
const parseRows = (raw: unknown[]): OutcomeRow[] => raw.map((r) => OutcomeRowSchema.parse(r));

export interface NewSnipeOutcome {
  listingId: string;
  league: string;
  profile: string;
  baseType: string;
  itemName: string;
  askDiv: number;
  valueDiv: number;
  marginPct: number;
  samples: number;
  queryId: string; // the search that FOUND the listing — /fetch must quote it
  recheckQuery: TradeQuery | null; // null when the seller is unknown (no re-search possible)
  alertedAt: number;
}

/** Start tracking an alerted listing. Once per listing, ever (like the SNIPE alert). */
export function recordSnipeOutcome(o: NewSnipeOutcome): boolean {
  const recheck = o.recheckQuery == null ? null : JSON.stringify(RecheckQuerySchema.parse(o.recheckQuery));
  const res = conn()
    .prepare(
      `INSERT OR IGNORE INTO snipe_outcomes
         (listing_id, league, profile, base_type, item_name, ask_div, value_div, margin_pct, samples, query_id, alerted_at, recheck_query)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(o.listingId, o.league, o.profile, o.baseType, o.itemName, o.askDiv, o.valueDiv, o.marginPct, o.samples, o.queryId, o.alertedAt, recheck);
  return res.changes === 1;
}

/** The stored re-search query, validated; null when none was stored. A bad row throws. */
export function recheckQueryOf(row: OutcomeRow): TradeQuery | null {
  if (row.recheck_query == null) return null;
  return RecheckQuerySchema.parse(JSON.parse(row.recheck_query));
}

export const HOUR_MS = 3_600_000;

/**
 * Rows whose checkpoint is due, oldest first. The 24 h check waits for the 2 h one to be settled
 * and is skipped once a listing is gone (a gone listing id never comes back).
 */
export function dueOutcomes(nowMs: number, limit: number): { due2h: OutcomeRow[]; due24h: OutcomeRow[] } {
  const c = conn();
  const due2h = c
    .prepare(`SELECT ${ROW_COLUMNS} FROM snipe_outcomes WHERE check_2h IS NULL AND alerted_at <= ? ORDER BY alerted_at LIMIT ?`)
    .all(nowMs - 2 * HOUR_MS, limit);
  const due24h = c
    .prepare(
      `SELECT ${ROW_COLUMNS} FROM snipe_outcomes
       WHERE check_2h IS NOT NULL AND check_2h != 'gone' AND check_24h IS NULL AND alerted_at <= ?
       ORDER BY alerted_at LIMIT ?`,
    )
    .all(nowMs - 24 * HOUR_MS, limit);
  return { due2h: parseRows(due2h), due24h: parseRows(due24h) };
}

export interface CheckWrite {
  state: OutcomeState;
  askDiv: number | null;
  method: OutcomeMethod | null;
  error: string | null; // kept in last_error (an 'error' state must carry one)
}

// whitelisted column names per checkpoint — never interpolate caller strings
const CHECK_COLUMNS: Record<Checkpoint, { state: string; at: string; ask: string; method: string }> = {
  "2h": { state: "check_2h", at: "check_2h_at", ask: "check_2h_ask_div", method: "check_2h_method" },
  "24h": { state: "check_24h", at: "check_24h_at", ask: "check_24h_ask_div", method: "check_24h_method" },
};

/** Settle a checkpoint. Resets the retry counter for the next checkpoint. */
export function writeCheck(listingId: string, cp: Checkpoint, w: CheckWrite, nowMs: number): void {
  if (w.state === "error" && !w.error) throw new Error(`writeCheck ${listingId}: an error outcome needs its reason`);
  if (w.state !== "listed" && w.askDiv != null) throw new Error(`writeCheck ${listingId}: only a listed outcome has an ask`);
  const col = CHECK_COLUMNS[cp];
  const res = conn()
    .prepare(
      `UPDATE snipe_outcomes SET ${col.state} = ?, ${col.at} = ?, ${col.ask} = ?, ${col.method} = ?, attempts = 0,
         last_error = COALESCE(?, last_error)
       WHERE listing_id = ? AND ${col.state} IS NULL`,
    )
    .run(w.state, nowMs, w.askDiv, w.method, w.error, listingId);
  if (res.changes !== 1) throw new Error(`writeCheck ${listingId} ${cp}: row missing or checkpoint already settled`);
}

/** A failed attempt that will be retried on the next run. */
export function writeAttemptFailure(listingId: string, error: string): void {
  const res = conn().prepare("UPDATE snipe_outcomes SET attempts = attempts + 1, last_error = ? WHERE listing_id = ?").run(error, listingId);
  if (res.changes !== 1) throw new Error(`writeAttemptFailure ${listingId}: row missing`);
}

/** Forget a query id proven useless (it served null for a listing a re-search found listed). */
export function clearQueryId(listingIds: readonly string[]): void {
  const stmt = conn().prepare("UPDATE snipe_outcomes SET query_id = NULL WHERE listing_id = ?");
  conn().transaction(() => {
    for (const id of listingIds) stmt.run(id);
  })();
}

/** Tracked rows alerted since `sinceMs`, newest first — the route's view + stats input. */
export function outcomesSince(sinceMs: number, limit: number): OutcomeRow[] {
  return parseRows(
    conn().prepare(`SELECT ${ROW_COLUMNS} FROM snipe_outcomes WHERE alerted_at >= ? ORDER BY alerted_at DESC LIMIT ?`).all(sinceMs, limit),
  );
}
