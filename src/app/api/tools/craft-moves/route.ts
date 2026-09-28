import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { getDefaultLeague } from "../../../../core/leagueState";
import { nextMoves, NotAnItemError } from "../../../../core/tools/craftmoves/moves";
import { craftMovesRequestSchema, craftMovesResponseSchema } from "../../../../lib/tools/craftMovesContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/tools/craft-moves { text } → classified item, legal next moves with live material
 * costs, tier gates, patch stamp and the price-book value. Spends no trade2 search budget.
 *
 * League: the default league, like /api/craft/materials — material prices and the price book must
 * come from the same economy the trade2 value search (default league) prices against.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = craftMovesRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: body.error.issues[0]?.message ?? "bad request" }, { status: 400 });
  }
  try {
    const result = await nextMoves(body.data.text, getDefaultLeague());
    // validated on the way out: a drift between core and contract fails here, not in the browser
    return NextResponse.json(craftMovesResponseSchema.parse(result));
  } catch (e: unknown) {
    if (e instanceof NotAnItemError) return NextResponse.json({ error: e.message }, { status: 422 });
    throw e;
  }
}
