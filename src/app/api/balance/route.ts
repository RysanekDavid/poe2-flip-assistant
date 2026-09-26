import { NextResponse } from "next/server";
import { z } from "zod";
import { realizedPnl, insertBalance } from "../../../db/queries";
import { getBalances, balanceStats, latestTabs, tabSeries } from "../../../db/balanceQueries";
import { getCurrentUser } from "../../../auth/session";
import { getCallerCred } from "../../../auth/tradeCred";
import { accountReadEnabled } from "../../../api/tradeClient";
import { TradeRateLimitedError } from "../../../api/tradeErrors";
import { tradeErrorResponse } from "../../../lib/tradeRouteError";
import { readCurrencyFromTrade } from "../../../api/accountScan";
import { getDefaultLeague } from "../../../core/leagueState";
import { leagueForUser } from "../../../core/leagueUsers";
import { resolveRates } from "../../../core/rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/balance → this user's snapshots + net-worth stats + realized P&L + stash-read flag.
 * Net worth is read in the app default league — the league every stash read and rate runs in —
 * and named in `computedLeague` so the panel never passes one economy off as another.
 */
export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // stash auto-read works for any user who has connected their own POESESSID + account in Settings
  const cred = await getCallerCred();
  const league = getDefaultLeague();
  // Realized flip P&L is logged per the VIEWER's league (flips are per-league ledgers), which can
  // differ from the default league net worth is read in — so it carries its own league label.
  const pnlLeague = leagueForUser(user.id);
  return NextResponse.json({
    computedLeague: league,
    pnlLeague,
    balances: getBalances(user.id, league, 500),
    stats: balanceStats(user.id, league),
    pnl: realizedPnl(user.id, pnlLeague),
    stashEnabled: accountReadEnabled(cred ?? undefined),
    tabs: latestTabs(user.id, league),
    tabSeries: tabSeries(user.id, league, 60),
  });
}

const ManualBody = z.object({
  divine: z.number().finite().nonnegative().default(0),
  exalted: z.number().finite().nonnegative().default(0),
  chaos: z.number().finite().nonnegative().default(0),
  note: z.string().max(200).optional(),
});

/** POST /api/balance → manual balance snapshot { divine, exalted, chaos, note? } for this user. */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = ManualBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  }
  const b = parsed.data;
  // Rates and the gear read both run in the app default league — the snapshot is provenance for THAT economy.
  const league = getDefaultLeague();
  const resolved = resolveRates(league);
  if (!resolved) {
    return NextResponse.json({ error: `no exchange rates available for ${league} — snapshot NOT recorded` }, { status: 409 });
  }
  const { rates } = resolved;

  // Fold in listed-gear value from this user's own public tabs when an account is connected.
  // A failed gear read must NOT silently become 0: the curve would show a fake net-worth dip.
  const cred = await getCallerCred();
  let otherDiv = 0;
  if (cred && cred.account) {
    try {
      otherDiv = (await readCurrencyFromTrade(cred.account, rates, cred)).otherDiv;
    } catch (e) {
      // shared trade2 budget busy → 503 + Retry-After so the UI can say "retry in N s"
      if (e instanceof TradeRateLimitedError) return tradeErrorResponse(e);
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          error: `gear read failed: ${message} — snapshot NOT recorded (a currency-only snapshot would record a fake net-worth dip). Retry, or disconnect the account in Settings for currency-only entries.`,
        },
        { status: 409 },
      );
    }
  }

  const snapshot = insertBalance(user.id, league, {
    divine: b.divine,
    exalted: b.exalted,
    chaos: b.chaos,
    exaltPerDiv: rates.exaltPerDivine,
    chaosPerDiv: rates.chaosPerDivine,
    otherDiv,
    source: "manual",
    note: b.note ?? (otherDiv > 0 ? `gear ~${otherDiv.toFixed(1)} Div auto` : null),
  });
  return NextResponse.json({ snapshot, stats: balanceStats(user.id, league), computedLeague: league });
}
