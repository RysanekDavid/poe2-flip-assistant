import type { ExchangeRates } from "./priceEngine";
import type { LegReport, RecipeMarginReport } from "./craftRecipes";

/**
 * Pure rules for turning a stored margin report into numbers a user acts on: the cost prefill of
 * a logged craft attempt and the buy cap of a craft-base hunt. Both used to read the base leg
 * blindly — a junk-floor base (0.0004 Div) became the recorded cost and a 1-exalt hunt cap.
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
    why.push("no floor-validated base price (the base leg failed its ask floor or has not been rescanned) — enter what you paid for the base");
  }
  if (matsCost == null) {
    needs.push("matsCostDiv");
    why.push(`no live price for: ${mats.missing.join(", ")} — enter the materials cost`);
  }
  if (base == null || matsCost == null) return { ok: false, needs, error: why.join("; ") };
  return { ok: true, baseCostDiv: base, matsCostDiv: matsCost };
}

// Buy-cap headroom over the scanned base price: hunts should also catch slightly-above-p25
// listings of a well-structured base, not only the absolute cheapest.
export const CAP_FACTOR = 1.2;

export type PresetCap =
  | { ok: true; cap: { amount: number; ccy: "divine" | "exalted" }; targetDiv: number | null }
  | { ok: false; error: string };

/** Hunt cap from the trusted base price: Divine when ≥ 1 div, else Exalted (reads better). */
export function presetCap(report: RecipeMarginReport | null, rates: ExchangeRates | null): PresetCap {
  const base = trustedBase(report);
  if (!base) {
    return {
      ok: false,
      error:
        "no floor-validated base price for this recipe yet (its base leg failed the ask floor or predates the valuation fix) — " +
        "wait for the next margin scan or set up the hunt manually with your own cap",
    };
  }
  const capDiv = base.priceDiv * CAP_FACTOR;
  const cap =
    capDiv >= 1 || rates == null
      ? { amount: Math.max(0.1, Math.round(capDiv * 10) / 10), ccy: "divine" as const }
      : { amount: Math.max(1, Math.ceil(capDiv * rates.exaltPerDivine)), ccy: "exalted" as const };
  const result = report?.valuation === "floor-percentile" ? report.result : null;
  return { ok: true, cap, targetDiv: result?.priceDiv ?? null };
}
