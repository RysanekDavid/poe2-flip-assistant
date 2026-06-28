import { NextResponse } from "next/server";
import { latestSnapshots, priceHistory, itemSpark } from "../../../db/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/prices            → latest snapshot per item
 *  GET /api/prices?item=<id>  → our tracked history + ninja 7d sparkline for one item */
export function GET(req: Request) {
  const item = new URL(req.url).searchParams.get("item");
  if (item) {
    const spark = itemSpark(item);
    return NextResponse.json({ item, history: priceHistory(item, 2016), ...spark });
  }
  return NextResponse.json({ prices: latestSnapshots() });
}
