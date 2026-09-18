import { NextResponse } from "next/server";
import { latestSnapshots, latestFetchedAt } from "../../../db/marketQueries";
import { rankFarms } from "../../../core/farmAdvisor";
import { getCurrentUser } from "../../../auth/session";
import { leagueForUser } from "../../../core/leagueUsers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/farm → ranked "what to farm now" activities by basket heat (momentum × liquidity). */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const league = leagueForUser(user.id);
  const farms = rankFarms(latestSnapshots(league));
  return NextResponse.json({ farms, fetchedAt: latestFetchedAt(league) });
}
