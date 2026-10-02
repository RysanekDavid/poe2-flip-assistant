import type { BandView, EstimateView } from "../../../lib/tools/craftPlannerContract";
import { fmtDivOrEx, fmtDivOrExRange } from "../../../lib/format";
import { Tooltip } from "../../ui/Tooltip";

/**
 * Odds and cost chips. Exact (count-based) odds stay neutral; an estimate is amber with its band
 * and the formula behind a tooltip; unknown shows only the bounds. A number never appears without
 * its basis.
 */

/** "certain" reads well alone; inside a range ("50%–100%") the number does. */
export function pct(p: number, word = true): string {
  if (p >= 0.9995) return word ? "certain" : "100%";
  const v = p * 100;
  return `${v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v)}%`;
}

const oneIn = (p: number): string => (p > 0 && p < 0.5 ? `1 in ${Math.round(1 / p).toLocaleString("en")}` : pct(p));

const BASIS_TIP = {
  exact: "Exact: counted from the item (which mods a removal can hit, the side an omen forces).",
  estimate: "Estimate: PoE2 publishes no mod weights, so this assumes equal weight per eligible mod family and per reachable tier. The band is ×½…×2 of that prior, not a measured range.",
  unknown: "Unknown: a rule the game hasn't confirmed — only the bounds are known.",
} as const;

function FormulaTip({ odds }: { odds: EstimateView }) {
  const inputs = Object.entries(odds.inputs);
  return (
    // narrower on a phone: the chip sits ~70px in, and a 20rem bubble would push the page sideways
    <span className="block max-w-[15rem] space-y-1 sm:max-w-xs">
      <span className="block">{BASIS_TIP[odds.basis]}</span>
      <span className="block text-neutral-300">{odds.formula}</span>
      {inputs.length > 0 && <span className="block text-neutral-400">{inputs.map(([k, v]) => `${k} = ${v}`).join(" · ")}</span>}
    </span>
  );
}

function oddsText(odds: EstimateView): string {
  if (odds.basis === "unknown" || odds.point == null) return `${pct(odds.low ?? 0, false)} – ${pct(odds.high ?? 1, false)}`;
  if (odds.basis === "exact") return oneIn(odds.point);
  return odds.low != null && odds.high != null && odds.high > odds.low ? `≈ ${oneIn(odds.point)} (${pct(odds.low, false)}–${pct(odds.high, false)})` : `≈ ${oneIn(odds.point)}`;
}

const TONE = {
  exact: "border-neutral-700 bg-neutral-900 text-neutral-200",
  estimate: "border-amber-400/40 bg-amber-950/30 text-amber-200",
  unknown: "border-dashed border-neutral-500 bg-neutral-900 text-neutral-300",
} as const;

export function OddsChip({ odds }: { odds: EstimateView }) {
  return (
    <Tooltip tip={<FormulaTip odds={odds} />} align="start">
      <button type="button" className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs tabular-nums ${TONE[odds.basis]}`}>
        <span className="text-neutral-400">{odds.basis === "exact" ? "odds" : odds.basis === "estimate" ? "est. odds" : "odds ?"}</span>
        {oddsText(odds)}
      </button>
    </Tooltip>
  );
}

/** "≈ 12.6 div (6.3 – 25.2 div)" — the point first, the band in brackets; exact costs drop the band. */
export function bandText(b: BandView, exPerDiv: number | null): string {
  const ex = exPerDiv ?? 0;
  if (b.high - b.low < 1e-9) return fmtDivOrEx(b.point, ex);
  return `≈ ${fmtDivOrEx(b.point, ex)} (${fmtDivOrExRange(b.low, b.high, ex)})`;
}
