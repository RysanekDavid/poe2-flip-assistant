import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import { withCredStatus } from "../../../../../auth/credStatus";
import { getCallerCred } from "../../../../../auth/tradeCred";
import { getDefaultLeague } from "../../../../../core/leagueState";
import { liveValue, NotAnItemError, RatesUnavailableError } from "../../../../../core/tools/craftmoves/moves";
import { craftValueRequestSchema, craftValueResponseSchema } from "../../../../../lib/tools/craftMovesContract";
import { tradeErrorResponse } from "../../../../../lib/tradeRouteError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tools/craft-moves/value { text, targetLine? } → live comparable value of the pasted item,
 * or with `targetLine` of a move card's outcome (the item plus that mod at its lowest roll): ONE
 * trade2 search + ONE fetch with the caller's own POESESSID, through the web-process limiter. A busy
 * shared budget answers 503 + Retry-After (the panel shows "retry in N s"); no stored cookie → 409.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = craftValueRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json({ error: "no POESESSID stored — add your session cookie in Settings to value live" }, { status: 409 });
  }
  try {
    const { text, targetLine } = body.data;
    // record what this trade2 call says about the caller's stored POESESSID (403 → expired banner)
    const value = await withCredStatus(user.id, cred, () => liveValue(text, getDefaultLeague(), cred, targetLine));
    return NextResponse.json(craftValueResponseSchema.parse(value));
  } catch (e: unknown) {
    if (e instanceof NotAnItemError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof RatesUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    return tradeErrorResponse(e);
  }
}
