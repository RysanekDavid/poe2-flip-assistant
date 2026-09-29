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
const AXIS_TICK = { fill: "#a3a3a3", fontSize: 12 }; // neutral-400: readable next to the game client

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

/** Show whichever series covers more of the window — a partial window is fine (a 10-day-old
 *  deploy shows 10 days on the 14d/30d chips and grows daily toward the cap). Tracked snapshots
 *  win near-ties (10% bias): they're real 5-min observations, ninja's curve is a 7d approximation. */
function pickSeries(db: Plot[], spark: Plot[]): { series: Plot[]; source: "tracked" | "ninja 7d" } {
  const spanH = (s: Plot[]): number => (s.length >= 2 ? (s[s.length - 1]!.t - s[0]!.t) / HOUR_MS : 0);
  if (spark.length >= 2 && spanH(spark) * 0.9 > spanH(db)) return { series: spark, source: "ninja 7d" };
  return { series: db, source: "tracked" };
}

/**
 * The unit the axis reads in: Div, or Exalted when the whole window sits under 1 Div (a 0.004 Div
 * axis is unreadable; "1.6 ex" is how the exchange quotes it).
 */
function inDisplayUnit(series: Plot[], exPerDiv: number | null): { plot: Plot[]; unit: "Div" | "ex" } {
  const max = series.reduce((m, p) => Math.max(m, p.value), 0);
  if (max >= 1 || exPerDiv == null || !(exPerDiv > 0)) return { plot: series, unit: "Div" };
  return { plot: series.map((p) => ({ ...p, value: p.value * exPerDiv })), unit: "ex" };
}

function usePriceHistory(itemId: string) {
  const [data, setData] = useState<ChartResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!itemId) return;
    let alive = true;
    setLoading(true);
    setError(null);
    setData(null); // drop the previous item's series so its chart doesn't flash under the new title
    fetch(`/api/prices?item=${encodeURIComponent(itemId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`price history failed (${response.status})`);
        return (await response.json()) as ChartResp;
      })
      .then((d: ChartResp) => alive && setData(d))
      .catch((reason: unknown) => {
        if (alive) setError(String(reason));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [itemId]);
  return { data, loading, error };
}

function WindowChips({ value, onChange }: { value: WindowId; onChange: (w: WindowId) => void }) {
  return (
    <div className="flex gap-0.5 rounded-md border border-line p-0.5" role="group" aria-label="chart window">
      {WINDOWS.map((w) => (
        <button
          key={w.id}
          type="button"
          aria-pressed={value === w.id}
          onClick={() => onChange(w.id)}
          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
            value === w.id ? "bg-neutral-700 text-neutral-100" : "text-neutral-400 hover:text-neutral-200"
          }`}
        >
          {w.id}
        </button>
      ))}
    </div>
  );
}

/** Straight segments between real observations — a smoothed curve invents prices between points. */
function Chart({ plot, unit }: { plot: Plot[]; unit: "Div" | "ex" }) {
  const fmt = (v: number) => `${v.toLocaleString("en", { maximumSignificantDigits: 4 })} ${unit}`;
  return (
    <div className="min-h-[240px] flex-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={plot} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke="#262626" />
          <XAxis dataKey="label" tick={AXIS_TICK} minTickGap={32} />
          <YAxis tick={AXIS_TICK} width={72} domain={["auto", "auto"]} unit={` ${unit}`} />
          <Tooltip contentStyle={{ background: "#171717", border: "1px solid #404040" }} formatter={(v: number) => [fmt(v), "price"]} />
          <Line type="linear" dataKey="value" stroke="#22c55e" dot={false} strokeWidth={2} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartBody({ loading, plot, unit }: { loading: boolean; plot: Plot[]; unit: "Div" | "ex" }) {
  if (loading) {
    return (
      <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-3 py-12" role="status">
        <Loader2 aria-hidden className="h-6 w-6 animate-spin text-neutral-500" />
        <p className="text-sm text-neutral-400">loading price history…</p>
      </div>
    );
  }
  if (plot.length === 0) {
    return (
      <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-2 py-12 text-neutral-400">
        <LineChartIcon aria-hidden className="h-6 w-6 text-neutral-500" />
        <p className="text-center text-sm">No history in this window yet — try a wider one; history grows with every poll.</p>
      </div>
    );
  }
  return <Chart plot={plot} unit={unit} />;
}

export function PriceChart({ itemId, itemName, exPerDiv = null }: { itemId: string; itemName: string; exPerDiv?: number | null }) {
  const { data, loading, error } = usePriceHistory(itemId);
  const [window, setWindow] = useState<WindowId>("7d");
  const { plot, unit } = useMemo(() => {
    if (!data) return { plot: [] as Plot[], unit: "Div" as const };
    const now = Date.now();
    const win = WINDOWS.find((w) => w.id === window)!;
    const db = dbSeries(data.history ?? [], win.hours, now);
    const spark = data.spark7d ? sparkSeries(data.spark7d, data.change7d, data.baseValue ?? 0, win.hours, now) : [];
    return inDisplayUnit(pickSeries(db, spark).series, exPerDiv);
  }, [data, window, exPerDiv]);
  const change7d = data?.change7d ?? null;

  return (
    <section className="flex h-full flex-col rounded-lg border border-line bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-neutral-100">
          {itemName || "Price"} <span className="text-sm font-normal text-neutral-400">— price history</span>
        </h3>
        <div className="flex items-center gap-2">
          {change7d != null && (
            <span className={`text-xs font-bold tabular-nums ${change7d >= 0 ? "text-good" : "text-bad"}`}>
              {change7d >= 0 ? "+" : ""}
              {change7d.toFixed(0)}% 7d
            </span>
          )}
          <WindowChips value={window} onChange={setWindow} />
        </div>
      </header>
      {error && <p role="alert" className="mb-2 text-sm text-bad">error: {error}</p>}
      <ChartBody loading={loading} plot={plot} unit={unit} />
    </section>
  );
}
