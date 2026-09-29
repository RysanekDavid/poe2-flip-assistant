import type { TradeCred } from "../../api/tradeClient";
import type { PriceCheckLiveResponse } from "../../lib/priceCheckContract";
import { tradeSearchUrl } from "../../lib/tradeLink";
import { valueFromComparables } from "../comparableValuation";
import { planLiquidation } from "../wealth/plan";
import { hintFromRow, hintFromValue } from "./hint";
import type { PriceCheckServices } from "./services";
import { confidenceOf, type PricedFields } from "./stackable";

/**
 * Uniques: poe2scout's daily unit price by name (plus its live-listing competition in the default
 * league), a prefilled trade link, and — on click only — the median of the cheapest instant-buyout
 * listings of that unique.
 */

/** trade2 fetches 10 listings per call: one search + one fetch. */
export const UNIQUE_LIVE_COMPARABLES = 10;

export async function priceUnique(name: string, baseType: string, s: PriceCheckServices): Promise<PricedFields> {
  const key = name.toLowerCase();
  const { ctx, warnings } = await s.planContext([key]);
  const row = planLiquidation([{ name, qty: 1 }], ctx).rows[0];
  if (row == null) throw new Error(`price check: the planner returned no row for ${name}`);
  const listing = ctx.competition.get(key) ?? null;
  return {
    name,
    baseType,
    icon: row.icon,
    qty: 1,
    unitDiv: row.unitDiv,
    totalDiv: row.unitDiv,
    confidence: confidenceOf(row.valueSource, listing?.competition.samples ?? null, s.ages),
    hint: hintFromRow(row, { change7d: null, volume: null }, s.rates.rates.exaltPerDivine),
    tradeUrl: tradeSearchUrl(s.league, { name, type: baseType, rarity: "unique" }),
    warnings: [...warnings, ...row.warnings],
  };
}

export async function liveUnique(name: string, baseType: string, s: PriceCheckServices, cred: TradeCred): Promise<PriceCheckLiveResponse> {
  const res = await s.trade.searchComparables(
    { name, type: baseType, rarity: "unique", instantBuyout: true, mirrored: false },
    UNIQUE_LIVE_COMPARABLES,
    cred,
  );
  const v = valueFromComparables(res.listings, res.total, s.rates.rates);
  return {
    kind: "unique",
    valueDiv: v.valueDiv,
    minDiv: v.minDiv,
    samples: v.samples,
    total: v.total,
    dropped: v.dropped,
    unrated: v.unrated,
    searchUrl: res.searchUrl,
    method: `median of the cheapest ${UNIQUE_LIVE_COMPARABLES} instant-buyout listings, bait asks trimmed`,
    hint: hintFromValue(v.valueDiv, s.rates.rates, "live comparables"),
  };
}
