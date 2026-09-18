import { NextResponse } from "next/server";
import { latestSnapshots, priceHistory, itemSpark } from "../../../db/marketQueries";
import { getCurrentUser } from "../../../auth/session";
import { leagueForUser } from "../../../core/leagueUsers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/prices            → latest snapshot per item, in the caller's league
 *  GET /api/prices?item=<id>  → our tracked history + ninja 7d sparkline for one item */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const item = new URL(req.url).searchParams.get("item");
  const league = leagueForUser(user.id);
  if (item) {
    const spark = itemSpark(league, item);
    return NextResponse.json({ item, history: priceHistory(league, item, 2016), ...spark });
  }
  return NextResponse.json({ prices: latestSnapshots(league) });
}
