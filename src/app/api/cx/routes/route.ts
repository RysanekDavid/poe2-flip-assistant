import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { leagueForUser } from "../../../../core/leagueUsers";
import { loadCxRoutes, ROUTE_MIN_HELD } from "../../../../core/cx/cxRouteView";
import { latestSnapshots } from "../../../../db/marketQueries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cx/routes?limit=30 → closed currency loops (e.g. Ex → item → Div → Ex) that paid after
 * gold fees in at least ROUTE_MIN_HELD of the last 6 hours on GGG's exchange, best median first.
 * `routes: []` with `newestHour: null` means no fresh exchange history is stored for the league.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit")) || 30, 200);
  const league = leagueForUser(user.id);
  const view = loadCxRoutes(league, latestSnapshots(league));
  return NextResponse.json({
    league,
    minHeld: ROUTE_MIN_HELD,
    newestHour: view?.newestHour ?? null,
    routes: (view?.routes ?? []).slice(0, limit),
  });
}
