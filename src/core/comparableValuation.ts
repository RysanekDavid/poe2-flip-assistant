import { fetchTradeMeta } from "../api/tradeMeta";
import { searchListingsLinked, type TradeCred } from "../api/tradeClient";
import { isBuyable, type Listing } from "../api/tradeListing";
import { config } from "../config/env";
import { buildStatIndex, resolveLine, type ResolvedStat, type StatIndex } from "./statResolver";
import { applyPseudos, isPseudoSource } from "./pseudoRules";
import { referenceValue, rollSignature } from "./priceBook";
import { ratedDiv, type DivRates } from "./listingPrice";
import { parseItem, placeholder, extractNumbers, type ParsedItem, type ParsedModLine } from "./itemParser";
import type { TradeQuery, StatFilter } from "../lib/tradeLink";

/**
 * Turn a rare item into a relaxed comparable-search query, then value it from the listings that
 * search returns. This is the EE2 method end-to-end: resolve mods → pseudo-group → keep the
 * searchable mods → widen each roll's min a few % → trimmed median of instant-buyout comparables
 * = fair value. A live listing far under that value is a snipe (decided by snipeGate).
 */
export interface ValuationPlan {
  item: ParsedItem;
  searchStats: ResolvedStat[]; // the stats we actually searched on
  resolvedCount: number; // item mod lines that resolved to a trade stat (the gate's mod count)
  signature: string; // roll-aware price-book key (priceBook.rollSignature)
  query: TradeQuery;
}

export interface Valuation {
  valueDiv: number | null; // trimmed median of comparables (candidate excluded), null = none usable
  minDiv: number | null; // cheapest surviving comparable
  samples: number; // comparables behind the estimate (confidence)
  dropped: number; // cheap outliers (bait) trimmed away
  unrated: number; // comparables priced in currencies outside the rates ladder (not counted)
  total: number; // total live listings the search reported
}

/** Keep only the stats worth searching on: pseudo totals + distinctive explicits (see buildPlan). */
function selectSearchStats(resolved: ResolvedStat[], idx: StatIndex, pseudosOnly: boolean): ResolvedStat[] {
  const pseudos = applyPseudos(resolved, idx);
  const distinctive = pseudosOnly ? [] : resolved.filter((r) => r.group !== "explicit" || !isPseudoSource(r.ref));
  // de-dupe by trade id (a mod and its pseudo can collide); keep the higher roll
  const byId = new Map<string, ResolvedStat>();
  for (const s of [...pseudos, ...distinctive]) {
    const prev = byId.get(s.id);
    if (!prev || s.value > prev.value) byId.set(s.id, s);
  }
  return [...byId.values()];
}

/**
 * Pure: build the comparable search from a parsed item + a prebuilt stat index. `relaxPct`
 * widens each stat's min downward so near-identical rolls still match (too tight → zero
 * comparables).
 *
 * Mod selection (the bit that decides whether a god-roll gets valued correctly):
 *  - pseudo TOTALS always (total life, total ele res, total attributes) — what buyers filter on;
 *  - generic components a pseudo already absorbs are DROPPED — they over-narrow the search;
 *  - distinctive explicits (skill levels, spell/attack/crit/speed/spirit…) are KEPT;
 *  - `pseudosOnly` is the relaxation fallback used when the distinctive set is too narrow.
 *
 * Comparables are instant-buyout only, never mirrored, in the SAME corrupted state, and above an
 * item-level floor — a corrupted or low-ilvl listing is a different product.
 */
export function buildPlan(
  item: ParsedItem,
  idx: StatIndex,
  opts: { relaxPct?: number; pseudosOnly?: boolean } = {},
): ValuationPlan {
  const relaxPct = opts.relaxPct ?? config.valuation.relaxPct;
  const resolved = item.mods.map((m) => resolveLine(m, idx)).filter((r): r is ResolvedStat => r != null);
  const finalStats = selectSearchStats(resolved, idx, opts.pseudosOnly === true);

  const filters: StatFilter[] = finalStats.map((s) => ({
    id: s.id,
    // presence-only for roll-less mods; otherwise min = roll reduced by relaxPct
    min: s.value > 0 ? Math.floor(s.value * (1 - relaxPct / 100)) : undefined,
  }));

  const query: TradeQuery = {
    type: item.baseType,
    rarity: item.rarity.toLowerCase() === "unique" ? "unique" : "rare",
    ilvlMin: item.itemLevel ? Math.max(0, item.itemLevel - config.valuation.ilvlSlack) : undefined,
    corrupted: item.corrupted,
    mirrored: false,
    instantBuyout: true,
    stats: filters,
  };

  return { item, searchStats: finalStats, resolvedCount: resolved.length, signature: rollSignature(item.baseType, finalStats), query };
}

/** Async wrapper: fetch (cached) catalog, build the index, plan. Used by the paste-to-value UI. */
export async function planValuation(item: ParsedItem, relaxPct = config.valuation.relaxPct): Promise<ValuationPlan> {
  const { stats } = await fetchTradeMeta();
  const idx = buildStatIndex(stats);
  return buildPlan(item, idx, { relaxPct });
}

/** Synthesize a ParsedItem from a live trade listing so the same valuation path can price it. */
export function listingToItem(l: Listing): ParsedItem {
  const mods: ParsedModLine[] = l.modLines.map((m) => ({
    raw: m.text,
    placeholdered: placeholder(m.text),
    numbers: extractNumbers(m.text),
    marker: m.marker,
    statId: m.statId,
  }));
  return {
    rarity: l.rarity ?? "Rare",
    name: l.itemName,
    baseType: l.baseType,
    itemLevel: l.itemLevel,
    corrupted: l.corrupted,
    mirrored: l.mirrored,
    mods,
  };
}

export interface ListingValuation {
  value: Valuation;
  plan: ValuationPlan;
  searchUrl: string; // working trade link to the comparable search
}

/**
 * Value ONE live listing by a relaxed comparable search on its ACTUAL rolls. Falls back to a
 * pseudo-only (broader) search when the distinctive set returns too few comparables, so a
 * god-roll with a rare mod still gets a price. At most two trade2 searches. The candidate is
 * excluded from its own comparable set.
 */
export async function valueListingLive(
  l: Listing,
  idx: StatIndex,
  rates: DivRates,
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
        plan = { ...broad, resolvedCount: plan.resolvedCount };
        res = r2;
      }
    }
  }

  const value = valueFromComparables(res.listings, res.total, rates, l.listingId);
  return { value, plan, searchUrl: res.searchUrl };
}

/** Value the item from buyable comparables: trimmed median, candidate (`excludeListingId`) excluded. */
export function valueFromComparables(
  listings: Listing[],
  total: number,
  rates: DivRates,
  excludeListingId: string | null = null,
): Valuation {
  const comps = listings.filter((l) => isBuyable(l) && !l.mirrored && (!excludeListingId || l.listingId !== excludeListingId));
  const divs = comps.map((l) => ratedDiv(l.price, rates));
  const rated = divs.filter((d): d is number => d != null);
  const ref = referenceValue(rated);
  return {
    valueDiv: ref.valueDiv,
    minDiv: ref.minDiv,
    samples: ref.samples,
    dropped: ref.dropped,
    unrated: comps.filter((l) => l.price != null).length - rated.length,
    total,
  };
}

/** Convenience: parse → plan from raw clipboard text. Returns null if not an item. */
export async function planFromText(text: string): Promise<ValuationPlan | null> {
  const item = parseItem(text);
  if (!item) return null;
  return planValuation(item);
}
