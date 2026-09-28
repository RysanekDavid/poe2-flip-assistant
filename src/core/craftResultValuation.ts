import { searchListingsLinked } from "../api/tradeClient";
import type { Listing } from "../api/tradeListing";
import { valueFromComparables, type Valuation } from "./comparableValuation";
import { legToQuery, LegFloorError, type LegContext } from "./craftLegPricing";
import { CRAFT_RESULT_MIN_COMPARABLES, CRAFT_RESULT_TOP_N, MIN_LEG_SAMPLES, bandOf } from "./craftValuation";
import type { LegReport, RecipeLegSpec } from "./craftRecipes";
import type { TradeQuery } from "../lib/tradeLink";

/**
 * Result-leg valuation from finished-item comparables — the rare-valuation method
 * (comparableValuation) applied to a recipe's result archetype: instant-buyout, never mirrored,
 * same corrupted state, stat mins exactly as the recipe states them (the sellable tier floor),
 * trimmed median of the CRAFT_RESULT_TOP_N cheapest such asks. That is a median of the cheap end
 * of the archetype's market, not of every listing — labelled so wherever it is shown. The old p30 of a loose one-mod search priced the junk end of the finished-item market.
 */

interface ComparableSet {
  total: number;
  listings: Listing[];
  searchUrl: string;
  unresolved: string[];
  relaxed: boolean;
}

/** The strict (all stats) or relaxed (tier-1 only) archetype search for a result leg. */
export function resultQuery(leg: RecipeLegSpec, ctx: Pick<LegContext, "idx">, tier1Only: boolean): { query: TradeQuery; unresolved: string[] } {
  const { query, unresolved } = legToQuery(leg, ctx.idx, { tier1Only });
  return { query: { ...query, instantBuyout: true, mirrored: false }, unresolved };
}

async function searchComparables(leg: RecipeLegSpec, ctx: LegContext, tier1Only: boolean): Promise<ComparableSet> {
  const { query, unresolved } = resultQuery(leg, ctx, tier1Only);
  const res = await searchListingsLinked(query, CRAFT_RESULT_TOP_N, ctx.cred);
  return { ...res, unresolved, relaxed: tier1Only };
}

/** Strict search first; when it lists fewer than CRAFT_RESULT_MIN_COMPARABLES and the leg has
 *  support (tier-2) stats to drop, retry on tier-1 only and keep whichever set is larger. */
async function comparableSet(leg: RecipeLegSpec, ctx: LegContext): Promise<ComparableSet> {
  const strict = await searchComparables(leg, ctx, false);
  const canRelax = leg.stats.some((s) => s.tier === 2);
  if (strict.total >= CRAFT_RESULT_MIN_COMPARABLES || !canRelax) return strict;
  const relaxed = await searchComparables(leg, ctx, true);
  return relaxed.total > strict.total ? relaxed : strict;
}

function toLegReport(set: ComparableSet, value: Valuation, medianDiv: number): LegReport {
  return {
    priceDiv: medianDiv,
    samples: value.samples,
    total: set.total,
    searchUrl: set.searchUrl,
    outliersDropped: value.dropped,
    unresolvedStats: set.unresolved,
    icon: set.listings.find((l) => l.icon)?.icon ?? null,
    floorDiv: null,
    percentile: null,
    sampled: set.listings.length,
    method: "comparable-median",
    band: bandOf(value.keptAsc),
    relaxed: set.relaxed,
    unrated: value.unrated,
  };
}

/**
 * Price a recipe's result leg: 1–2 searches + ≤ 4 fetches. Throws LegFloorError (a market
 * verdict) when fewer than MIN_LEG_SAMPLES rated comparables survive trimming.
 */
export async function priceResultLeg(leg: RecipeLegSpec, ctx: LegContext): Promise<LegReport> {
  const set = await comparableSet(leg, ctx);
  const value = valueFromComparables(set.listings, set.total, ctx.rates);
  if (value.valueDiv == null || value.samples < MIN_LEG_SAMPLES) {
    throw new LegFloorError(
      `${leg.label}: only ${value.samples} rated instant-buyout comparable(s) (need ${MIN_LEG_SAMPLES}); ` +
        `${set.total} listed, ${set.listings.length} fetched, ${value.unrated} unrated${set.relaxed ? ", relaxed to tier-1 stats" : ""} — leg not priced`,
    );
  }
  return toLegReport(set, value, value.valueDiv);
}
