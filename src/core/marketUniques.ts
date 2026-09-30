import type { CachedDemand, DemandItem, UnpricedUnique } from "../api/scoutDemand";
import type { UniqueTradeRow } from "../db/uniqueTradeQueries";
import { scoutKey } from "../lib/scoutKey";
import { UNIQUE_CATEGORIES, uniqueCategory } from "../lib/uniqueCategories";
import type { MarketUniqueCategory, MarketUniqueItem, MarketUniquesResponse } from "../lib/marketUniquesContract";
import { tradeUnpricedNote } from "./tools/bossEv/tradeText";

/**
 * The UNIQUES group of Trade › Prices, built from the shared poe2scout demand fill (no requests
 * of its own) plus the trade2 fallback prices the poller stores for the default league. Pure over
 * its inputs so the test can pin the rules: a value is scout's when scout has one, else the trade
 * fallback, else null with a reason — never 0, and never Divine inverted.
 */

export interface MarketUniquesInput {
  demand: CachedDemand;
  /** The caller's own league (leagueForUser); the prices stay the demand fill's league. */
  viewerLeague: string;
  /** unique_trade_values of `demand.league`, keyed by scoutKey. */
  trade: ReadonlyMap<string, UniqueTradeRow>;
  nowMs: number;
}

type Priced = Pick<MarketUniqueItem, "valueDiv" | "valueSource" | "unpricedReason" | "priceAt" | "listings">;

const isoOf = (ms: number): string => new Date(ms).toISOString();

/** The trade fallback, when the last search produced a usable price. */
function tradePrice(row: UniqueTradeRow | undefined): Priced | null {
  const seen = row?.observed;
  if (seen == null || seen.div === null) return null;
  return { valueDiv: seen.div, valueSource: "trade", unpricedReason: null, priceAt: isoOf(seen.atMs), listings: seen.listed };
}

function unpriced(scoutSays: string, row: UniqueTradeRow | undefined, listings: number, nowMs: number): Priced {
  const reason = row === undefined ? scoutSays : `${scoutSays} · ${tradeUnpricedNote(row, nowMs)}`;
  return { valueDiv: null, valueSource: null, unpricedReason: reason, priceAt: null, listings };
}

function scoutPriced(item: DemandItem, exPerDiv: number, trade: MarketUniquesInput["trade"], nowMs: number): Priced {
  if (item.priceExalt > 0) {
    return { valueDiv: item.priceExalt / exPerDiv, valueSource: "scout", unpricedReason: null, priceAt: item.priceAt, listings: item.quantity };
  }
  const row = trade.get(scoutKey(item.name));
  return tradePrice(row) ?? unpriced("poe2scout lists it at 0 (no current price)", row, item.quantity, nowMs);
}

function checkedCategory(category: string, name: string): string {
  if (uniqueCategory(category) === null) {
    throw new Error(`market uniques: poe2scout category "${category}" (${name}) has no label in lib/uniqueCategories`);
  }
  return category;
}

function fromPriced(item: DemandItem, exPerDiv: number, input: MarketUniquesInput): MarketUniqueItem {
  return {
    id: String(item.id),
    name: item.name,
    base: item.type,
    category: checkedCategory(item.category, item.name),
    icon: item.icon,
    ...scoutPriced(item, exPerDiv, input.trade, input.nowMs),
    change7d: item.momentumPct,
    spark7d: item.sparkPrices,
  };
}

function fromUnpriced(item: UnpricedUnique, input: MarketUniquesInput): MarketUniqueItem {
  const row = input.trade.get(scoutKey(item.name));
  return {
    id: String(item.id),
    name: item.name,
    base: item.type,
    category: checkedCategory(item.category, item.name),
    icon: item.icon,
    ...(tradePrice(row) ?? unpriced("poe2scout lists it without a price", row, item.quantity, input.nowMs)),
    change7d: null,
    spark7d: [],
  };
}

/** Rail rows in the fixed order, each with its priciest unique's art. */
function categoriesOf(items: readonly MarketUniqueItem[]): MarketUniqueCategory[] {
  return UNIQUE_CATEGORIES.map((c) => {
    let icon: string | null = null;
    let best = -1;
    for (const i of items) {
      if (i.category !== c.id || i.icon === null) continue;
      const v = i.valueDiv ?? 0;
      if (v > best) [best, icon] = [v, i.icon];
    }
    return { id: c.id, slug: c.slug, label: c.label, icon };
  });
}

export function buildMarketUniques(input: MarketUniquesInput): MarketUniquesResponse {
  const { demand } = input;
  const exPerDiv = demand.rates.exaltPerDivine;
  if (!(Number.isFinite(exPerDiv) && exPerDiv > 0)) {
    throw new Error(`market uniques: poe2scout Exalted per Divine is ${exPerDiv} for ${demand.league} — cannot convert asks to Divine`);
  }
  const items = [...demand.items.map((i) => fromPriced(i, exPerDiv, input)), ...demand.unpriced.map((i) => fromUnpriced(i, input))];
  return {
    league: demand.league,
    viewerLeague: input.viewerLeague,
    fetchedAt: isoOf(demand.at),
    exPerDiv,
    categories: categoriesOf(items),
    items,
    warnings: demand.warnings,
  };
}
