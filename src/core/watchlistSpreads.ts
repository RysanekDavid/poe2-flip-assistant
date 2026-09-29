import { z } from "zod";
import type { PricedItem } from "../api/types";
import { config } from "../config/env";
import { getWatchlistForLeague, manualAgeMs, type WatchItem } from "../db/watchlistQueries";
import { loadCxMarketView } from "./cx/cxItemMarkets";
import { scoreItem, type FlipRow, type ManualPrice } from "./flipModel";
import { resolveRates, type ResolvedRates } from "./rates";

export interface WatchSpreadRow extends FlipRow {
  thresholdPct: number;
  manualStale: boolean;
  manualAgeMin: number | null;
}

const CurrencySchema = z.enum(["DIVINE", "EXALT", "CHAOS"]);

/**
 * One leg of a row's manual Ange price, or null (use the estimate) when unset or expired.
 * The unit column has no DB constraint; an unknown unit would otherwise be converted at a rate
 * that does not exist and print a REAL-mode spread from garbage. That leg is dropped (the row
 * falls back to the estimate, exactly like an expired price) and logged — the rest of the
 * watchlist still scores.
 */
function manualLeg(w: WatchItem, amount: number | null, ccy: string | null, fallback: "EXALT" | "CHAOS", stale: boolean): ManualPrice | null {
  if (stale || amount == null) return null;
  const unit = CurrencySchema.safeParse(ccy ?? fallback);
  if (!unit.success) {
    console.error(`[spreads] watchlist row ${w.id} (${w.item_id}): unknown manual price unit ${JSON.stringify(ccy)} — using the estimate`);
    return null;
  }
  return { amount, ccy: unit.data };
}

/**
 * The user's watchlist in `league`, scored by the flip model (the same one discovery uses) and
 * ranked by worthScore — or null when no Exalted/Chaos rate is known yet. Shared by GET
 * /api/spreads and the Discord live board so both show the same numbers.
 *
 * Only rows recorded for `league`: manual Ange prices were observed in ONE economy, and scoring
 * them against another league's snapshots and rates would print a spread that exists in neither.
 */
export function scoreWatchlist(
  userId: number,
  league: string,
  prices: readonly PricedItem[],
  nowMs: number,
): { resolved: ResolvedRates; spreads: WatchSpreadRow[] } | null {
  const resolved = resolveRates(league, nowMs);
  if (!resolved) return null;
  const byId = new Map(prices.map((p) => [p.itemId, p]));
  const staleMs = config.manualStaleHours * 3600_000;
  const cx = loadCxMarketView(league, prices, nowMs);
  const spreads = getWatchlistForLeague(userId, league).flatMap((w): WatchSpreadRow[] => {
    const price = byId.get(w.item_id);
    if (!price) return [];
    const ageMs = manualAgeMs(w.manual_set_at);
    const stale = ageMs != null && ageMs > staleMs; // expired manual prices fall back to the estimate
    const buy = manualLeg(w, w.manual_buy_exalt, w.manual_buy_ccy, "EXALT", stale);
    const sell = manualLeg(w, w.manual_sell_chaos, w.manual_sell_ccy, "CHAOS", stale);
    const row = scoreItem(price, resolved.rates, buy, sell, cx?.byItemId.get(w.item_id) ?? null);
    return [{ ...row, thresholdPct: w.buy_threshold_pct, manualStale: stale, manualAgeMin: ageMs != null ? Math.round(ageMs / 60000) : null }];
  });
  return { resolved, spreads: spreads.sort((a, b) => b.worthScore - a.worthScore) };
}
