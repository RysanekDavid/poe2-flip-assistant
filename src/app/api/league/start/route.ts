import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { loadLeagueStartView } from "../../../../core/cx/leagueStart/view";
import { leagueForUser } from "../../../../core/leagueUsers";
import { leagueStartResponseSchema } from "../../../../lib/leagueStartContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/league/start → league-start mode for the caller's league: which day it is, and what
 * past league starts say each exchange item did over the next 7/14 days from this day. Read-only.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = loadLeagueStartView(leagueForUser(user.id), Date.now());
  // validated on the way out: engine/contract drift fails here, not in the browser
  return NextResponse.json(leagueStartResponseSchema.parse(body), { headers: { "Cache-Control": "no-store" } });
}
