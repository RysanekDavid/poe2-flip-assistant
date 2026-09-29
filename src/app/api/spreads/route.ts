import { NextResponse } from "next/server";
import { latestSnapshots } from "../../../db/marketQueries";
import { getCurrentUser } from "../../../auth/session";
import { leagueForUser } from "../../../core/leagueUsers";
import { cxRankGate } from "../../../core/cx/cxItemMarkets";
import { scoreWatchlist } from "../../../core/watchlistSpreads";

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
  const scored = scoreWatchlist(user.id, league, prices, Date.now());
  if (!scored) {
    return NextResponse.json({ rates: null, spreads: [], note: "no exalt/chaos price yet — poll first" });
  }

  // icons for the three base currencies, so the UI can show the orb next to each amount
  const byId = new Map(prices.map((p) => [p.itemId, p]));
  const currencyIcons = {
    DIVINE: byId.get("divine")?.icon ?? null,
    EXALT: byId.get("exalted")?.icon ?? null,
    CHAOS: byId.get("chaos")?.icon ?? null,
  };

  return NextResponse.json({
    rates: scored.resolved.rates,
    ratesSource: scored.resolved.source,
    ratesFetchedAt: scored.resolved.fetchedAt,
    spreads: scored.spreads,
    rankGate: cxRankGate(),
    currencyIcons,
  });
}
