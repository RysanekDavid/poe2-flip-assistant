"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { evLabel, type RecipeView } from "./craft/MarginBreakdown";

interface Resp {
  exaltPerDivine: number | null;
  recipes: RecipeView[];
  error?: string;
}

/**
 * "What to craft right now" — the top recipes across all domains ranked by live EV. Green = the
 * market pays for the craft today; red = crafting loses money at current prices, flip instead.
 */
export function CraftTopPicks() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/craft/margins")
        .then((r) => r.json() as Promise<Resp>)
        .then((d) => !d.error && setData(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const ranked = (data?.recipes ?? [])
    .filter((r) => r.report?.status === "ok")
    .sort((a, b) => (b.report?.evDiv ?? -Infinity) - (a.report?.evDiv ?? -Infinity))
    .slice(0, 3);
  if (ranked.length === 0) return null;
  const ex = data?.exaltPerDivine ?? null;
  const anyProfit = ranked.some((r) => (r.report?.evDiv ?? 0) > 0);

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-3">
      <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-200">
        <Flame className={`h-4 w-4 ${anyProfit ? "text-orange-400" : "text-neutral-600"}`} />
        craft right now
      </span>
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
      {!anyProfit && <span className="text-xs text-neutral-600">every recipe is negative at current prices — flip, don't craft</span>}
    </section>
  );
}
