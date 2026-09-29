import { z } from "zod";
import { getDb } from "./database";
import { isScanPending, requestScan } from "./scanRequestQueries";

/**
 * reprice_runs: one row per user — the 6h cooldown stamp and how the last Wealth › Sell reprice
 * check went. The web enqueues (enqueueReprice), the poller marks started/finished.
 */
export const REPRICE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** A run taken by the poller but unfinished after this long died with it (restart, crash). */
export const REPRICE_STALE_MS = 30 * 60 * 1000;

const runSchema = z.object({
  requested_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  checked: z.number().int(),
  searches: z.number().int(),
  error: z.string().nullable(),
});
export type RepriceRun = z.infer<typeof runSchema>;

export type RepricePhase = "none" | "queued" | "running" | "lost" | "done" | "failed";

export function getRepriceRun(userId: number): RepriceRun | null {
  const row = getDb()
    .prepare("SELECT requested_at, started_at, finished_at, checked, searches, error FROM reprice_runs WHERE user_id = ?")
    .get(userId);
  return row === undefined ? null : runSchema.parse(row);
}

const msOf = (iso: string): number => {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new Error(`reprice_runs timestamp unparseable: ${iso}`);
  return ms;
};

/**
 * Where the run is. Unfinished means queued (the request still waits in scan_request), running
 * (the poller took it recently) or lost (neither — the poller restarted mid-run or dropped it).
 */
export function repricePhase(run: RepriceRun | null, pending: boolean, nowMs: number): RepricePhase {
  if (run == null) return "none";
  if (run.finished_at != null) return run.error != null ? "failed" : "done";
  if (pending) return "queued";
  if (run.started_at != null && nowMs - msOf(run.started_at) < REPRICE_STALE_MS) return "running";
  return "lost";
}

/**
 * When the next check may be requested, or null if now. Neither a lost run nor one that failed
 * before spending a single search holds the cooldown — nothing was spent.
 */
export function repriceNextAt(run: RepriceRun | null, pending: boolean, nowMs: number): Date | null {
  const phase = repricePhase(run, pending, nowMs);
  if (run == null || phase === "lost" || (phase === "failed" && run.searches === 0)) return null;
  const next = msOf(run.requested_at) + REPRICE_COOLDOWN_MS;
  return next > nowMs ? new Date(next) : null;
}

/** The phase and cooldown for a user as the web sees them (pending = still in the scan queue). */
export function repriceState(userId: number, nowMs: number): { run: RepriceRun | null; phase: RepricePhase; nextAt: Date | null } {
  const run = getRepriceRun(userId);
  const pending = isScanPending("reprice", userId);
  return { run, phase: repricePhase(run, pending, nowMs), nextAt: repriceNextAt(run, pending, nowMs) };
}

/** Stamp the cooldown and queue the scan in ONE transaction: never a stamped run with no request. */
export function enqueueReprice(userId: number, at: Date): void {
  const db = getDb();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO reprice_runs (user_id, requested_at, started_at, finished_at, checked, searches, error) VALUES (?, ?, NULL, NULL, 0, 0, NULL)
       ON CONFLICT(user_id) DO UPDATE SET requested_at = excluded.requested_at, started_at = NULL, finished_at = NULL,
         checked = 0, searches = 0, error = NULL`,
    ).run(userId, at.toISOString());
    requestScan("reprice", userId);
  })();
}

/** The poller took these users' requests (called right after consuming them, before any await). */
export function markRepriceStarted(userIds: readonly number[], at: Date = new Date()): void {
  const stmt = getDb().prepare("UPDATE reprice_runs SET started_at = ? WHERE user_id = ? AND finished_at IS NULL");
  for (const id of userIds) stmt.run(at.toISOString(), id);
}

/** Throws when the user has no run row (deleted mid-run) — callers on a loop must guard it. */
export function finishRepriceRun(userId: number, r: { checked: number; searches: number; error: string | null }, at: Date = new Date()): void {
  const res = getDb()
    .prepare("UPDATE reprice_runs SET finished_at = ?, checked = ?, searches = ?, error = ? WHERE user_id = ?")
    .run(at.toISOString(), r.checked, r.searches, r.error == null ? null : r.error.slice(0, 300), userId);
  if (res.changes !== 1) throw new Error(`finishRepriceRun: no reprice run for user ${userId}`);
}

/**
 * A newly saved cookie gets a fresh chance: a FINISHED run's cooldown is lifted (the last check
 * may have failed on the old cookie). A queued or running check is left alone — the poller resolves
 * the cookie per request, so it already uses the new one.
 */
export function liftRepriceCooldown(userId: number): void {
  getDb()
    .prepare("UPDATE reprice_runs SET requested_at = '1970-01-01T00:00:00.000Z' WHERE user_id = ? AND finished_at IS NOT NULL")
    .run(userId);
}
