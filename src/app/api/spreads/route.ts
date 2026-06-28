import { NextResponse } from "next/server";
import { getWatchlist, latestSnapshots, manualAgeMs } from "../../../db/queries";
import { getCurrentUser } from "../../../auth/session";
import { config } from "../../../config/env";
import { deriveRates, type Currency } from "../../../core/priceEngine";
import { scoreItem } from "../../../core/flipModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/spreads → flip plan per watched item (same model as discovery).
 * REAL mode when manual Ange prices set, else volume-adaptive RECO. Ranked by flipScore.
 * Per-user: the watchlist is private, so spreads are scoped to the logged-in account.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const prices = latestSnapshots();
  const rates = deriveRates(prices);
  const byId = new Map(prices.map((p) => [p.itemId, p]));
  const watch = getWatchlist(user.id);

  if (!rates) {
    return NextResponse.json({ rates: null, spreads: [], note: "no exalt/chaos price yet — poll first" });
  }

  const staleMs = config.manualStaleHours * 3600_000;
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
      const row = scoreItem(price, rates, mBuy, mSell);
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

  return NextResponse.json({ rates, spreads, currencyIcons });
}
