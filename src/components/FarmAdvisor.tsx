"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { compact } from "../lib/format";

interface Driver {
  item: string;
  change7d: number;
  valueDiv: number;
  volume: number;
}
interface Farm {
  category: string;
  label: string;
  hint: string;
  signal: "HOT" | "WARM" | "COLD";
  wAvgChange7d: number;
  basketValueDiv: number;
  itemCount: number;
  drivers: Driver[];
}

const SIGNAL: Record<Farm["signal"], { label: string; tone: string }> = {
  HOT: { label: "HOT", tone: "text-orange-400" },
  WARM: { label: "WARM", tone: "text-amber-400" },
  COLD: { label: "cold", tone: "text-neutral-500" },
};

/** Signal badge — a real flame for HOT (brighter = hotter), a dim flame for WARM, a dot for cold. */
function SignalMark({ signal }: { signal: Farm["signal"] }) {
  if (signal === "HOT") return <Flame className="h-4 w-4 shrink-0 fill-orange-500/30 text-orange-400" />;
  if (signal === "WARM") return <Flame className="h-4 w-4 shrink-0 text-amber-400/80" />;
  return <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-600" />;
}

/** "What to farm now" — ranks in-game activities by how hard their tradeable basket is pumping. */
export function FarmAdvisor() {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/farm")
        .then(async (response) => {
          if (!response.ok) throw new Error(`farm data failed (${response.status})`);
          return (await response.json()) as { farms?: Farm[]; fetchedAt?: string | null };
        })
        .then((data) => {
          setFarms(data.farms ?? []);
          setFetchedAt(data.fetchedAt ?? null);
          setError(null);
        })
        .catch((reason: unknown) => setError(String(reason)));
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  // top 6 by heat (already sorted desc) by default; toggle reveals the rest
  const shown = showAll ? farms : farms.slice(0, 6);

  return (
    <section data-tour="farm" className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold">What to farm now</h2>
          <span className="text-xs text-neutral-500">basket heat (7d momentum × value × liquidity) · not Div/hour</span>
        </div>
        {farms.length > 6 && (
          <button onClick={() => setShowAll((v) => !v)} className="text-xs text-neutral-400 hover:text-neutral-100">
            {showAll ? "top 6" : `show all ${farms.length}`}
          </button>
        )}
      </header>

      {error && <p role="alert" className="mb-2 text-sm text-bad">error: {error}</p>}
      {fetchedAt && <p className="mb-2 text-xs text-neutral-600">market snapshot: {fetchedAt} UTC</p>}

      {farms.length === 0 ? (
        <p className="text-sm text-neutral-500">no data yet — poll prices first</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((f) => {
            const sig = SIGNAL[f.signal];
            return (
              <div key={f.category} className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                    <SignalMark signal={f.signal} />
                    <span className="truncate">{f.label}</span>
                    {f.signal !== "COLD" && (
                      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide ${sig.tone}`}>{sig.label}</span>
                    )}
                  </span>
                  {/* colour by direction, not heat — a pumping basket is GREEN, only a falling one is red */}
                  <span className={`shrink-0 text-xs font-bold tabular-nums ${f.wAvgChange7d >= 0 ? "text-good" : "text-bad"}`}>
                    {f.wAvgChange7d >= 0 ? "+" : ""}
                    {f.wAvgChange7d.toFixed(0)}% 7d
                  </span>
                </div>
                {f.hint && <div className="mt-0.5 text-xs text-neutral-500">{f.hint}</div>}
                <ul className="mt-2 space-y-0.5 text-xs">
                  {f.drivers.map((d) => (
                    <li key={d.item} className="flex items-center justify-between gap-2 text-neutral-400">
                      <span className="truncate">{d.item}</span>
                      <span className={`shrink-0 tabular-nums ${d.change7d >= 0 ? "text-good" : "text-bad"}`}>
                        {d.change7d >= 0 ? "+" : ""}
                        {d.change7d.toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-1.5 border-t border-neutral-800 pt-1 text-xs text-neutral-600">
                  {f.itemCount} items · basket {compact(f.basketValueDiv)} Div
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-600">
        Categories = the curated in-game source. Heat ranks observed basket momentum and liquidity;
        it is not a measured farming return or guaranteed sale price.
      </p>
    </section>
  );
}
