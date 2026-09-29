import { z } from "zod";
import { getDb } from "./database";
import type { TradeQuery } from "../lib/tradeLink";
import { FETCH_METHOD_STATES, OUTCOME_METHODS, OUTCOME_STATES, type Checkpoint, type FetchMethodState, type OutcomeMethod, type OutcomeState } from "../lib/snipeOutcomeContract";

/**
 * snipe_outcomes: one row per alerted snipe listing, re-checked ~2 h and ~24 h later
 * (core/snipeOutcomes/check). Schema in featureMigrations. Time columns are epoch ms from the
 * caller's clock.
 */

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
  check_2h_ask_amount: z.number().nullable(),
  check_2h_ask_currency: z.string().nullable(),
  check_2h_method: Method,
  check_24h: State,
  check_24h_at: z.number().int().nullable(),
  check_24h_ask_div: z.number().nullable(),
  check_24h_ask_amount: z.number().nullable(),
  check_24h_ask_currency: z.string().nullable(),
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
  const res = getDb()
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
  const c = getDb();
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
  ask: { amount: number; currency: string; div: number | null } | null; // listed only; div null = unrated
  method: OutcomeMethod | null;
  error: string | null; // kept in last_error (an 'error' state must carry one)
}

// whitelisted column names per checkpoint — never interpolate caller strings
const CHECK_COLUMNS: Record<Checkpoint, string> = { "2h": "check_2h", "24h": "check_24h" };

/** Settle a checkpoint. Resets the retry counter for the next checkpoint. */
export function writeCheck(listingId: string, cp: Checkpoint, w: CheckWrite, nowMs: number): void {
  if (w.state === "error" && !w.error) throw new Error(`writeCheck ${listingId}: an error outcome needs its reason`);
  if (w.state !== "listed" && w.ask != null) throw new Error(`writeCheck ${listingId}: only a listed outcome has an ask`);
  const c = CHECK_COLUMNS[cp];
  const res = getDb()
    .prepare(
      `UPDATE snipe_outcomes SET ${c} = ?, ${c}_at = ?, ${c}_ask_div = ?, ${c}_ask_amount = ?, ${c}_ask_currency = ?, ${c}_method = ?,
         attempts = 0, last_error = COALESCE(?, last_error)
       WHERE listing_id = ? AND ${c} IS NULL`,
    )
    .run(w.state, nowMs, w.ask?.div ?? null, w.ask?.amount ?? null, w.ask?.currency ?? null, w.method, w.error, listingId);
  if (res.changes !== 1) throw new Error(`writeCheck ${listingId} ${cp}: row missing or checkpoint already settled`);
}

/** A failed attempt that will be retried on the next run. */
export function writeAttemptFailure(listingId: string, error: string): void {
  const res = getDb().prepare("UPDATE snipe_outcomes SET attempts = attempts + 1, last_error = ? WHERE listing_id = ?").run(error, listingId);
  if (res.changes !== 1) throw new Error(`writeAttemptFailure ${listingId}: row missing`);
}

/** Why a check was put off without settling or counting an attempt (e.g. an inconclusive cross-check). */
export function writeDeferral(listingIds: readonly string[], reason: string): void {
  const stmt = getDb().prepare("UPDATE snipe_outcomes SET last_error = ? WHERE listing_id = ?");
  getDb().transaction(() => {
    for (const id of listingIds) stmt.run(reason, id);
  })();
}

/** Tracked rows alerted since `sinceMs`, newest first — the route's view + stats input. */
export function outcomesSince(sinceMs: number, limit: number): OutcomeRow[] {
  return parseRows(
    getDb().prepare(`SELECT ${ROW_COLUMNS} FROM snipe_outcomes WHERE alerted_at >= ? ORDER BY alerted_at DESC LIMIT ?`).all(sinceMs, limit),
  );
}

const MetaSchema = z.object({ fetch_method: z.enum(FETCH_METHOD_STATES) });

/** Whether plan A has been shown to tell gone from listed. No row yet = unverified. */
export function getFetchMethodState(): FetchMethodState {
  const raw = getDb().prepare("SELECT fetch_method FROM snipe_outcome_meta WHERE id = 1").get();
  return raw == null ? "unverified" : MetaSchema.parse(raw).fetch_method;
}

/**
 * Record a cross-check verdict on plan A. A contradiction (the re-search found a listing the
 * fetch called gone) is final: broken never reverts on its own — the owner resets it after a fix.
 * Agreement only lifts unverified.
 */
export function recordFetchVerdict(verdict: "agrees" | "contradicts", evidence: string, nowMs: number): FetchMethodState {
  const current = getFetchMethodState();
  const next: FetchMethodState = verdict === "contradicts" ? "broken" : current === "unverified" ? "verified" : current;
  if (next !== current) {
    getDb()
      .prepare(
        `INSERT INTO snipe_outcome_meta (id, fetch_method, changed_at, evidence) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET fetch_method = excluded.fetch_method, changed_at = excluded.changed_at, evidence = excluded.evidence`,
      )
      .run(next, nowMs, evidence);
  }
  return next;
}
