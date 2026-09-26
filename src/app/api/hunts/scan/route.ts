import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";
import { requestScan } from "../../../../db/scanRequestQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/hunts/scan → queue a scan of THIS user's active hunts. The poller runs it on its
 * trade2 limiter within ~20s (the web process never calls trade2 itself — one budget owner).
 * Results land as hits + per-hunt last_scan_at / last_error. Read-only.
 */
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json({ error: "POESESSID not set — add your session cookie in Settings" }, { status: 409 });
  }
  requestScan("hunts", user.id);
  return NextResponse.json({ queued: true }, { status: 202 });
}
