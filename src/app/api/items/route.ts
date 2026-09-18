import { NextResponse } from "next/server";
import { searchItems } from "../../../db/marketQueries";
import { getCurrentUser } from "../../../auth/session";
import { leagueForUser } from "../../../core/leagueUsers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/items?q=rune → search the caller's league by name (for watchlist add). */
export async function GET(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ items: [] });
  return NextResponse.json({ items: searchItems(leagueForUser(user.id), q) });
}
