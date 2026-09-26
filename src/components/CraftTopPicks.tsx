"use client";

import { Flame } from "lucide-react";
import { evLabel } from "./craft/craftView";
import { useCraftMargins } from "./craft/CraftMarginsContext";
import { ComputedLeague } from "./ui/ComputedLeague";

/**
 * "What to craft right now" — the top recipes across all domains ranked by modelled EV. Only
 * reports that pass the server's confidence gate (≥8 listed and ≥5 usable asks per leg, bait not
 * dominating, uncapped return) are eligible: a 3-of-5 whale-ask cluster must never top the list.
 */
export function CraftTopPicks() {
  const { data, error } = useCraftMargins();
  if (error) return <p role="alert" className="text-sm text-bad">craft ranking unavailable: {error}</p>;
  const eligible = (data?.recipes ?? []).filter((r) => r.report?.status === "ok" && r.gate.ok);
  const ranked = eligible.sort((a, b) => (b.report?.evDiv ?? -Infinity) - (a.report?.evDiv ?? -Infinity)).slice(0, 3);
  const scanned = (data?.recipes ?? []).filter((r) => r.report?.status === "ok").length;
  if (!data || scanned === 0) return null;
  const ex = data.exaltPerDivine;
  const anyProfit = ranked.some((r) => (r.report?.evDiv ?? 0) > 0);

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-200">
        <Flame className={`h-4 w-4 ${anyProfit ? "text-orange-400" : "text-neutral-600"}`} />
        craft right now
      </span>
      <ComputedLeague league={data.computedLeague} />
      {ranked.map((r, i) => {
        const ev = r.report!.evDiv;
        const icon = r.heroIcon ?? r.report?.result?.icon ?? null;
        return (
          <span key={r.key} className="flex items-center gap-2 rounded-md bg-neutral-950/50 px-2.5 py-1.5 text-sm">
            <span className="text-xs text-neutral-600">{i + 1}.</span>
            {icon && (
              // eslint-disable-next-line @next/next/no-img-element -- poecdn item art
              <img src={icon} alt="" className="h-6 w-6 object-contain" />
            )}
            <span className="text-neutral-300">{r.label}</span>
            <span className={`font-semibold tabular-nums ${ev >= 0 ? "text-emerald-400" : "text-bad"}`}>{evLabel(ev, ex)}</span>
          </span>
        );
      })}
      {ranked.length === 0 && (
        <span className="text-xs text-amber-500">no recipe has enough listings behind both legs to rank — see each card's confidence note</span>
      )}
      {ranked.length > 0 && !anyProfit && <span className="text-xs text-neutral-600">every ranked recipe is negative at current prices — flip, don't craft</span>}
      <span className="text-xs text-neutral-600">modelled EV · curated hit rates · observed asks, not sales</span>
    </section>
  );
}
