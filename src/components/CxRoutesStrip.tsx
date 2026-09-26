"use client";

import { useEffect, useState } from "react";
import { compact } from "../lib/format";

type Ccy = "DIVINE" | "EXALT" | "CHAOS";
const SHORT: Record<Ccy, string> = { DIVINE: "Div", EXALT: "Ex", CHAOS: "Ch" };

interface RouteRow {
  itemId: string | null;
  item: string;
  icon: string | null;
  from: Ccy;
  to: Ccy;
  held6: number;
  edgePct: number;
  latestPct: number | null;
  capUnitsPerHour: number;
  capDivPerHour: number | null;
  feeComplete: boolean;
}

const MAX_SHOWN = 6;

function routeTitle(r: RouteRow): string {
  const cap = r.capDivPerHour != null ? `${compact(r.capDivPerHour)} Div/h` : `${compact(r.capUnitsPerHour)} units/h`;
  return [
    `${SHORT[r.from]} → ${r.item} → ${SHORT[r.to]} → ${SHORT[r.from]} (closing conversion included)`,
    `net after gold fees: 6h median ${r.edgePct.toFixed(1)}% · last hour ${r.latestPct == null ? "—" : `${r.latestPct.toFixed(1)}%`}`,
    `held ${r.held6}/6h · slowest leg ${cap}`,
    r.feeComplete ? "all leg fees known" : "this item's own fee unknown — only currency legs counted",
  ].join("\n");
}

/**
 * Closed exchange loops that paid in most of the last 6 hours. Renders nothing when there are
 * none — an empty strip is noise.
 */
export function CxRoutesStrip({ onSelect }: { onSelect?: (item: { id: string; name: string }) => void }) {
  const [routes, setRoutes] = useState<RouteRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const load = () =>
      fetch(`/api/cx/routes?limit=${MAX_SHOWN}`)
        .then((res) => {
          if (!res.ok) throw new Error(`routes failed (${res.status})`);
          return res.json() as Promise<{ routes?: RouteRow[] }>;
        })
        .then((d) => {
          setRoutes(d.routes ?? []);
          setErr(null);
        })
        .catch((e: unknown) => setErr(String(e)));
    void load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  if (err) return <p className="mb-2 text-xs text-bad">{err}</p>;
  if (routes.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {routes.map((r) => (
        <button
          key={`${r.item}|${r.from}|${r.to}`}
          title={routeTitle(r)}
          onClick={() => r.itemId != null && onSelect?.({ id: r.itemId, name: r.item })}
          className="inline-flex items-center gap-1 rounded-md border border-emerald-900/50 bg-emerald-950/20 px-2 py-1 text-xs text-neutral-300 hover:border-good/60"
        >
          <span className="text-neutral-500">{SHORT[r.from]}</span>→
          {r.icon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.icon} alt="" className="h-4 w-4 object-contain" loading="lazy" />
          )}
          <span className="max-w-[9rem] truncate">{r.item}</span>→<span className="text-neutral-500">{SHORT[r.to]}</span>
          <span className="font-semibold tabular-nums text-good">+{r.edgePct.toFixed(1)}%</span>
          <span className="tabular-nums text-neutral-500">{r.held6}/6h</span>
        </button>
      ))}
    </div>
  );
}
