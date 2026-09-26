import { CX_CURRENCY_IDS } from "../../api/cxClient";

/**
 * Currency Exchange gold fee: a fixed amount of gold per unit of the item REQUESTED (the side
 * you receive), so it scales with item count — the reason amounts are denominated up to the
 * fewest-items currency (core/treasury).
 *
 * SOURCE: poe2db "Currency Exchange" fee table as used by poe2-arb (github.com/Sakuya398-Yamada/
 * poe2-arb, server/gold.ts), read 2026-09-25. Single-source and NOT verified in-game; see
 * docs/research/poe2-flip-snipe-competitors.md. Keyed by exact GGG base item id — never by
 * substring (CurrencyAddModToRare2 is the Greater Exalted Orb, a different fee).
 *
 * Any item missing here has an UNKNOWN fee: callers must surface that, never treat it as 0.
 */
export const CX_GOLD_FEE_PER_UNIT: Readonly<Record<string, number>> = {
  [CX_CURRENCY_IDS.exalted]: 120,
  [CX_CURRENCY_IDS.chaos]: 160,
  [CX_CURRENCY_IDS.divine]: 800,
};

/** Gold for requesting `units` of an item, or null when that item's fee is not in the table. */
export function goldFeeFor(baseId: string, units: number): number | null {
  const perUnit = CX_GOLD_FEE_PER_UNIT[baseId];
  return perUnit == null ? null : perUnit * units;
}

export interface LegFees {
  /** Gold of the legs whose fee is known. */
  knownGold: number;
  /** False when at least one leg's fee is unknown, so knownGold understates the real cost. */
  complete: boolean;
}

/** Sum the gold of several requested legs, tracking whether any of them was unknown. */
export function sumLegFees(legs: ReadonlyArray<{ baseId: string; units: number }>): LegFees {
  let knownGold = 0;
  let complete = true;
  for (const leg of legs) {
    const gold = goldFeeFor(leg.baseId, leg.units);
    if (gold == null) complete = false;
    else knownGold += gold;
  }
  return { knownGold, complete };
}

/**
 * Gold → Divine at the owner's gold valuation (config.cx.goldPerExalt) and the hour's Ex/Div
 * rate. Returns null when either input is unusable: an unpriced fee is unknown, not free.
 */
export function goldToDivine(gold: number, exaltPerDivine: number | null, goldPerExalt: number): number | null {
  if (exaltPerDivine == null || !(exaltPerDivine > 0) || !(goldPerExalt > 0)) return null;
  return gold / (goldPerExalt * exaltPerDivine);
}
