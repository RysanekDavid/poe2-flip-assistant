import { NextResponse } from "next/server";
import { fetchTradeMeta } from "../../../../api/tradeMeta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/trade/names → unique names + base types + mod (stat) list for hunt autocompletes. */
export async function GET(): Promise<Response> {
  try {
    const { uniques, bases, stats } = await fetchTradeMeta();
    return NextResponse.json({ uniques, bases, stats });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
