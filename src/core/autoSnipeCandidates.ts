import { isBuyable, isZeroModRare, type Listing } from "../api/tradeListing";
import { config } from "../config/env";
import type { ResolvedStat, StatIndex } from "./statResolver";
import { buildPlan, listingToItem } from "./comparableValuation";
import { listingDiv, type DivRates } from "./listingPrice";
import { referenceValue } from "./priceBook";
import { listingAgeMin } from "./snipeGate";
import type { SnipeProfile } from "./snipeProfiles";

/**
 * Pure candidate selection for the autonomous snipe scanner (no network, no DB) — split out so
 * the ranking rules can be tested against synthetic listings.
 */

/**
 * Value-driving mod count of a planned item: distinctive explicits (skill levels, spirit, spell/
 * attack dmg, crit, speed) weigh 2, pseudo totals (life/res/attr) weigh 1. Junk (only generic
 * life+res → pseudos) scores low; a multi-chase-mod item scores high.
 */
export function desirability(searchStats: ResolvedStat[]): number {
  return searchStats.reduce((s, st) => s + (st.group === "pseudo" ? 1 : 2), 0);
}

export interface Candidate {
  profile: SnipeProfile;
  listing: Listing;
  div: number;
  sig: string;
  score: number;
  resolvedMods: number;
  floorDiv: number;
}

export interface Observation {
  sig: string;
  baseType: string;
  div: number;
  listingId: string | null;
}

export interface CandidateDiag {
  fetched: number; // buyable, rated listings screened
  unrated: number; // asks in currencies outside the rates ladder (never coerced to 0)
  zeroModRares: number; // rares that arrived with no mods — mod capture broken
  unreadableMods: number;
}

interface Scored {
  l: Listing;
  div: number;
  sig: string;
  score: number;
  resolvedMods: number;
}

/**
 * Candidate ORDER: most value-driving mods first; price only breaks ties (cheaper first). The old
 * `score / div` ranking made a 1-ex listing beat every real item, so the whole valuation budget
 * went on bait. The price floor (`minCandidateDiv`) is applied before ranking.
 */
export function rankCandidates<T extends { score: number; div: number }>(xs: T[]): T[] {
  return [...xs].sort((a, b) => b.score - a.score || a.div - b.div);
}

function scoreListings(listings: Listing[], rates: DivRates, idx: StatIndex, diag: CandidateDiag): Scored[] {
  const scored: Scored[] = [];
  for (const l of listings) {
    diag.unreadableMods += l.unreadableMods;
    if (isZeroModRare(l)) diag.zeroModRares++;
    if (!l.price || !isBuyable(l) || l.mirrored || !l.listingId) continue;
    const priced = listingDiv(l.price, rates);
    if (priced.kind === "unrated") {
      diag.unrated++;
      continue;
    }
    const plan = buildPlan(listingToItem(l), idx);
    scored.push({ l, div: priced.div, sig: plan.signature, score: desirability(plan.searchStats), resolvedMods: plan.resolvedCount });
  }
  diag.fetched = scored.length;
  return scored;
}

/**
 * Pure: resolve + score every listing, then surface the best snipe candidates: enough resolved
 * mods, desirable, fresh, inside the [minCandidateDiv, maxTargetDiv] band, ranked by desirability.
 * Also returns the full observation set so the caller can feed the price book.
 */
export function pickCandidates(
  profile: SnipeProfile,
  listings: Listing[],
  rates: DivRates,
  idx: StatIndex,
  nowMs: number = Date.now(),
): { candidates: Candidate[]; floorDiv: number; observations: Observation[]; diag: CandidateDiag } {
  const diag: CandidateDiag = { fetched: 0, unrated: 0, zeroModRares: 0, unreadableMods: 0 };
  const scored = scoreListings(listings, rates, idx, diag);
  const floorDiv = referenceValue(scored.map((x) => x.div)).valueDiv ?? 0;
  const observations: Observation[] = scored.map((x) => ({
    sig: x.sig,
    baseType: x.l.baseType || profile.label,
    div: x.div,
    listingId: x.l.listingId,
  }));

  const eligible = scored.filter(
    (x) =>
      x.score >= config.autoSnipe.minCandidateScore &&
      x.resolvedMods >= config.snipeGate.minResolvedMods &&
      x.div >= config.autoSnipe.minCandidateDiv &&
      x.div <= config.snipe.maxTargetDiv &&
      listingAgeMin(x.l.indexed, nowMs) <= config.snipeGate.freshMinutes,
  );
  const candidates = rankCandidates(eligible)
    .slice(0, config.autoSnipe.candidatesPerArchetype)
    .map((x) => ({ profile, listing: x.l, div: x.div, sig: x.sig, score: x.score, resolvedMods: x.resolvedMods, floorDiv }));

  return { candidates, floorDiv, observations, diag };
}

/** The next `n` archetypes from a rotating cursor, so each scan spends only a slice of the budget. */
export function pickArchetypes<T>(profiles: readonly T[], cursor: number, n: number): { picked: T[]; next: number } {
  if (profiles.length === 0 || n <= 0) return { picked: [], next: cursor };
  const count = Math.min(n, profiles.length);
  const start = ((cursor % profiles.length) + profiles.length) % profiles.length;
  const picked = Array.from({ length: count }, (_, i) => profiles[(start + i) % profiles.length]!);
  return { picked, next: (start + count) % profiles.length };
}
