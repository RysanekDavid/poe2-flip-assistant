"use client";

import { Flame } from "lucide-react";
import { evLabel, priceLabel, type RecipeView } from "./craft/craftView";
import { useCraftMargins } from "./craft/CraftMarginsContext";
import { ConfidenceBadge } from "./craft/NearMissLine";
import type { NearMiss } from "../core/craftRecipes";
import { RETURN_FLAG_MULTIPLE } from "../core/craftValuation";

const SLOTS = 3;

function RecipeIcon({ r }: { r: RecipeView }) {
  const icon = r.heroIcon ?? r.report?.result?.icon ?? null;
  if (!icon) return null;
  // eslint-disable-next-line @next/next/no-img-element -- poecdn item art
  return <img src={icon} alt="" className="h-6 w-6 object-contain" />;
}

function PickChip({ r, rank, ex }: { r: RecipeView; rank: number; ex: number | null }) {
  const ev = r.report?.evDiv ?? 0;
  return (
    <span className="flex items-center gap-2 rounded-md bg-neutral-950/50 px-2.5 py-1.5 text-sm">
      <span className="text-xs text-neutral-500">{rank}.</span>
      <RecipeIcon r={r} />
      <span className="text-neutral-300">{r.label}</span>
      <span className="font-semibold tabular-nums text-emerald-400">{evLabel(ev, ex)}</span>
      {r.report?.nearMiss && <ConfidenceBadge confidence={r.report.nearMiss.confidence} />}
      {r.report?.returnFlagged && (
        <span
          className="text-xs text-amber-500"
          title={`expected return is over ${RETURN_FLAG_MULTIPLE}× the attempt cost — normal for 1-ex bases, but open the result search and check the asks are real`}
        >
          ⚠ &gt;{RETURN_FLAG_MULTIPLE}× cost
        </span>
      )}
    </span>
  );
}

/** Why a near-miss is not a pick, in one chip: short of profit, exactly break-even, or positive
 *  EV held back by the confidence gate. Only the last one may say "gated". */
function NearMissStatus({ nm, gateOk, ex }: { nm: NearMiss; gateOk: boolean; ex: number | null }) {
  if (nm.gapDiv > 0) return <span className="tabular-nums text-bad">gap {priceLabel(nm.gapDiv, ex)}</span>;
  if (nm.evDiv <= 0) return <span className="tabular-nums text-neutral-400">break-even</span>;
  return <span className="tabular-nums text-emerald-400/70">{evLabel(nm.evDiv, ex)}{gateOk ? "" : " · gated"}</span>;
}

/** "closest to profit": what the recipe is short by and the hit rate it would need. */
function NearMissChip({ r, ex }: { r: RecipeView; ex: number | null }) {
  const nm = r.report?.nearMiss;
  if (!nm) return null;
  const why = [...r.gate.reasons, ...(nm.evDiv <= 0 ? ["EV not positive at current prices"] : [])].join("\n");
  return (
    <span className="flex items-center gap-2 rounded-md border border-dashed border-neutral-800 px-2.5 py-1.5 text-sm" title={why}>
      <RecipeIcon r={r} />
      <span className="text-neutral-400">{r.label}</span>
      <NearMissStatus nm={nm} gateOk={r.gate.ok} ex={ex} />
      <span className="text-xs tabular-nums text-neutral-500">
        needs hit ≥{(nm.breakEvenHitRate * 100).toFixed(0)}% (model {(nm.modelHitRate * 100).toFixed(0)}%)
      </span>
      <ConfidenceBadge confidence={nm.confidence} />
    </span>
  );
}

/**
 * "What to craft right now" — gate-passing, positive-EV recipes ranked by EV (craftRank picks).
 * When fewer than three qualify the row is filled with the recipes closest to profit, each with
 * its gap, break-even hit rate and confidence, so the row always says what WOULD work and why.
 */
export function CraftTopPicks() {
  const { data, error } = useCraftMargins();
  if (error) return <p role="alert" className="text-sm text-bad">craft ranking unavailable: {error}</p>;
  if (!data || !data.recipes.some((r) => r.report)) return null;
  const byKey = new Map(data.recipes.map((r) => [r.key, r]));
  const views = (keys: string[]): RecipeView[] => keys.map((k) => byKey.get(k)).filter((r): r is RecipeView => r != null);
  const picks = views(data.rank.picks).slice(0, SLOTS);
  const near = views(data.rank.nearMisses)
    .filter((r) => r.report?.nearMiss)
    .slice(0, SLOTS - picks.length);
  const ex = data.exaltPerDivine;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-200">
        <Flame className={`h-4 w-4 ${picks.length > 0 ? "text-orange-400" : "text-neutral-500"}`} />
        craft right now
      </span>
      {picks.map((r, i) => (
        <PickChip key={r.key} r={r} rank={i + 1} ex={ex} />
      ))}
      {near.length > 0 && <span className="text-xs text-neutral-500">{picks.length > 0 ? "next closest:" : "closest to profit:"}</span>}
      {near.map((r) => (
        <NearMissChip key={r.key} r={r} ex={ex} />
      ))}
      {picks.length === 0 && near.length === 0 && (
        <span className="text-xs text-neutral-400">
          {data.rank.nearMisses.length > 0
            ? `${data.rank.nearMisses.length} priced recipe(s) wait for a rescan`
            : "no recipe priced both legs on the current scan"}
          {" "}({data.rank.unpriced.length} unpriced — open a card for its error) · rescans every {data.intervalMin} min
        </span>
      )}
      <span className="text-xs text-neutral-500">modelled EV · curated hit rates · instant-buyout asks, not sales</span>
    </section>
  );
}
