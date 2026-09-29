import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../auth/session";
import { getCallerCred } from "../../../auth/tradeCred";
import { priceCheck } from "../../../core/pricecheck/check";
import { priceCheckServices } from "../../../core/pricecheck/wiring";
import { NotAnItemError, RatesUnavailableError } from "../../../core/tools/craftmoves/moves";
import { priceCheckRequestSchema, priceCheckResponseSchema } from "../../../lib/priceCheckContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pricecheck { text } → what a pasted item is worth in the caller's league and how to
 * sell it: currency from the exchange × stack, uniques from poe2scout, rares from the price book.
 * Spends NO trade2 search — the live value is POST /api/pricecheck/live, on an explicit click.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = priceCheckRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  try {
    // only whether a cookie exists — it is not used here, the live button is offered on it
    const hasCred = (await getCallerCred()) != null;
    const result = await priceCheck(body.data.text, priceCheckServices(user.id, hasCred));
    // validated on the way out: a drift between core and contract fails here, not in the browser
    return NextResponse.json(priceCheckResponseSchema.parse(result));
  } catch (e: unknown) {
    if (e instanceof NotAnItemError) return NextResponse.json({ error: e.message }, { status: 422 });
    if (e instanceof RatesUnavailableError) return NextResponse.json({ error: e.message }, { status: 503 });
    throw e;
  }
}
