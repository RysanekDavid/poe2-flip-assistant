import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../auth/session";
import { loadFarmBoard } from "../../../core/farm/farmLoad";
import { leagueForUser } from "../../../core/leagueUsers";
import { farmResponseSchema, type FarmResponse } from "../../../lib/farmContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/farm → "what to farm now": mechanic baskets by 7d heat (rankFarms) and pinnacle bosses
 * by net per kill (entry buy-vs-craft, floor vs chase, P(losing kill), entry liquidity), plus each
 * boss's full evaluation for the detail panel. Read-only; the viewer's league.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body: FarmResponse = loadFarmBoard(leagueForUser(user.id), Date.now());
  // validated on the way out: a drift between the engine and the contract fails here, not in the browser
  return NextResponse.json(farmResponseSchema.parse(body), { headers: { "Cache-Control": "no-store" } });
}
