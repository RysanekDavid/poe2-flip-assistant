import { searchListingsLinked, type TradeCred } from "../../../api/tradeClient";
import type { Listing } from "../../../api/tradeListing";
import { config } from "../../../config/env";
import { getModValue, saveModValue, type ModValueKey } from "../../../db/modValueQueries";
import type { ModLiveValue } from "../../../lib/tools/modPoolContract";
import type { TradeQuery } from "../../../lib/tradeLink";
import { valueFromComparables } from "../../comparableValuation";
import type { DivRates } from "../../listingPrice";
import { resolveRates } from "../../rates";
import { RatesUnavailableError } from "../craftmoves/moves";

/**
 * The live signal for one pool row: exactly one trade2 search + one fetch for "rare <base>, ilvl ≥
 * the tier's level, instant buyout, not mirrored, carrying <stat> ≥ the tier's lowest roll", valued
 * as the trimmed median of the cheapest comparables. Spent only on an explicit click, and cached per
 * league × base × stat × roll for everyone for `modPool.cacheHours`.
 *
 * The query is a pure function of that cache key: (stat, roll) fix the tier, and the tier's level —
 * not the viewer's chosen ilvl — is the item-level floor. Two viewers at ilvl 82 and 86 who reach the
 * same tier therefore run, and share, the identical search.
 */

/** trade2 fetches 10 listings per call — capping here keeps the value at 1 search + 1 fetch. */
const LIVE_COMPARABLES = 10;
const HOUR_MS = 3_600_000;

export interface LiveTarget {
  league: string;
  baseType: string;
  statId: string;
  /** Tier's lowest roll; null = presence-only stat (cached under min_roll 0, searched without a min). */
  minRoll: number | null;
  /** Modifier level of the tier searched: the lowest item level that can carry it. */
  tierLevel: number;
}

export const cacheKeyOf = (t: LiveTarget): ModValueKey => ({
  league: t.league,
  baseType: t.baseType,
  statId: t.statId,
  minRoll: t.minRoll ?? 0,
});

/** Oldest `checked_at` still served from the shared cache. */
export const freshAfter = (nowMs: number): number => nowMs - config.modPool.cacheHours * HOUR_MS;

/** The one comparable search a row's live value (and its trade link) runs. Pure. */
export function liveQuery(t: Pick<LiveTarget, "baseType" | "statId" | "minRoll" | "tierLevel">): TradeQuery {
  return {
    type: t.baseType,
    rarity: "rare",
    ilvlMin: t.tierLevel,
    instantBuyout: true,
    mirrored: false,
    stats: [{ id: t.statId, min: t.minRoll ?? undefined }],
  };
}

export interface LiveDeps {
  search: (q: TradeQuery, limit: number, cred: TradeCred) => Promise<{ total: number; listings: Listing[]; searchUrl: string }>;
  rates: (league: string) => DivRates | null;
}

const defaultDeps: LiveDeps = {
  search: searchListingsLinked,
  rates: (league) => resolveRates(league)?.rates ?? null,
};

/** A fresh shared cache hit, or null. Spends nothing — checked before any credential is needed. */
export function cachedLiveValue(t: LiveTarget, nowMs: number): ModLiveValue | null {
  return getModValue(cacheKeyOf(t), freshAfter(nowMs));
}

/**
 * Search, value, cache. Rates are checked first so a search is never spent on asks we cannot
 * convert; a search that errors propagates (503 + Retry-After when the shared budget is busy).
 */
export async function fetchLiveValue(t: LiveTarget, cred: TradeCred, nowMs: number, deps: LiveDeps = defaultDeps): Promise<ModLiveValue> {
  const rates = deps.rates(t.league);
  if (!rates) throw new RatesUnavailableError(t.league);
  const res = await deps.search(liveQuery(t), LIVE_COMPARABLES, cred);
  const v = valueFromComparables(res.listings, res.total, rates);
  const live: ModLiveValue = {
    valueDiv: v.valueDiv,
    minDiv: v.minDiv,
    samples: v.samples,
    total: res.total,
    searchUrl: res.searchUrl,
    checkedAt: nowMs,
  };
  saveModValue(cacheKeyOf(t), live);
  return live;
}
