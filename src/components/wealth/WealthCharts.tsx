"use client";

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import type { Pnl, TabRow, TabSeriesPoint } from "./useBalance";

export const fmt = (n: number, d = 1): string => n.toLocaleString("en-US", { maximumFractionDigits: d });

export function Delta({ label, pct }: { label: string; pct: number | null }) {
  if (pct == null) return <span className="text-xs text-neutral-600">{label} —</span>;
  const up = pct >= 0;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${up ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>
      {label} {up ? "+" : ""}{fmt(pct)}%
    </span>
  );
}

function DivDelta({ label, v }: { label: string; v: number }) {
  const up = v >= 0;
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${up ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>
      {label} {up ? "+" : ""}{fmt(v)} Div
    </span>
  );
}

/** A green value-over-time line, or a hint when there are too few points for a trend. */
export function ValueChart({ points, height, label, empty }: {
  points: { t: string; value: number }[];
  height: number;
  label: string;
  empty: [string, string]; // [no points, one point]
}) {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center rounded border border-neutral-800 text-sm text-neutral-500" style={{ height }}>
        {points.length === 0 ? empty[0] : empty[1]}
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={points}>
        <CartesianGrid stroke="#262626" />
        <XAxis dataKey="t" tick={{ fill: "#737373", fontSize: 11 }} />
        <YAxis tick={{ fill: "#737373", fontSize: 11 }} width={44} domain={["auto", "auto"]} />
        <Tooltip contentStyle={{ background: "#171717", border: "1px solid #404040" }} formatter={(v: number) => [`${fmt(v)} Div`, label]} />
        <Line type="monotone" dataKey="value" stroke="#22c55e" dot={false} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** HERO — realized profit from logged flips (auto, frictionless, no stash read). */
export function PnlHero({ pnl }: { pnl: Pnl | null }) {
  const points = (pnl?.points ?? []).map((p) => ({ t: p.t.slice(5, 16), value: p.cum }));
  return (
    <div className="mb-4 grid grid-cols-1 gap-4 rounded border border-neutral-800 bg-neutral-950/40 p-3 lg:grid-cols-[260px_1fr]">
      <div className="flex flex-col justify-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">realized P&amp;L · logged flips</div>
        {pnl && pnl.count > 0 ? (
          <>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className={`text-3xl font-bold tabular-nums ${pnl.total >= 0 ? "text-good" : "text-bad"}`}>
                {pnl.total >= 0 ? "+" : ""}{fmt(pnl.total)}
              </span>
              <span className="text-sm text-neutral-400">Div all-time</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <DivDelta label="24h" v={pnl.last24h} />
              <DivDelta label="7d" v={pnl.last7d} />
              <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">{pnl.count} flips</span>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-neutral-500">no flips logged yet — log a buy→sell and your wealth curve grows here automatically</p>
        )}
      </div>
      <ValueChart
        points={points}
        height={200}
        label="cumulative profit"
        empty={["log flips → cumulative profit plots here", "one flip — need ≥2 for a curve"]}
      />
    </div>
  );
}

/** currency-vs-gear share of net worth as a single stacked bar */
export function SplitBar({ currencyDiv, gearDiv }: { currencyDiv: number; gearDiv: number }) {
  const total = currencyDiv + gearDiv;
  if (total <= 0) return null;
  const cPct = (currencyDiv / total) * 100;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
        <span>composition</span>
        <span className="tabular-nums">
          <span className="text-sky-400">{fmt(currencyDiv)} Div currency</span> ·{" "}
          <span className="text-amber-400">{fmt(gearDiv)} Div gear</span>
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded bg-neutral-800">
        <div className="bg-sky-500" style={{ width: `${cPct}%` }} title={`currency ${fmt(cPct, 0)}%`} />
        <div className="bg-amber-500" style={{ width: `${100 - cPct}%` }} title={`gear ${fmt(100 - cPct, 0)}%`} />
      </div>
    </div>
  );
}

function TabLine({ t, hist, total, max }: { t: TabRow; hist: { value: number }[]; total: number; max: number }) {
  const first = hist[0]?.value;
  const delta = first != null && hist.length > 1 ? t.value_div - first : null;
  return (
    <div className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium text-neutral-200">{t.tab}</span>
          <span className="text-xs text-neutral-600">{t.items} items</span>
          {t.unpriced > 0 && (
            <span className="text-xs text-amber-500/70" title="no market price + no usable listing price (e.g. showcase ~price 99999 mirror)">
              {t.unpriced} unpriced
            </span>
          )}
          {delta != null && (
            <span className={`text-xs font-semibold tabular-nums ${delta >= 0 ? "text-good" : "text-bad"}`}>
              {delta >= 0 ? "+" : ""}{fmt(delta)} Div
            </span>
          )}
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded bg-neutral-800">
          <div className="h-full bg-emerald-500/70" style={{ width: `${(t.value_div / max) * 100}%` }} />
        </div>
        <div className="mt-1 flex gap-2 text-xs text-neutral-500">
          {t.divine > 0 && <span>{fmt(t.divine, 0)} Div</span>}
          {t.exalted > 0 && <span>{fmt(t.exalted, 0)} Ex</span>}
          {t.chaos > 0 && <span>{fmt(t.chaos, 0)} Ch</span>}
          {t.other_div > 0 && <span className="text-amber-400/80">+{fmt(t.other_div)} gear</span>}
        </div>
      </div>
      <div className="w-24 shrink-0 text-right">
        <div className="text-sm font-bold tabular-nums text-emerald-400">{fmt(t.value_div)}</div>
        <div className="text-xs text-neutral-600">{total > 0 ? fmt((t.value_div / total) * 100, 0) : 0}%</div>
      </div>
      <div className="hidden w-28 shrink-0 sm:block">
        {hist.length > 1 ? (
          <ResponsiveContainer width="100%" height={36}>
            <LineChart data={hist}>
              <Line type="monotone" dataKey="value" stroke="#34d399" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-right text-xs text-neutral-700">no trend</div>
        )}
      </div>
    </div>
  );
}

/** per-stash-tab worth: value, share-of-total bar, and a value-over-time sparkline per tab */
export function TabBreakdown({ tabs, series }: { tabs: TabRow[]; series: TabSeriesPoint[] }) {
  const total = tabs.reduce((a, t) => a + t.value_div, 0);
  const max = Math.max(...tabs.map((t) => t.value_div), 1);
  // pivot the flat series into per-tab arrays for the sparklines
  const byTab = new Map<string, { value: number }[]>();
  for (const p of series) {
    const arr = byTab.get(p.tab) ?? [];
    arr.push({ value: p.value_div });
    byTab.set(p.tab, arr);
  }
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">by stash tab</span>
        <span className="text-xs text-neutral-600">{tabs.length} public tabs · {fmt(total)} Div total</span>
      </div>
      <div className="space-y-1.5">
        {tabs.map((t) => (
          <TabLine key={t.tab} t={t} hist={byTab.get(t.tab) ?? []} total={total} max={max} />
        ))}
      </div>
    </div>
  );
}
