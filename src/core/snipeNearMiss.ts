import type { Listing } from "../api/tradeListing";
import { cardIcon } from "../lib/snipeCard";
import { tradeSearchUrl } from "../lib/tradeLink";
import { NEAR_MISS_REASONS, type NearMiss, type NearMissReason } from "../lib/snipeScanContract";
import { evaluateSnipe, listingAgeMin, type SnipeGateInput, type SnipeGateLimits, type SnipeGateResult } from "./snipeGate";
import { listingTradeQuery } from "./snipeCard";

/**
 * Near-misses: listings the scan valued that cleared every snipe check except the margin or the
 * comparable count. Trade › Opportunities shows the best few instead of an empty snipe section.
 * Pure: the scanner collects them for free (the valuation already ran, or the price book answered),
 * so they cost no trade2 request of their own.
 */

/** Shown on Opportunities at most. */
export const NEAR_MISS_LIMIT = 3;
/** Kept in the scan report, so the budget filter still has a few left to show. */
export const NEAR_MISS_KEEP = 10;
/** Under value by less than this is ordinary pricing noise, not a near-miss. */
export const NEAR_MISS_MIN_MARGIN_PCT = 15;
/** A near-miss may stand on fewer comparables than a snipe, but never on none. */
const NEAR_MISS_MIN_SAMPLES = 1;

export interface NearMissLimits {
  gate: SnipeGateLimits;
  minMarginPct: number;
  /** Items worth less than this are junk here as they are for snipes. */
  minValueDiv: number;
}

const isNearMissReason = (r: string): r is NearMissReason => (NEAR_MISS_REASONS as readonly string[]).includes(r);

/**
 * The reason a failed verdict is a near-miss, or null. The listing must pass the whole gate again
 * with only the margin and sample floors relaxed: stale, bait-priced or mod-less listings stay out.
 */
export function nearMissReason(input: SnipeGateInput, verdict: SnipeGateResult, limits: NearMissLimits): NearMissReason | null {
  if (verdict.pass || !isNearMissReason(verdict.reason)) return null;
  const relaxed = evaluateSnipe(
    { ...input, discountPct: limits.minMarginPct },
    { ...limits.gate, minSamples: NEAR_MISS_MIN_SAMPLES },
  );
  if (!relaxed.pass || relaxed.valueDiv < limits.minValueDiv) return null;
  return verdict.reason;
}

export interface NearMissSource {
  listing: Listing;
  archetype: string;
  league: string;
  askDiv: number;
  refDiv: number;
  samples: number;
  basis: NearMiss["basis"];
  reason: NearMissReason;
  detail: string;
  exaltPerDivine: number;
}

export function toNearMiss(s: NearMissSource): NearMiss {
  const l = s.listing;
  return {
    listingId: l.listingId,
    archetype: s.archetype,
    name: (l.itemName || s.archetype).slice(0, 200),
    baseType: l.baseType.slice(0, 200),
    rarity: l.rarity,
    icon: cardIcon(l.icon),
    priceDiv: s.askDiv,
    valueDiv: s.refDiv,
    marginPct: ((s.refDiv - s.askDiv) / s.refDiv) * 100,
    samples: s.samples,
    basis: s.basis,
    reason: s.reason,
    detail: s.detail.slice(0, 300),
    listedAt: l.indexed,
    exaltPerDivine: s.exaltPerDivine,
    tradeUrl: tradeSearchUrl(s.league, listingTradeQuery(l)),
  };
}

/**
 * The best near-misses still worth showing: fresh listings (the snipe gate's own age limit), under
 * value by at least the minimum margin, deepest discount first, then the better-sampled value.
 * `pool` lists newer observations first; a listing seen twice keeps its first (newest) entry.
 */
export function selectNearMisses(pool: readonly NearMiss[], nowMs: number, limits: NearMissLimits, limit: number = NEAR_MISS_LIMIT): NearMiss[] {
  const seen = new Set<string>();
  const kept: NearMiss[] = [];
  for (const n of pool) {
    if (seen.has(n.listingId)) continue;
    seen.add(n.listingId);
    if (n.marginPct < limits.minMarginPct || n.valueDiv < limits.minValueDiv) continue;
    if (!(listingAgeMin(n.listedAt, nowMs) <= limits.gate.freshMinutes)) continue;
    kept.push(n);
  }
  return kept.sort((a, b) => b.marginPct - a.marginPct || b.samples - a.samples).slice(0, limit);
}
