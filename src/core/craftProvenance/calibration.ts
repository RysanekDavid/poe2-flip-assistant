import type { CraftRecipe } from "../craftRecipes";
import type { HitRateView, RecipeProvenance } from "./schema";

/**
 * Logged attempts replace the curated hit rate once there are enough of them. Below the minimum a
 * handful of lucky or unlucky crafts would swing the EV more than the estimate is wrong, so the
 * curated number (and its basis) stays in charge and the measured rate is shown beside it.
 */
export const CALIBRATION_MIN_N = 20;

/** Closed attempts (hit or brick) for one recipe across every user's log. */
export interface AttemptStats {
  closed: number;
  hits: number;
}

export function effectiveHitRate(
  recipe: Pick<CraftRecipe, "hitRate">,
  prov: Pick<RecipeProvenance, "hitRateBasis">,
  stats: AttemptStats | undefined,
  minN = CALIBRATION_MIN_N,
): HitRateView {
  const n = stats?.closed ?? 0;
  if (stats && (stats.hits < 0 || stats.hits > stats.closed)) {
    throw new Error(`attempt stats are inconsistent: ${stats.hits} hits of ${stats.closed} closed`);
  }
  const measured = stats && n > 0 ? stats.hits / n : null;
  const curated = prov.hitRateBasis;
  const useMeasured = measured !== null && n >= minN;
  return {
    model: recipe.hitRate,
    measured,
    n,
    effective: useMeasured ? measured : recipe.hitRate,
    basis: useMeasured ? "measured" : curated.basis,
    claimN: curated.basis === "creator_claim" ? curated.n : null,
    note: curated.note,
  };
}
