import { NextResponse } from "next/server";
import { tradeErrorResponse } from "../../../../lib/tradeRouteError";
import { balanceStats } from "../../../../db/balanceQueries";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";
import { recordTradeBalance } from "../../../../core/balanceRead";
import { refreshUniqueValues } from "../../../../core/valuation";
import { getDefaultLeague } from "../../../../core/leagueState";
import { resolveRates } from "../../../../core/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily-guarded unique-price refresh. A scout outage must not block the read (currency still
 *  counts), but it must be visible: stale unique prices undervalue showcase gear. */
async function refreshUniquesWarning(): Promise<string | null> {
  try {
    await refreshUniqueValues();
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(`[balance/read] unique-price refresh failed: ${message}`);
    return `unique prices not refreshed (${message}) — uniques may be valued from an older cache`;
  }
}

/**
 * POST /api/balance/read → read your currency from your own PUBLIC stash tabs via a trade
 * search on your account name (the only way to read a PoE2 stash — the stash API is PoE1-only),
 * compute net worth at current rates, store a snapshot. Read-only: never buys or whispers.
 * On failure returns { error } so the UI can prompt manual entry.
 */
export async function POST(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // Each user reads THEIR OWN public tabs with their own stored POESESSID + account name.
  const cred = await getCallerCred();
  if (!cred || !cred.account) {
    return NextResponse.json(
      { error: "set your POESESSID and account name in Settings to auto-read your public tabs." },
      { status: 400 },
    );
  }
  // The trade2 stash read runs in the app default league — price and tag it there.
  const league = getDefaultLeague();
  const resolved = resolveRates(league);
  if (!resolved) {
    return NextResponse.json({ error: `no exchange rates available for ${league} — cannot price a snapshot` }, { status: 409 });
  }
  try {
    const warning = await refreshUniquesWarning();
    const { snapshot, scan } = await recordTradeBalance(user.id, league, cred.account, resolved.rates, cred);
    return NextResponse.json({ snapshot, stats: balanceStats(user.id, league), scan, warning, computedLeague: league });
  } catch (e) {
    return tradeErrorResponse(e);
  }
}
