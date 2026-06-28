"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Loader2, LineChart as LineChartIcon } from "lucide-react";

interface DbPoint {
  baseValue: number;
  volume: number;
  fetchedAt: string;
}
interface ChartResp {
  history: DbPoint[];
  spark7d: number[] | null;
  change7d: number | null;
  baseValue: number | null;
}
interface Plot {
  t: number;
  value: number;
  label: string;
}

const WINDOWS = [
  { id: "6h", hours: 6 },
  { id: "12h", hours: 12 },
  { id: "1d", hours: 24 },
  { id: "3d", hours: 72 },
  { id: "7d", hours: 168 },
  { id: "14d", hours: 336 },
  { id: "30d", hours: 720 },
] as const;
type WindowId = (typeof WINDOWS)[number]["id"];

const HOUR_MS = 3_600_000;

function fmtClock(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Our own tracked snapshots — high-res truth, but only spans as far back as we've been polling. */
function dbSeries(history: DbPoint[], hours: number, now: number): Plot[] {
  const cutoff = now - hours * HOUR_MS;
  return history
    .map((p) => ({ t: Date.parse(p.fetchedAt.replace(" ", "T") + "Z"), value: p.baseValue }))
    .filter((p) => Number.isFinite(p.t) && p.t >= cutoff && Number.isFinite(p.value))
    .map((p) => ({ t: p.t, value: p.value, label: fmtClock(p.t) }));
}

/** ninja sparkline `data` = cumulative % offsets vs the 7d-ago baseline. Rebuild absolute Div
 *  prices spread evenly across the last 7 days, then keep the tail covering `hours`. */
function sparkSeries(spark: number[], change7d: number | null, baseValue: number, hours: number, now: number): Plot[] {
  if (spark.length === 0 || baseValue <= 0) return [];
  const base7dAgo = change7d != null ? baseValue / (1 + change7d / 100) : baseValue;
  const sevenD = 7 * 24 * HOUR_MS;
  const step = sevenD / Math.max(spark.length - 1, 1);
  const cutoff = now - hours * HOUR_MS;
  return spark
    .map((pct, i) => {
      const t = now - sevenD + i * step;
      return { t, value: base7dAgo * (1 + pct / 100), label: fmtClock(t) };
    })
    .filter((p) => p.t >= cutoff && Number.isFinite(p.value));
}

/** Prefer our tracked snapshots when they cover ≥80% of the window; otherwise fall back to
 *  ninja's 7d curve. As the DB accrues more history, "tracked" naturally takes over. */
function pickSeries(window: { hours: number }, db: Plot[], spark: Plot[]): { series: Plot[]; source: "tracked" | "ninja 7d" } {
  const span = db.length >= 2 ? (db[db.length - 1]!.t - db[0]!.t) / HOUR_MS : 0;
  if (db.length >= 2 && span >= window.hours * 0.8) return { series: db, source: "tracked" };
  if (spark.length >= 2) return { series: spark, source: "ninja 7d" };
  return { series: db, source: "tracked" };
}

export function PriceChart({ itemId, itemName }: { itemId: string; itemName: string }) {
  const [data, setData] = useState<ChartResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [window, setWindow] = useState<WindowId>("7d");

  useEffect(() => {
    if (!itemId) return;
    let alive = true;
    setLoading(true);
    setData(null); // drop the previous item's series so its chart doesn't flash under the new title
    fetch(`/api/prices?item=${encodeURIComponent(itemId)}`)
      .then((r) => r.json())
      .then((d: ChartResp) => alive && setData(d))
      .catch(() => alive && setData(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [itemId]);

  const { series } = useMemo(() => {
    if (!data) return { series: [] as Plot[], source: "tracked" as const };
    const now = Date.now();
    const win = WINDOWS.find((w) => w.id === window)!;
    const db = dbSeries(data.history ?? [], win.hours, now);
    const spark = data.spark7d ? sparkSeries(data.spark7d, data.change7d, data.baseValue ?? 0, win.hours, now) : [];
    return pickSeries(win, db, spark);
  }, [data, window]);

  const change7d = data?.change7d ?? null;

  return (
    <section className="flex h-full flex-col rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {itemName || "Price"} <span className="text-sm font-normal text-neutral-500">— history</span>
        </h2>
        <div className="flex items-center gap-2">
          {change7d != null && (
            <span className={`text-xs font-bold tabular-nums ${change7d >= 0 ? "text-good" : "text-bad"}`}>
              {change7d >= 0 ? "+" : ""}
              {change7d.toFixed(0)}% 7d
            </span>
          )}
          <div className="flex gap-0.5 rounded-md border border-neutral-800 p-0.5">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                onClick={() => setWindow(w.id)}
                className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                  window === w.id ? "bg-neutral-700 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {w.id}
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading ? (
        <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-3 py-12">
          {/* shimmer skeleton + spinner so it reads as "loading", not "empty" */}
          <Loader2 className="h-6 w-6 animate-spin text-neutral-600" />
          <p className="text-sm text-neutral-600">loading price history…</p>
          <div className="mt-1 h-24 w-full animate-pulse rounded bg-gradient-to-b from-neutral-800/40 to-transparent" />
        </div>
      ) : series.length === 0 ? (
        <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-2 py-12 text-neutral-600">
          <LineChartIcon className="h-6 w-6 text-neutral-700" />
          <p className="text-center text-sm">no history in this window yet</p>
          <p className="text-center text-xs text-neutral-700">try a wider window — we build history as we poll</p>
        </div>
      ) : (
        <div className="min-h-[240px] flex-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
              <CartesianGrid stroke="#262626" />
              <XAxis dataKey="label" tick={{ fill: "#737373", fontSize: 11 }} minTickGap={32} />
              <YAxis tick={{ fill: "#737373", fontSize: 11 }} width={48} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "#171717", border: "1px solid #404040" }} />
              <Line type="monotone" dataKey="value" stroke="#22c55e" dot={false} strokeWidth={2} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
