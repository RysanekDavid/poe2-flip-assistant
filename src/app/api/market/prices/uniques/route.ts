import { NextResponse } from "next/server";
import { fetchDemand, type CachedDemand } from "../../../../../api/scoutDemand";
import { getCurrentUser } from "../../../../../auth/session";
import { leagueForUser } from "../../../../../core/leagueUsers";
import { buildMarketUniques } from "../../../../../core/marketUniques";
import { uniqueTradeValues } from "../../../../../db/uniqueTradeQueries";
import { marketUniquesResponseSchema } from "../../../../../lib/marketUniquesContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/prices/uniques → the UNIQUES group of Market › Prices. Reads the shared poe2scout
 * demand cache (the Market board's fill: one in-flight request, TTL), so opening Prices adds no
 * scout traffic of its own. scout is fetched for the default league only; the body names both
 * that league and the caller's, and the tool says so when they differ.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let demand: CachedDemand;
  try {
    demand = await fetchDemand();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[market] uniques: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
  const body = buildMarketUniques({
    demand,
    viewerLeague: leagueForUser(user.id),
    // trade fallback prices exist for the default league only, which is the league scout was read for
    trade: uniqueTradeValues(demand.league),
    nowMs: Date.now(),
  });
  return NextResponse.json(marketUniquesResponseSchema.parse(body));
}
