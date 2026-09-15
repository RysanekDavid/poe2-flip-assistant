import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { getActiveLeague } from "../../../../core/leagueState";
import { readLeagueState } from "../../../../db/leagueQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/league/status → what the app tracks vs what detection last saw.
 * `canSwitch` drives the owner-only switch button in the banner (members see text only).
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tracked = getActiveLeague();
  const state = readLeagueState();
  const detected = state?.detected_current ?? null;
  return NextResponse.json({
    tracked,
    detected,
    detectedAt: state?.detected_at ?? null,
    mismatch: detected != null && detected.toLowerCase() !== tracked.toLowerCase(),
    canSwitch: user.role === "owner",
  });
}
