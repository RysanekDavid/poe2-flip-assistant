import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { leagueForUser } from "../../../../core/leagueUsers";
import { loadStrategyBoard } from "../../../../core/strategies/board";
import { strategiesResponseSchema, type StrategiesResponse } from "../../../../lib/strategiesContract";
import { createTtlCache } from "../../../../lib/ttlCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The board depends only on the league (prices change hourly with the poller), and Home, Farm,
 * Craft › Roll & sell and Trade › Methods all ask for it, so one build serves every viewer of a
 * league for 90 s.
 */
const BOARD_CACHE = createTtlCache<StrategiesResponse>(90_000);

/**
 * GET /api/farm/strategies → every curated strategy of every kind (farm, roll_and_sell, trade) with
 * its catalog items priced in the viewer's league, the live EV of each priced conversion and a
 * trade2 search link per tablet or target mod. Read-only; Farm › Strategies, Craft › Roll & sell
 * and Trade › Methods each filter by kind client-side.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const league = leagueForUser(user.id);
  // validated on the way out: a drift between the loader and the contract fails here, not in the browser
  const body = BOARD_CACHE.get(league, () => strategiesResponseSchema.parse(loadStrategyBoard(league, Date.now())));
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
