import { NextResponse } from "next/server";
import { tradeErrorResponse } from "../../../../lib/tradeRouteError";
import { balanceStats, insertBalance, insertTabs } from "../../../../db/queries";
import { getCurrentUser } from "../../../../auth/session";
import { getCallerCred } from "../../../../auth/tradeCred";
import { fetchScout } from "../../../../api/scoutClient";
import { readCurrencyFromTrade } from "../../../../api/accountScan";
import { refreshUniqueValues } from "../../../../core/valuation";
import { getDefaultLeague } from "../../../../core/leagueState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  try {
    await refreshUniqueValues(); // daily-guarded; makes sure showcase items can be valued
    const { rates } = await fetchScout();
    const c = await readCurrencyFromTrade(cred.account, rates, cred);
    // scout rates + the trade2 stash read both run in the app default league.
    const snapshot = insertBalance(user.id, getDefaultLeague(), {
      divine: c.divine,
      exalted: c.exalted,
      chaos: c.chaos,
      exaltPerDiv: rates.exaltPerDivine,
      chaosPerDiv: rates.chaosPerDivine,
      otherDiv: c.otherDiv,
      source: "trade",
      note: `${c.listingsSeen}/${c.total} listed · gear ~${c.otherDiv.toFixed(1)} Div · ${c.tabs.length} tabs${c.unpriced ? ` · ${c.unpriced} unpriced` : ""}`,
    });
    insertTabs(snapshot.id, c.tabs);
    return NextResponse.json({ snapshot, stats: balanceStats(user.id), scan: c });
  } catch (e) {
    return tradeErrorResponse(e);
  }
}
