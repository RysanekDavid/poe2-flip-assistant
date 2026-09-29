import { NextResponse } from "next/server";
import { SNIPE_PROFILES } from "../../../../core/snipeProfiles";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";
import { getSnipeFailure, getSnipeReport } from "../../../../db/snipeReportQueries";
import { isScanPending, requestScan } from "../../../../db/scanRequestQueries";
import { config } from "../../../../config/env";
import { SnipeScanStatusSchema, reportForViewer, type SnipeScanStatus } from "../../../../lib/snipeScanContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The stored report JSON. Unparseable JSON is logged and handed on as a marker the client's
 * schema rejects ("last report unreadable — rescan"), so the scanner status itself still loads.
 */
function storedReport(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch (e) {
    console.error("[snipe] stored scan report is not valid JSON", e);
    return { unreadable: e instanceof Error ? e.message : String(e) };
  }
}

/** GET → list the archetypes + scanner status (no trade2 calls). Diagnostics are owner-only. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cred = await getCallerCred();
  const last = getSnipeReport();
  const failure = getSnipeFailure();
  // a failure only matters while it is newer than the last good report (sqlite UTC text sorts)
  const failureCurrent = failure != null && (last == null || failure.failed_at >= last.scanned_at);
  const owner = user.role === "owner";
  const body: SnipeScanStatus = {
    enabled: config.autoSnipe.enabled,
    live: cred != null,
    canScan: owner,
    intervalMin: config.autoSnipe.intervalMin,
    profiles: SNIPE_PROFILES.map((p) => ({ key: p.key, label: p.label, category: p.category })),
    lastReport: last ? reportForViewer(storedReport(last.report_json), owner) : null,
    lastScanAt: last?.scanned_at ?? null,
    pending: isScanPending("autosnipe"),
    lastError: failureCurrent ? failure.error : null,
    failedAt: failure?.failed_at ?? null,
  };
  return NextResponse.json(SnipeScanStatusSchema.parse(body));
}

/**
 * POST → queue ONE autonomous scan (owner-only — it spends trade2 rate budget). The poller runs
 * it under the owner's cred on its own limiter; the UI picks the report up via GET.
 */
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "owner only" }, { status: 403 });
  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json({ error: "POESESSID not set — add your session cookie in Settings." }, { status: 503 });
  }
  requestScan("autosnipe");
  return NextResponse.json({ queued: true }, { status: 202 });
}
