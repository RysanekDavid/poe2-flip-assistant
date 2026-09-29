import { NextResponse } from "next/server";
import { withCredStatus } from "../../../../auth/credStatus";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";
import { LiveNotAllowedError, priceCheckLive } from "../../../../core/pricecheck/check";
import { priceCheckServices } from "../../../../core/pricecheck/wiring";
import { NotAnItemError, RatesUnavailableError } from "../../../../core/tools/craftmoves/moves";
import { priceCheckLiveResponseSchema, priceCheckRequestSchema } from "../../../../lib/priceCheckContract";
import { tradeErrorResponse } from "../../../../lib/tradeRouteError";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pricecheck/live { text } → live comparable value of a pasted unique or rare: ONE trade2
 * search + ONE fetch with the caller's own POESESSID, through the web-process limiter. No stored
 * cookie → 409; a paste or league the panel disables the button for → 409 with the reason; a busy
 * shared budget → 503 + Retry-After (the panel shows "retry in N s").
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = priceCheckRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  const cred = await getCallerCred();
  if (!cred) {
    return NextResponse.json({ error: "no POESESSID stored — add your session cookie in Settings to value live" }, { status: 409 });
  }
  try {
    const services = priceCheckServices(user.id, true);
    // record what this trade2 call says about the caller's stored POESESSID (403 → expired banner)
    const value = await withCredStatus(user.id, cred, () => priceCheckLive(body.data.text, services, cred));
    return NextResponse.json(priceCheckLiveResponseSchema.parse(value));
  } catch (e: unknown) {
    if (e instanceof NotAnItemError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof LiveNotAllowedError) return NextResponse.json({ error: e.message }, { status: 409 });
    if (e instanceof RatesUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    return tradeErrorResponse(e);
  }
}
