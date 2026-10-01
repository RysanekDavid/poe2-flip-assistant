import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { leagueForUser } from "../../../../core/leagueUsers";
import { loadStrategyBoard } from "../../../../core/strategies/board";
import { strategiesResponseSchema } from "../../../../lib/strategiesContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/farm/strategies → every curated strategy of every kind (farm, roll_and_sell, trade) with
 * its catalog items priced in the viewer's league, the live EV of each priced conversion and a
 * trade2 search link per tablet or target mod. Read-only; Farm › Strategies, Craft › Roll & sell
 * and Trade › Methods each filter by kind client-side.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = loadStrategyBoard(leagueForUser(user.id), Date.now());
  // validated on the way out: a drift between the loader and the contract fails here, not in the browser
  return NextResponse.json(strategiesResponseSchema.parse(body), { headers: { "Cache-Control": "no-store" } });
}
