"use client";

import type { LegReport, NearMiss } from "../../core/craftRecipes";
import type { RankGate } from "../../core/craftValuation";
import { evLabel, priceLabel } from "./craftView";

// Static class map — Tailwind's JIT can't see dynamically-built class names.
const CONFIDENCE_CLASS: Record<NearMiss["confidence"], string> = {
  high: "border-emerald-700 text-emerald-400",
  medium: "border-amber-700 text-amber-400",
  low: "border-neutral-700 text-neutral-500",
};

const CONFIDENCE_TIP: Record<NearMiss["confidence"], string> = {
  high: "median of ≥8 of the cheapest instant-buyout asks with ≥20 listed, tight p25–p75 band, strict archetype search, clean base leg — in a market this deep the median sits at its cheap end",
  medium: "median of ≥5 of the cheapest instant-buyout asks with ≥8 listed",
  low: "thin or wide comparable market — treat the result value as a rough guess",
};

/** Small confidence pill with the rule behind it in the tooltip. */
export function ConfidenceBadge({ confidence }: { confidence: NearMiss["confidence"] }) {
  return (
    <span className={`rounded border px-1 text-[10px] uppercase tracking-wide ${CONFIDENCE_CLASS[confidence]}`} title={CONFIDENCE_TIP[confidence]}>
      {confidence}
    </span>
  );
}

const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;

/**
 * Distance to profit for one recipe: attempt cost, what a hit sells for (comparable median and
 * p25–p75 band), the hit rate that breaks even vs the curated one, and what a hit would need to
 * sell for. Blocking reasons say why it is not a top pick even when EV is positive.
 */
export function NearMissLine({ nm, result, gate, ex }: { nm: NearMiss; result: LegReport; gate: RankGate; ex: number | null }) {
  const blocking = [...gate.reasons, ...(nm.evDiv <= 0 ? ["EV not positive"] : [])];
  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-xs text-neutral-400">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>
          cost <span className="tabular-nums text-neutral-200">{priceLabel(nm.costDiv, ex)}</span>
        </span>
        <span
          title={`median of the ${result.samples} cheapest instant-buyout comparables (of ${result.total} listed); band = p25–p75 of those asks — in a deep market this is its cheap end`}
        >
          hit sells <span className="tabular-nums text-neutral-200">{priceLabel(nm.resultMedianDiv, ex)}</span>{" "}
          <span className="tabular-nums text-neutral-500">
            ({priceLabel(nm.resultBandDiv.lo, ex)}–{priceLabel(nm.resultBandDiv.hi, ex)})
          </span>
        </span>
        <span title="cost ÷ comparable median — the hit rate at which an attempt breaks even">
          break-even hit <span className={`tabular-nums ${nm.hitRateGap > 0 ? "text-bad" : "text-emerald-400"}`}>{pct(nm.breakEvenHitRate)}</span>{" "}
          vs model {pct(nm.modelHitRate)}
        </span>
        {nm.gapDiv > 0 && (
          <span title="how much EV per attempt is missing at today's prices">
            gap <span className="tabular-nums text-bad">{priceLabel(nm.gapDiv, ex)}</span>
          </span>
        )}
        <span title="cost ÷ model hit rate — what a hit must sell for to break even">
          a hit must sell ≥ <span className="tabular-nums text-neutral-200">{priceLabel(nm.resultNeededDiv, ex)}</span>
        </span>
        <span title="EV if every hit sells at the band's low end (p25)">pessimistic EV {evLabel(nm.evLowDiv, ex)}</span>
        <ConfidenceBadge confidence={nm.confidence} />
      </div>
      {blocking.length > 0 && <p className="mt-1 text-amber-500/80">not a pick: {blocking.join(" · ")}</p>}
    </div>
  );
}
