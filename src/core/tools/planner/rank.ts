import type { MaterialUse, PlanCtx } from "./types";

/** The search's edge cost (search.ts), shared with methods that pick between equivalent variants before building them. */

export const RISK_LAMBDA = 0.25;
/**
 * Ranking-only stand-in for a material with no live price (never shown: totals with an unpriced
 * material are null). Above every material price we have seen, so an unpriced route is ranked last.
 */
export const UNPRICED_RANK_DIV = 10;

/** Expected Divine (point) + λ·(dear end − point) of a macro's material uses. */
export function rankCost(move: { uses: readonly MaterialUse[] }, ctx: PlanCtx): number {
  let point = 0;
  let high = 0;
  for (const u of move.uses) {
    const price = ctx.priceOf(u.mat.id) ?? UNPRICED_RANK_DIV;
    point += u.qty.point * price;
    high += u.qty.high * price;
  }
  return point + RISK_LAMBDA * (high - point);
}
