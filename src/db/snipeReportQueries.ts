import { getDb } from "./database";
import { parseScanReport, type ParsedReport } from "../lib/snipeScanContract";

/** The latest auto-snipe scan report and the last whole-scan failure — the poller writes, the web UI and the Coach read. */

export function saveSnipeReport(reportJson: string): void {
  getDb()
    .prepare(
      `INSERT INTO autosnipe_report (id, report_json, scanned_at) VALUES (1, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET report_json = excluded.report_json, scanned_at = CURRENT_TIMESTAMP`,
    )
    .run(reportJson);
}

/** Record a scan that failed as a whole — separately, so the last good report survives. */
export function saveSnipeFailure(error: string): void {
  getDb()
    .prepare(
      `INSERT INTO autosnipe_failure (id, error, failed_at) VALUES (1, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET error = excluded.error, failed_at = CURRENT_TIMESTAMP`,
    )
    .run(error);
}

export function getSnipeFailure(): { error: string; failed_at: string } | null {
  const row = getDb().prepare("SELECT error, failed_at FROM autosnipe_failure WHERE id = 1").get() as
    | { error: string; failed_at: string }
    | undefined;
  return row ?? null;
}

export function getSnipeReport(): { report_json: string; scanned_at: string } | null {
  const row = getDb().prepare("SELECT report_json, scanned_at FROM autosnipe_report WHERE id = 1").get() as
    | { report_json: string; scanned_at: string }
    | undefined;
  return row ?? null;
}

/**
 * The last report read against the scan contract: the report, or why it cannot be read (logged).
 * null = no scan has reported yet. Readers that only need parts of it (near-misses) use this, so a
 * damaged row is reported the same way everywhere.
 */
export function lastScanReport(): ParsedReport | null {
  const last = getSnipeReport();
  if (!last) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(last.report_json);
  } catch (e) {
    const error = `last scan report is not JSON: ${e instanceof Error ? e.message : String(e)}`;
    console.error(`[snipe] ${error}`);
    return { report: null, error };
  }
  const parsed = parseScanReport(raw);
  if (parsed.error) console.error(`[snipe] ${parsed.error}`);
  return parsed;
}
