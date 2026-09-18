import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { getDefaultLeague } from "../../../../core/leagueState";
import { leagueForUser, ownLeague, sameLeague } from "../../../../core/leagueUsers";
import { readLeagueState } from "../../../../db/leagueQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/league/status → what the CALLER is viewing vs what detection last saw.
 *
 * `canSwitch` is now true for everyone: moving your own view is a preference, not an admin op.
 * `canSetDefault` stays owner-only — that one moves the league the poller and the shared trade2
 * pipelines run under, for every account that never picked one.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const tracked = leagueForUser(user.id);
  const defaultLeague = getDefaultLeague();
  const pinned = ownLeague(user.id) != null;
  const state = readLeagueState();
  const detected = state?.detected_current ?? null;
  const differs = (league: string): boolean => detected != null && !sameLeague(detected, league);

  return NextResponse.json({
    tracked,
    defaultLeague,
    pinned,
    detected,
    detectedAt: state?.detected_at ?? null,
    // Only users who FOLLOW the default are told their view is stale — someone deliberately
    // sitting in Standard chose that, and nagging them about it forever is not a warning, it is
    // furniture. They still switch whenever they like from the header dropdown.
    mismatch: !pinned && differs(tracked),
    // Reported separately so the owner is still prompted to move the DEFAULT after switching
    // their own view — otherwise the banner would vanish and the poller would keep collecting a
    // dead league for everyone who never picked one.
    defaultMismatch: differs(defaultLeague),
    canSwitch: true,
    canSetDefault: user.role === "owner",
  });
}
