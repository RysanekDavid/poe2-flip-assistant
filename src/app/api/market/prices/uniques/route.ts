import { NextResponse } from "next/server";
import { fetchDemand } from "../../../../../api/scoutDemand";
import { getCurrentUser } from "../../../../../auth/session";
import { leagueForUser } from "../../../../../core/leagueUsers";
import { buildMarketUniques } from "../../../../../core/marketUniques";
import { uniqueTradeValues } from "../../../../../db/uniqueTradeQueries";
import { marketUniquesResponseSchema, type MarketUniquesResponse } from "../../../../../lib/marketUniquesContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function uniquesBody(userId: number): Promise<MarketUniquesResponse> {
  const demand = await fetchDemand();
  const body = buildMarketUniques({
    demand,
    viewerLeague: leagueForUser(userId),
    // trade fallback prices exist for the default league only, which is the league scout was read for
    trade: uniqueTradeValues(demand.league),
    nowMs: Date.now(),
  });
  return marketUniquesResponseSchema.parse(body);
}

/**
 * GET /api/market/prices/uniques → the UNIQUES group of Market › Prices. Reads the shared poe2scout
 * demand cache (shared with Opportunities and Wealth › Sell: one in-flight fill, then a TTL). A cold cache costs a full scout
 * fill, so the Prices tool asks only once a unique category or a search is on screen. scout is
 * fetched for the default league only; the body names both that league and the caller's, and the
 * tool says so when they differ. Any failure (scout, the trade table, the builder or the contract)
 * answers 502 with its message, which the Uniques pane shows.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await uniquesBody(user.id));
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[market] uniques: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
