import type { TradeCred } from "../../api/tradeClient";
import type { PriceCheckLiveResponse } from "../../lib/priceCheckContract";
import { tradeSearchUrl, type TradeQuery } from "../../lib/tradeLink";
import { valueFromComparables } from "../comparableValuation";
import { planLiquidation } from "../wealth/plan";
import { hintFromRow, hintFromValue, UNPRICED_TRADE } from "./hint";
import type { LiveServices, PriceCheckServices } from "./services";
import { confidenceOf, type PricedFields } from "./stackable";

/**
 * Uniques: poe2scout's daily unit price by name (plus its live-listing competition in the default
 * league), a prefilled trade link, and — on click only — the median of the cheapest instant-buyout
 * listings of that unique in the same corrupted state.
 */

/** trade2 fetches 10 listings per call: one search + one fetch. */
export const NAMED_LIVE_COMPARABLES = 10;

export const NO_LIVE_COMPARABLES = "no live comparables priced — keep the reference above or open the live search";

/** Corrupted and clean copies trade as different items; poe2scout's daily price does not tell them apart. */
export const uniqueTradeQuery = (name: string, baseType: string, corrupted: boolean): TradeQuery => ({
  name,
  type: baseType,
  rarity: "unique",
  corrupted,
});

export async function priceUnique(name: string, baseType: string, corrupted: boolean, s: PriceCheckServices): Promise<PricedFields> {
  const key = name.toLowerCase();
  const { ctx, warnings } = await s.planContext([key]);
  const row = planLiquidation([{ name, qty: 1 }], ctx).rows[0];
  if (row == null) throw new Error(`price check: the planner returned no row for ${name}`);
  const logPoints = ctx.competition.get(key)?.competition.samples ?? 0;
  return {
    name,
    baseType,
    icon: row.icon,
    qty: 1,
    unitDiv: row.unitDiv,
    totalDiv: row.unitDiv,
    // poe2scout's count is price-log points; zero says nothing, so it is left out rather than shown
    confidence: confidenceOf(row.valueSource, logPoints > 0 ? logPoints : null, s.ages),
    hint: hintFromRow(row, { change7d: null, volume: null }, s.rates.rates.exaltPerDivine, UNPRICED_TRADE),
    tradeUrl: tradeSearchUrl(s.league, uniqueTradeQuery(name, baseType, corrupted)),
    warnings: [...(corrupted ? ["corrupted — the poe2scout price is not for corrupted copies; value it live"] : []), ...warnings, ...row.warnings],
  };
}

/** One search + one fetch of the cheapest instant-buyout listings matching `q`, priced as one value. */
export async function liveNamed(
  kind: "currency" | "unique",
  q: TradeQuery,
  s: LiveServices,
  cred: TradeCred,
): Promise<PriceCheckLiveResponse> {
  const res = await s.trade.searchComparables({ ...q, instantBuyout: true }, NAMED_LIVE_COMPARABLES, cred);
  const v = valueFromComparables(res.listings, res.total, s.rates.rates);
  return {
    kind,
    valueDiv: v.valueDiv,
    minDiv: v.minDiv,
    samples: v.samples,
    total: v.total,
    dropped: v.dropped,
    unrated: v.unrated,
    searchUrl: res.searchUrl,
    method: `median of the cheapest ${NAMED_LIVE_COMPARABLES} instant-buyout listings, bait asks trimmed`,
    hint: hintFromValue(v.valueDiv, s.rates.rates, "live comparables", NO_LIVE_COMPARABLES),
  };
}
