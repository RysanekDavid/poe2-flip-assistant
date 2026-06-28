import { fetchTradeMeta } from "../api/tradeMeta";
import type { ScoutRates } from "../api/scoutClient";
import { searchListingsLinked, type Listing, type TradeCred } from "../api/tradeClient";
import { config } from "../config/env";
import { buildStatIndex, resolveLine, type ResolvedStat, type StatIndex } from "./statResolver";
import { applyPseudos, isPseudoSource } from "./pseudoRules";
import { rollSignature } from "./priceBook";
import { toDivine } from "./huntEngine";
import { parseItem, placeholder, extractNumbers, type ParsedItem, type ParsedModLine } from "./itemParser";
import type { TradeQuery, StatFilter } from "../lib/tradeLink";

/**
 * Turn a pasted rare item into a relaxed comparable-search query, then value it from the
 * listings that search returns. This is the EE2 method end-to-end: resolve mods → pseudo-group
 * → keep the searchable mods → widen each roll's min a few % → median of the cheapest online
 * comparables = fair value. A live listing far under that value is a snipe.
 */
export interface ValuationPlan {
  item: ParsedItem;
  searchStats: ResolvedStat[]; // the stats we actually searched on
  signature: string; // base + sorted stat refs (rolls excluded) — the price-book key
  query: TradeQuery;
}

export interface Valuation {
  valueDiv: number; // median of top-N cheapest comparables, in Divine
  p25Div: number; // cheaper quartile — the realistic "snap it up" price
  minDiv: number; // cheapest comparable
  samples: number; // comparables behind the estimate (confidence)
  total: number; // total live listings the search reported
}

export interface SnipeCheck {
  isSnipe: boolean;
  marginPct: number; // how far under value the listing sits
  reason: string;
}

/**
 * Pure: build the comparable search from a parsed item + a prebuilt stat index. `relaxPct`
 * widens each stat's min downward so near-identical rolls still match (too tight → zero
 * comparables).
 *
 * Mod selection (the bit that decides whether a god-roll gets valued correctly):
 *  - pseudo TOTALS always (total life, total ele res, total attributes) — what buyers filter on;
 *  - generic components a pseudo already absorbs (a single resistance / life / an attribute) are
 *    DROPPED — they over-narrow the search without adding value signal;
 *  - distinctive explicits (skill levels, spell/attack/crit/speed/spirit…) are KEPT — they are
 *    exactly what makes a rare expensive, so the comparable set must share them or it returns
 *    cheap plain-stat rares and undervalues the item.
 *  - `pseudosOnly` is the relaxation fallback: drop all explicits, search the totals only, used
 *    when the distinctive set returns too few comparables.
 */
export function buildPlan(
  item: ParsedItem,
  idx: StatIndex,
  opts: { relaxPct?: number; pseudosOnly?: boolean } = {},
): ValuationPlan {
  const relaxPct = opts.relaxPct ?? config.valuation.relaxPct;

  const resolved = item.mods.map((m) => resolveLine(m, idx)).filter((r): r is ResolvedStat => r != null);
  const pseudos = applyPseudos(resolved, idx);

  const distinctive = opts.pseudosOnly
    ? []
    : resolved.filter((r) => r.group !== "explicit" || !isPseudoSource(r.ref));
  const searchStats = [...pseudos, ...distinctive];

  // de-dupe by trade id (a mod and its pseudo can collide); keep the higher roll
  const byId = new Map<string, ResolvedStat>();
  for (const s of searchStats) {
    const prev = byId.get(s.id);
    if (!prev || s.value > prev.value) byId.set(s.id, s);
  }
  const finalStats = [...byId.values()];

  const filters: StatFilter[] = finalStats.map((s) => ({
    id: s.id,
    // presence-only for roll-less mods; otherwise min = roll reduced by relaxPct
    min: s.value > 0 ? Math.floor(s.value * (1 - relaxPct / 100)) : undefined,
  }));

  // roll-aware key: same base + same mods AT A COMPARABLE ROLL HEIGHT share a price-book bucket
  const signature = rollSignature(item.baseType, finalStats);

  const query: TradeQuery = {
    type: item.baseType,
    rarity: item.rarity.toLowerCase() === "unique" ? "unique" : "rare",
    ilvlMin: item.itemLevel ? Math.max(0, item.itemLevel - config.valuation.ilvlSlack) : undefined,
    corrupted: item.corrupted ? undefined : false, // ignore corrupted comparables unless the item itself is
    online: true,
    stats: filters,
  };

  return { item, searchStats: finalStats, signature, query };
}

/** Async wrapper: fetch (cached) catalog, build the index, plan. Used by the paste-to-value UI. */
export async function planValuation(item: ParsedItem, relaxPct = config.valuation.relaxPct): Promise<ValuationPlan> {
  const { stats } = await fetchTradeMeta();
  const idx = buildStatIndex(stats);
  return buildPlan(item, idx, { relaxPct });
}

/** Synthesize a ParsedItem from a live trade listing so the same valuation path can price it. */
export function listingToItem(l: Listing): ParsedItem {
  const mods: ParsedModLine[] = l.mods.map((raw) => ({
    raw,
    placeholdered: placeholder(raw),
    numbers: extractNumbers(raw),
    marker: "explicit" as const,
  }));
  return { rarity: "Rare", name: l.itemName, baseType: l.baseType, itemLevel: null, corrupted: false, mirrored: false, mods };
}

export interface ListingValuation {
  value: Valuation;
  plan: ValuationPlan;
  searchUrl: string; // working trade link to the comparable search
}

/**
 * Value ONE live listing by a relaxed comparable search on its ACTUAL rolls — the per-item
 * valuation that replaces the broken category median. Falls back to a pseudo-only (broader)
 * search when the distinctive set returns too few comparables, so a god-roll with a rare mod
 * still gets a price. At most two trade2 searches.
 */
export async function valueListingLive(
  l: Listing,
  idx: StatIndex,
  rates: ScoutRates,
  cred?: TradeCred,
): Promise<ListingValuation> {
  const item = listingToItem(l);
  let plan = buildPlan(item, idx);
  let res = await searchListingsLinked(plan.query, config.valuation.topN, cred);

  if (res.total < config.valuation.minComparables) {
    const broad = buildPlan(item, idx, { pseudosOnly: true });
    if ((broad.query.stats ?? []).length > 0) {
      const r2 = await searchListingsLinked(broad.query, config.valuation.topN, cred);
      if (r2.total >= res.total) {
        plan = broad;
        res = r2;
      }
    }
  }

  return { value: valueFromComparables(res.listings, res.total, rates), plan, searchUrl: res.searchUrl };
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const quantile = (sortedAsc: number[], q: number): number => {
  if (sortedAsc.length === 0) return 0;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.floor(q * sortedAsc.length))]!;
};

/** Value the item from comparable listings: median of the top-N cheapest online ones. */
export function valueFromComparables(listings: Listing[], total: number, rates: ScoutRates): Valuation {
  const prices = listings
    .filter((l) => l.price && l.online)
    .map((l) => toDivine(l.price!.amount, l.price!.currency, rates))
    .filter((d) => Number.isFinite(d) && d > 0)
    .sort((a, b) => a - b)
    .slice(0, config.valuation.topN);

  return {
    valueDiv: median(prices),
    p25Div: quantile(prices, 0.25),
    minDiv: prices[0] ?? 0,
    samples: prices.length,
    total,
  };
}

/** Is a candidate listing priced far enough under fair value, with enough confidence? */
export function checkSnipe(listingDiv: number, v: Valuation): SnipeCheck {
  const { discountPct, minSamples } = config.valuation;
  if (v.samples < minSamples) {
    return { isSnipe: false, marginPct: 0, reason: `thin data (${v.samples} comparables, need ${minSamples})` };
  }
  const marginPct = v.valueDiv > 0 ? ((v.valueDiv - listingDiv) / v.valueDiv) * 100 : 0;
  const isSnipe = listingDiv <= v.valueDiv * (1 - discountPct / 100);
  return {
    isSnipe,
    marginPct,
    reason: isSnipe
      ? `${marginPct.toFixed(0)}% under value (${listingDiv.toFixed(0)} vs ${v.valueDiv.toFixed(0)} Div)`
      : `fair (${marginPct.toFixed(0)}% under value, need ${discountPct}%)`,
  };
}

/** Convenience: parse → plan from raw clipboard text. Returns null if not an item. */
export async function planFromText(text: string): Promise<ValuationPlan | null> {
  const item = parseItem(text);
  if (!item) return null;
  return planValuation(item);
}
