import type { LegReport, RecipeMarginReport } from "./craftRecipes";

/**
 * Pure rules for turning a stored margin report into numbers a user acts on: the cost prefill of
 * a logged craft attempt. It used to read the base leg blindly — a junk-floor base (0.0004 Div)
 * became the recorded cost.
 * Now only a leg that cleared the floor-percentile valuation is trusted; otherwise the caller
 * must refuse and ask the user for the number.
 */

/** A base leg we may act on: priced by the floor-percentile engine, not a legacy cheapest-10. */
export function trustedBase(report: RecipeMarginReport | null): LegReport | null {
  if (!report || report.valuation !== "floor-percentile") return null;
  return report.base;
}

export type PrefillResult =
  | { ok: true; baseCostDiv: number; matsCostDiv: number }
  | { ok: false; needs: Array<"baseCostDiv" | "matsCostDiv">; error: string };

/**
 * Attempt costs: explicit user numbers win; otherwise the base comes only from a trusted leg and
 * the materials from today's snapshot prices (all materials priced, or none of it counts).
 */
export function prefillCosts(
  report: RecipeMarginReport | null,
  explicit: { baseCostDiv?: number; matsCostDiv?: number },
  mats: { totalDiv: number; missing: readonly string[] },
): PrefillResult {
  const base = explicit.baseCostDiv ?? trustedBase(report)?.priceDiv ?? null;
  const matsCost = explicit.matsCostDiv ?? (mats.missing.length === 0 ? mats.totalDiv : null);
  const needs: Array<"baseCostDiv" | "matsCostDiv"> = [];
  const why: string[] = [];
  if (base == null) {
    needs.push("baseCostDiv");
    why.push("no fresh floor-validated base price (the base leg failed its ask floor, has not been rescanned, or its last good scan is stale) — enter what you paid for the base");
  }
  if (matsCost == null) {
    needs.push("matsCostDiv");
    why.push(`no live price for: ${mats.missing.join(", ")} — enter the materials cost`);
  }
  if (base == null || matsCost == null) return { ok: false, needs, error: why.join("; ") };
  return { ok: true, baseCostDiv: base, matsCostDiv: matsCost };
}
