import { NextResponse } from "next/server";
import { getBalances, balanceStats, realizedPnl, insertBalance, latestTabs, tabSeries } from "../../../db/queries";
import { getCurrentUser } from "../../../auth/session";
import { getCallerCred } from "../../../auth/tradeCred";
import { accountReadEnabled } from "../../../api/tradeClient";
import { fetchScout } from "../../../api/scoutClient";
import { readCurrencyFromTrade } from "../../../api/accountScan";
import { getDefaultLeague } from "../../../core/leagueState";
import { leagueForUser } from "../../../core/leagueUsers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/balance → this user's snapshots + net-worth stats + realized P&L + stash-read flag. */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // stash auto-read works for any user who has connected their own POESESSID + account in Settings
  const cred = await getCallerCred();
  const canRead = accountReadEnabled(cred ?? undefined);
  return NextResponse.json({
    balances: getBalances(user.id, 500),
    stats: balanceStats(user.id),
    // Realized P&L is per-league — a Divine is not the same wealth in two economies.
    pnl: realizedPnl(user.id, leagueForUser(user.id)),
    stashEnabled: canRead,
    tabs: latestTabs(user.id),
    tabSeries: tabSeries(user.id, 60),
  });
}

/** POST /api/balance → manual balance snapshot { divine, exalted, chaos, note? } for this user. */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();
  const divine = Number(b?.divine ?? 0);
  const exalted = Number(b?.exalted ?? 0);
  const chaos = Number(b?.chaos ?? 0);
  if (![divine, exalted, chaos].every(Number.isFinite)) {
    return NextResponse.json({ error: "divine/exalted/chaos must be numbers" }, { status: 400 });
  }
  const { rates } = await fetchScout();

  // Fold in live listed-gear value from this user's own public tabs, if they've connected a
  // POESESSID + account in Settings. Otherwise just store the currency they typed.
  const cred = await getCallerCred();
  let otherDiv = 0;
  if (cred && cred.account) {
    try {
      otherDiv = (await readCurrencyFromTrade(cred.account, rates, cred)).otherDiv;
    } catch (e) {
      // no public tab / trade hiccup / shared trade2 budget busy — store the currency you typed
      console.warn(`[balance] gear value skipped: ${e instanceof Error ? e.message : String(e)}`);
      otherDiv = 0;
    }
  }

  // Net worth is priced from scout rates and a trade2 stash read, both of which run in the app
  // default league — the snapshot is provenance for THAT economy.
  const snapshot = insertBalance(user.id, getDefaultLeague(), {
    divine,
    exalted,
    chaos,
    exaltPerDiv: rates.exaltPerDivine,
    chaosPerDiv: rates.chaosPerDivine,
    otherDiv,
    source: "manual",
    note: b?.note ?? (otherDiv > 0 ? `gear ~${otherDiv.toFixed(1)} Div auto` : null),
  });
  return NextResponse.json({ snapshot, stats: balanceStats(user.id) });
}
