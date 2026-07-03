import { NextResponse } from "next/server";
import { scanAutoSnipes } from "../../../../core/autoSnipe";
import { SNIPE_PROFILES } from "../../../../core/snipeProfiles";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";
import { getSnipeReport } from "../../../../db/queries";
import { config } from "../../../../config/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → list the archetypes + scanner status (no trade2 calls). */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cred = await getCallerCred();
  const last = getSnipeReport();
  return NextResponse.json({
    enabled: config.autoSnipe.enabled,
    live: cred != null,
    intervalMin: config.autoSnipe.intervalMin,
    profiles: SNIPE_PROFILES.map((p) => ({ key: p.key, label: p.label, category: p.category })),
    lastReport: last ? JSON.parse(last.report_json) : null,
    lastScanAt: last?.scanned_at ?? null,
  });
}

/**
 * POST → run the autonomous scan ONCE now (owner-only — it spends trade2 rate budget).
 * Use this to validate the archetypes resolve + categories are right before enabling the cron.
 */
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (user.role !== "owner") return NextResponse.json({ error: "owner only" }, { status: 403 });
  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json({ error: "POESESSID not set — add your session cookie in Settings." }, { status: 503 });
  }
  try {
    const report = await scanAutoSnipes(cred);
    return NextResponse.json(report);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
