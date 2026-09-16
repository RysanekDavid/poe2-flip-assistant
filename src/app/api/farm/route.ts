import { NextResponse } from "next/server";
import { latestSnapshots, latestFetchedAt } from "../../../db/marketQueries";
import { rankFarms } from "../../../core/farmAdvisor";
import { getActiveLeague } from "../../../core/leagueState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/farm → ranked "what to farm now" activities by basket heat (momentum × liquidity). */
export function GET(): Response {
  const league = getActiveLeague();
  const farms = rankFarms(latestSnapshots(league));
  return NextResponse.json({ farms, fetchedAt: latestFetchedAt(league) });
}
