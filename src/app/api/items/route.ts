import { NextResponse } from "next/server";
import { searchItems } from "../../../db/marketQueries";
import { getActiveLeague } from "../../../core/leagueState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/items?q=rune → search all known items by name (for watchlist add). */
export function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: searchItems(getActiveLeague(), q) });
}
