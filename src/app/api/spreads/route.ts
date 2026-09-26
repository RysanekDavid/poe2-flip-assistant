import { NextResponse } from "next/server";
import { getWatchlistForLeague, manualAgeMs } from "../../../db/watchlistQueries";
import { latestSnapshots } from "../../../db/marketQueries";
import { getCurrentUser } from "../../../auth/session";
import { config } from "../../../config/env";
import { type Currency } from "../../../core/priceEngine";
import { leagueForUser } from "../../../core/leagueUsers";
import { resolveRates } from "../../../core/rates";
import { scoreItem } from "../../../core/flipModel";
import { cxRankGate, loadCxMarketView } from "../../../core/cx/cxItemMarkets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/spreads → flip plan per watched item (same model as discovery).
 * REAL mode when manual Ange prices set, else the market estimate: GGG exchange history when the
 * item has a market there, the labelled heuristic otherwise. Ranked by worthScore.
 * Per-user: the watchlist is private, so spreads are scoped to the logged-in account.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const league = leagueForUser(user.id);
  const prices = latestSnapshots(league);
  const resolved = resolveRates(league);
  const byId = new Map(prices.map((p) => [p.itemId, p]));
  // Same rule the poller applies to alerts: a row's manual Ange prices and thresholds were
  // recorded against ONE economy, so scoring them against another league's snapshots and rates
  // would print a REAL-mode spread that exists in neither market.
  const watch = getWatchlistForLeague(user.id, league);

  if (!resolved) {
    return NextResponse.json({ rates: null, spreads: [], note: "no exalt/chaos price yet — poll first" });
  }

  const staleMs = config.manualStaleHours * 3600_000;
  const cx = loadCxMarketView(league, prices);
  const spreads = watch
    .map((w) => {
      const price = byId.get(w.item_id);
      if (!price) return null;
      const ageMs = manualAgeMs(w.manual_set_at);
      const stale = ageMs != null && ageMs > staleMs;
      // expired manual prices fall back to the estimate
      const mBuy =
        stale || w.manual_buy_exalt == null
          ? null
          : { amount: w.manual_buy_exalt, ccy: (w.manual_buy_ccy ?? "EXALT") as Currency };
      const mSell =
        stale || w.manual_sell_chaos == null
          ? null
          : { amount: w.manual_sell_chaos, ccy: (w.manual_sell_ccy ?? "CHAOS") as Currency };
      const row = scoreItem(price, resolved.rates, mBuy, mSell, cx?.byItemId.get(w.item_id) ?? null);
      return {
        ...row,
        thresholdPct: w.buy_threshold_pct,
        manualStale: stale,
        manualAgeMin: ageMs != null ? Math.round(ageMs / 60000) : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.worthScore - a.worthScore);

  // icons for the three base currencies, so the UI can show the orb next to each amount
  const currencyIcons = {
    DIVINE: byId.get("divine")?.icon ?? null,
    EXALT: byId.get("exalted")?.icon ?? null,
    CHAOS: byId.get("chaos")?.icon ?? null,
  };

  return NextResponse.json({
    rates: resolved.rates,
    ratesSource: resolved.source,
    ratesFetchedAt: resolved.fetchedAt,
    spreads,
    rankGate: cxRankGate(),
    currencyIcons,
  });
}
