import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../../auth/session";
import { getDefaultLeague } from "../../../../core/leagueState";
import { resolveRates } from "../../../../core/rates";
import { loadSell } from "../../../../core/wealth/sellLoad";
import { sellResponseSchema } from "../../../../lib/wealthContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/wealth/sell → per item of the caller's latest stash read: sell on the exchange now,
 * list at a price, reprice, or hold — plus what sold since the read before and the reprice-check
 * status. Stash reads run in the app default league, so this does too. DB reads only: it never
 * spends a trade2 request (reprice comps come from the poller's queued checks).
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const league = getDefaultLeague();
  const resolved = resolveRates(league);
  if (!resolved) {
    return NextResponse.json({ error: `no exchange rates available for ${league} — cannot price your stash` }, { status: 409 });
  }
  // parsed on the way out: a drifted shape fails here, loudly, not as blank cells in the panel
  return NextResponse.json(sellResponseSchema.parse(await loadSell(user.id, league, resolved)));
}
