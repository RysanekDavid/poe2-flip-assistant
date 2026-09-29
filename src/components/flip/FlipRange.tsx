"use client";

import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { CCY_ART, fmtMid } from "./flipTypes";

const DAY_MS = 24 * 3_600_000;

const PricesSchema = z.object({
  history: z.array(z.object({ baseValue: z.number(), fetchedAt: z.string() })).optional(),
  spark7d: z.array(z.number()).nullish(),
  change7d: z.number().nullish(),
  baseValue: z.number().nullish(),
});
type Prices = z.infer<typeof PricesSchema>;

interface Range {
  lowDiv: number;
  highDiv: number;
  spreadPct: number;
  samples: number;
}

/**
 * Last-24h Div prices: our tracked snapshots, or — before a full day is tracked — the tail of
 * ninja's 7d curve rebuilt from its cumulative-% sparkline (the last ≈1/7 of the points).
 */
function dayValues(d: Prices, now: number): number[] {
  const tracked = (d.history ?? [])
    .map((p) => ({ t: Date.parse(p.fetchedAt.replace(" ", "T") + "Z"), v: p.baseValue }))
    .filter((x) => Number.isFinite(x.t) && x.t >= now - DAY_MS && x.v > 0)
    .map((x) => x.v);
  if (tracked.length >= 2 || !d.spark7d || d.spark7d.length < 2 || !d.baseValue || d.baseValue <= 0) return tracked;
  const base7dAgo = d.change7d != null ? d.baseValue / (1 + d.change7d / 100) : d.baseValue;
  const abs = d.spark7d.map((pct) => base7dAgo * (1 + pct / 100));
  return abs.slice(Math.floor((abs.length * 6) / 7)).filter((v) => v > 0);
}

function toRange(vals: number[]): Range | null {
  if (vals.length < 2) return null;
  const lowDiv = Math.min(...vals);
  const highDiv = Math.max(...vals);
  return { lowDiv, highDiv, spreadPct: ((highDiv - lowDiv) / lowDiv) * 100, samples: vals.length };
}

function useDayRange(itemId: string): { range: Range | null; error: string | null } {
  const [range, setRange] = useState<Range | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setRange(null);
    setError(null);
    fetch(`/api/prices?item=${encodeURIComponent(itemId)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`price history failed (${r.status})`);
        return PricesSchema.parse(await r.json());
      })
      .then((d) => alive && setRange(toRange(dayValues(d, Date.now()))))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [itemId]);
  return { range, error };
}

function Stat({ label, tone, children }: { label: string; tone: string; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-neutral-900/40 px-2 py-1.5 text-center">
      <div className={`flex items-center justify-center gap-1 text-base font-bold tabular-nums ${tone}`}>{children}</div>
      <div className="text-xs text-neutral-400">{label}</div>
    </div>
  );
}

/** The 24h low → high band: buy near the low, sell near the high — the room a swing flip has. */
export function FlipRange({ itemId }: { itemId: string }) {
  const { range, error } = useDayRange(itemId);
  if (error) return <p role="alert" className="mt-3 text-xs text-bad">flip range unavailable — {error}</p>;
  if (!range) return null;
  const div = <img src={CCY_ART.DIVINE} alt="" className="h-4 w-4 shrink-0 object-contain" />;
  return (
    <div className="mt-3" title={`24h low → high over ${range.samples} price points`}>
      <div className="mb-1.5 text-xs font-semibold text-neutral-300">24h range</div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="buy near" tone="text-neutral-100">{div}{fmtMid(range.lowDiv)}</Stat>
        <Stat label="sell near" tone="text-neutral-100">{div}{fmtMid(range.highDiv)}</Stat>
        <Stat label="max swing" tone="text-good">{range.spreadPct.toFixed(0)}%</Stat>
      </div>
    </div>
  );
}
