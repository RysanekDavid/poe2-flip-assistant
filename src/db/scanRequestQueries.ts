import { getDb } from "./database";

/**
 * Cross-process scan queue. The web routes used to run trade2 scans inline on the web process's
 * own limiter — a SECOND limiter spending the same account+IP budget as the poller, blind to it.
 * Now the web only enqueues here; the poller drains the queue and runs scans on the one limiter.
 */
export type ScanKind = "autosnipe" | "hunts";

/** Queue a scan (idempotent — a pending request for the same kind+user is simply refreshed). */
export function requestScan(kind: ScanKind, userId = 0): void {
  getDb()
    .prepare(
      `INSERT INTO scan_request (kind, user_id, requested_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(kind, user_id) DO UPDATE SET requested_at = CURRENT_TIMESTAMP`,
    )
    .run(kind, userId);
}

/** Atomically take every pending request of `kind`; returns the requesting user ids. */
export function consumeScanRequests(kind: ScanKind): number[] {
  const db = getDb();
  return db.transaction(() => {
    const rows = db.prepare("SELECT user_id FROM scan_request WHERE kind = ?").all(kind) as Array<{ user_id: number }>;
    db.prepare("DELETE FROM scan_request WHERE kind = ?").run(kind);
    return rows.map((r) => r.user_id);
  })();
}

/** Whether a request of `kind` (for `userId`) is still waiting — lets the UI say "queued". */
export function isScanPending(kind: ScanKind, userId = 0): boolean {
  return getDb().prepare("SELECT 1 FROM scan_request WHERE kind = ? AND user_id = ?").get(kind, userId) != null;
}
