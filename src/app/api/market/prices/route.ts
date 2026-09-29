import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { loadCxMarketView } from "../../../../core/cx/cxItemMarkets";
import { leagueForUser } from "../../../../core/leagueUsers";
import { buildMarketPrices } from "../../../../core/marketPrices";
import { resolveRates } from "../../../../core/rates";
import { latestPriceRows } from "../../../../db/marketPricesQueries";
import { marketPricesResponseSchema } from "../../../../lib/marketPricesContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/prices → every exchange item of the caller's league: value, 7-day trend, volume.
 * Kept apart from /api/prices, whose shape the price chart reads. Parsed on the way out so a shape
 * drift fails here with the field name instead of as an empty table.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const league = leagueForUser(user.id);
  const rows = latestPriceRows(league);
  const body = buildMarketPrices({ league, rows, cx: loadCxMarketView(league, rows), rates: resolveRates(league) });
  return NextResponse.json(marketPricesResponseSchema.parse(body));
}
