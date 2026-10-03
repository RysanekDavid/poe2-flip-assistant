import type { ImpracticalView, PlanMaterialView } from "../../../lib/tools/craftPlannerContract";
import type { Move } from "./types";

/**
 * Cost sanity. The planner's numbers are expectations of one model, and some target sets push a
 * step's expected clicks into the thousands (three top-tier prefixes from slams: every miss's
 * Annulment can take a landed mod, so the count grows roughly with 1/p²). Those figures are honest
 * but not advice — the step says so, and alternatives.ts offers cheaper target sets.
 */

/**
 * Expected uses of ONE material on one step above which the step is called impractical. The
 * curated recipes the planner rebuilds peak at ~360 Chaos Orbs (a 1-in-360 anchored loop people
 * really run) and ~740 catalysts (re-catalysing before every Catalysing slam); the owner's refused
 * plans started at ~1,160 Annulments in one step.
 */
export const IMPRACTICAL_CLICKS = 1000;

/** The step's most-used material when it passes the limit (catalysts count: each one is applied by hand). */
export function impracticalOf(move: Move, materials: readonly PlanMaterialView[]): ImpracticalView | null {
  const top = materials.reduce<PlanMaterialView | null>((best, m) => (!best || m.qty.point > best.qty.point ? m : best), null);
  if (!top || top.qty.point <= IMPRACTICAL_CLICKS) return null;
  return { materialId: top.id, label: top.label, clicks: { ...top.qty }, perClick: move.odds.point, undoRisk: move.undoRisk };
}
