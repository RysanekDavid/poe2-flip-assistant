import type { EntryLineView, LootLineView } from "../../../lib/tools/bossEvContract";
import { weakest } from "./confidence";
import type { Confidence, Rate } from "./schema";

/*
 * The farm board's per-kill numbers, pure. A drop "lands on most kills" at 1 in 10 or better (by
 * its conservative low end); below that it is chase. Unknown rates never count as a hit anywhere,
 * so every probability here leans pessimistic — the sourced rates are community samples at best.
 */

/** 1 in 10: at or above this a drop shapes a typical kill; below it the drop is a lottery ticket. */
export const CHASE_BELOW = 0.1;

function bounds(rate: Rate): { lo: number | null; hi: number | null } {
  switch (rate.kind) {
    case "guaranteed":
      return { lo: 1, hi: 1 };
    case "point":
      return { lo: rate.p, hi: rate.p };
    case "range":
      return { lo: rate.lo, hi: rate.hi };
    case "unknown":
      return { lo: null, hi: null };
  }
}

const sumEv = (lines: readonly LootLineView[]): number => lines.reduce((acc, l) => acc + (l.evDiv ?? 0), 0);

/** The priced lines the floor is made of: guaranteed, or LOW rate at least 1 in 10. */
export function floorLinesOf(loot: readonly LootLineView[]): LootLineView[] {
  return loot.filter((l) => (bounds(l.rate).lo ?? 0) >= CHASE_BELOW && (l.evDiv ?? 0) > 0);
}

/** Priced value from guaranteed lines and lines whose LOW rate is at least 1 in 10. */
export function floorOf(loot: readonly LootLineView[]): number {
  return sumEv(floorLinesOf(loot));
}

const isChase = (l: LootLineView): boolean => {
  const hi = bounds(l.rate).hi;
  return hi != null && hi < CHASE_BELOW;
};

/** Priced EV of the rare lines (HIGH rate below 1 in 10), each at its conservative low end. */
export function chaseOf(loot: readonly LootLineView[]): number {
  return sumEv(loot.filter(isChase));
}

/** Kills per rare drop of any kind: 1 / Σp over chase lines with a known rate; null when none. */
export function chaseOneInOf(loot: readonly LootLineView[]): number | null {
  const p = loot.filter(isChase).reduce((acc, l) => acc + (bounds(l.rate).lo ?? 0), 0);
  return p > 0 ? 1 / p : null;
}

export interface LosingRun {
  p: number | null;
  unknownRates: number;
  /** Weakest confidence among the lines that decide p; null when p is null or nothing decides it. */
  confidence: Confidence | null;
}

/**
 * P(losing kill): no priced drop worth what the guaranteed loot leaves uncovered. Π(1 − p) over
 * priced lines ≥ max(0, entry − guaranteed), independent rolls, range at its low end, unknown rates
 * as 0 (reported). Guaranteed loot covering the entry makes it exactly 0. It is null — unknowable,
 * never a confident 100% — when the entry is partly unpriced (the threshold would be understated),
 * or when no covering drop has a known rate while some drop could still cover (a covering line with
 * an unknown rate, or an unpriced line).
 */
export function losingRunOf(loot: readonly LootLineView[], entryDiv: number, guaranteedDiv: number, entryComplete: boolean): LosingRun {
  if (!entryComplete) return { p: null, unknownRates: 0, confidence: null };
  const guaranteed = loot.filter((l) => l.rate.kind === "guaranteed" && (l.evDiv ?? 0) > 0);
  // a 0% resting on one guide's "guaranteed" is only as good as that guide
  if (guaranteedDiv >= entryDiv) return { p: 0, unknownRates: 0, confidence: weakest(guaranteed.map((l) => l.confidence)) };
  const uncovered = entryDiv - guaranteedDiv;
  const covering = loot.filter((l) => l.price != null && l.price.div >= uncovered && l.rate.kind !== "guaranteed");
  const unknownRates = covering.filter((l) => l.rate.kind === "unknown").length;
  const rated = covering.filter((l) => l.rate.kind !== "unknown");
  const couldStillCover = unknownRates > 0 || loot.some((l) => l.price == null && l.rate.kind !== "guaranteed");
  if (rated.length === 0 && couldStillCover) return { p: null, unknownRates, confidence: null };
  const p = covering.reduce((acc, l) => acc * (1 - (bounds(l.rate).lo ?? 0)), 1);
  return { p, unknownRates, confidence: weakest([...rated, ...guaranteed].map((l) => l.confidence)) };
}

/** Volume of the entry line that costs the most (the hardest one to buy in bulk); null if unlisted. */
export function entryVolumeOf(entry: readonly EntryLineView[]): number | null {
  const priciest = [...entry].sort((a, b) => (b.costDiv ?? -1) - (a.costDiv ?? -1))[0];
  return priciest?.volume ?? null;
}
