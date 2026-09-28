import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../../auth/session";
import { getCallerCred } from "../../../../../auth/tradeCred";
import { getDefaultLeague } from "../../../../../core/leagueState";
import { liveValue, NotAnItemError, RatesUnavailableError } from "../../../../../core/tools/craftmoves/moves";
import { craftMovesRequestSchema, craftValueResponseSchema } from "../../../../../lib/tools/craftMovesContract";
import { tradeErrorResponse } from "../../../../../lib/tradeRouteError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tools/craft-moves/value { text } → live comparable value of the pasted item: ONE trade2
 * search + ONE fetch with the caller's own POESESSID, through the web-process limiter. A busy
 * shared budget answers 503 + Retry-After (the panel shows "retry in N s"); no stored cookie → 409.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = craftMovesRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json({ error: "no POESESSID stored — add your session cookie in Settings to value live" }, { status: 409 });
  }
  try {
    return NextResponse.json(craftValueResponseSchema.parse(await liveValue(body.data.text, getDefaultLeague(), cred)));
  } catch (e: unknown) {
    if (e instanceof NotAnItemError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof RatesUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    return tradeErrorResponse(e);
  }
}
