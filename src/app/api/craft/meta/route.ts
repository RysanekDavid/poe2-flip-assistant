import { NextResponse } from "next/server";
import { fetchTradeMeta } from "../../../../api/tradeMeta";
import { getDefaultLeague } from "../../../../core/leagueState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/craft/meta → league + trade2 stat list + base-type list for the Craft Planner. */
export async function GET(): Promise<Response> {
  try {
    const { stats, bases } = await fetchTradeMeta();
    return NextResponse.json({ league: getDefaultLeague(), stats, bases });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
