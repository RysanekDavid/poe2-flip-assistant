import type { ImpracticalView, PlanMaterialView } from "../../../lib/tools/craftPlannerContract";
import { MATS } from "../../craftMaterials";
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

/**
 * Per-material limits below the global one, for materials nobody spends by the thousand. Omen of
 * Whittling: creators spend 1–26 per ring as a suffix engine (Keyson TWgmQuiLeHA 7:17, KB §4), at
 * several Divine each — a plan past 50 is not advice even though its Chaos count looks ordinary.
 */
export const IMPRACTICAL_BY_MATERIAL: Readonly<Record<string, number>> = { [MATS.omenWhittling.id]: 50 };

const limitOf = (id: string): number => IMPRACTICAL_BY_MATERIAL[id] ?? IMPRACTICAL_CLICKS;

/**
 * The material furthest past its own limit (catalysts count: each one is applied by hand). With no
 * per-material limit in play that is the step's most-used material, as before the limits existed.
 */
export function impracticalOf(move: Move, materials: readonly PlanMaterialView[]): ImpracticalView | null {
  const over = (m: PlanMaterialView): number => m.qty.point / limitOf(m.id);
  const top = materials.filter((m) => over(m) > 1).reduce<PlanMaterialView | null>((best, m) => (!best || over(m) > over(best) ? m : best), null);
  if (!top) return null;
  return { materialId: top.id, label: top.label, clicks: { ...top.qty }, perClick: move.odds.point, undoRisk: move.undoRisk };
}
