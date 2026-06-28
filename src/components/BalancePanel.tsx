"use client";

import { useCallback, useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type Source = "trade" | "stash" | "ocr" | "manual";

interface Snapshot {
  id: number;
  divine: number;
  exalted: number;
  chaos: number;
  other_div: number;
  net_worth_div: number;
  source: Source;
  note: string | null;
  fetched_at: string;
}

interface Stats {
  latest: Snapshot | null;
  first: Snapshot | null;
  change24hPct: number | null;
  change7dPct: number | null;
  changeAllPct: number | null;
  count: number;
}

interface Pnl {
  points: { t: string; cum: number }[];
  total: number;
  last7d: number;
  last24h: number;
  count: number;
}

interface TabRow {
  tab: string;
  divine: number;
  exalted: number;
  chaos: number;
  other_div: number;
  value_div: number;
  items: number;
  unpriced: number;
}
interface TabSeriesPoint {
  tab: string;
  fetched_at: string;
  value_div: number;
}

const fmt = (n: number, d = 1): string => n.toLocaleString("en-US", { maximumFractionDigits: d });

function Delta({ label, pct }: { label: string; pct: number | null }) {
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

const SOURCE_META: Record<Source, string> = { trade: "🌐 trade", stash: "📦 stash", ocr: "👁 ocr", manual: "✍ manual" };

export function BalancePanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [pnl, setPnl] = useState<Pnl | null>(null);
  const [series, setSeries] = useState<Snapshot[]>([]);
  const [tabs, setTabs] = useState<TabRow[]>([]);
  const [tabSeries, setTabSeries] = useState<TabSeriesPoint[]>([]);
  const [stashEnabled, setStashEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showManual, setShowManual] = useState(false);

  const load = useCallback(() => {
    fetch("/api/balance")
      .then((r) => r.json())
      .then((d: { balances?: Snapshot[]; stats?: Stats; pnl?: Pnl; stashEnabled?: boolean; tabs?: TabRow[]; tabSeries?: TabSeriesPoint[] }) => {
        setSeries((d.balances ?? []).slice().reverse()); // oldest → newest for the chart
        setStats(d.stats ?? null);
        setPnl(d.pnl ?? null);
        setStashEnabled(d.stashEnabled ?? false);
        setTabs(d.tabs ?? []);
        setTabSeries(d.tabSeries ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const readStash = () => {
    setBusy(true);
    setMsg(null);
    fetch("/api/balance/read", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setMsg(`trade read failed: ${d.error}`);
        else {
          const s = d.scan;
          setMsg(s ? `read ${s.listingsSeen} listings · ${s.divine}d ${s.exalted}ex ${s.chaos}c` : "snapshot saved");
          load();
        }
      })
      .catch((e) => setMsg(String(e)))
      .finally(() => setBusy(false));
  };

  const latest = stats?.latest ?? null;
  const chart = series.map((s) => ({ t: s.fetched_at.slice(5, 16), value: s.net_worth_div }));
  const pnlChart = (pnl?.points ?? []).map((p) => ({ t: p.t.slice(5, 16), value: p.cum }));

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Wealth</h2>
        <span className="text-xs text-neutral-500">read-only · your account · never auto-trades</span>
      </header>

      {/* HERO — realized profit from logged flips (auto, frictionless, no stash read) */}
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
        <div>
          {pnlChart.length < 2 ? (
            <div className="flex h-[200px] items-center justify-center text-sm text-neutral-600">
              {pnlChart.length === 0 ? "log flips → cumulative profit plots here" : "one flip — need ≥2 for a curve"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={pnlChart}>
                <CartesianGrid stroke="#262626" />
                <XAxis dataKey="t" tick={{ fill: "#737373", fontSize: 11 }} />
                <YAxis tick={{ fill: "#737373", fontSize: 11 }} width={44} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "#171717", border: "1px solid #404040" }} formatter={(v: number) => [`${fmt(v)} Div`, "cumulative profit"]} />
                <Line type="monotone" dataKey="value" stroke="#22c55e" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">stash net worth · trade auto / manual</div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        {/* LEFT — current value + actions */}
        <div className="flex flex-col gap-3">
          <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
            {latest ? (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tabular-nums">{fmt(latest.net_worth_div)}</span>
                  <span className="text-sm text-neutral-400">Div</span>
                  <span className="ml-auto text-xs text-neutral-600">{SOURCE_META[latest.source]}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Delta label="24h" pct={stats?.change24hPct ?? null} />
                  <Delta label="7d" pct={stats?.change7dPct ?? null} />
                  <Delta label="all" pct={stats?.changeAllPct ?? null} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
                  <Holding label="Div" v={latest.divine} />
                  <Holding label="Ex" v={latest.exalted} />
                  <Holding label="Ch" v={latest.chaos} />
                </div>
                {latest.other_div > 0 && (
                  <div className="mt-1 text-center text-xs text-neutral-500">
                    + gear <span className="font-semibold text-neutral-300">{fmt(latest.other_div)}</span> Div <span className="text-neutral-600">(auto from trade)</span>
                  </div>
                )}
              </>
            ) : (
              <p className="py-4 text-center text-sm text-neutral-500">no snapshot yet — read your stash or enter manually</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={readStash}
              disabled={busy || !stashEnabled}
              title={stashEnabled ? "read your public-tab currency via trade" : "set POESESSID + POE_ACCOUNT in .env.local"}
              className="rounded bg-sky-600/80 px-3 py-1.5 text-xs font-semibold hover:bg-sky-600 disabled:opacity-40"
            >
              {busy ? "reading…" : "read from trade"}
            </button>
            <button onClick={() => setShowManual((v) => !v)} className="rounded border border-neutral-700 px-3 py-1.5 text-xs hover:border-neutral-500">
              {showManual ? "close" : "manual entry"}
            </button>
          </div>
          <p className="rounded bg-sky-500/10 px-2 py-1.5 text-xs text-sky-300/90">
            reads currency from your <strong>public</strong> stash tabs (set tab → make public). Private tabs are invisible to
            trade. Read-only, never buys. No public tab? Use <strong>manual entry</strong>.
          </p>
          {msg && <p className="text-xs text-neutral-400">{msg}</p>}
          {showManual && <ManualForm onSaved={() => { setShowManual(false); load(); }} />}
        </div>

        {/* RIGHT — net worth over time */}
        <div>
          {chart.length < 2 ? (
            <div className="flex h-[240px] items-center justify-center rounded border border-neutral-800 text-sm text-neutral-500">
              {chart.length === 0 ? "no history yet — take a few snapshots" : "one snapshot — need ≥2 for a trend line"}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chart}>
                <CartesianGrid stroke="#262626" />
                <XAxis dataKey="t" tick={{ fill: "#737373", fontSize: 11 }} />
                <YAxis tick={{ fill: "#737373", fontSize: 11 }} width={44} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "#171717", border: "1px solid #404040" }} formatter={(v: number) => [`${fmt(v)} Div`, "net worth"]} />
                <Line type="monotone" dataKey="value" stroke="#22c55e" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* currency vs gear split + per-stash-tab breakdown with sparklines */}
      {latest && (latest.other_div > 0 || tabs.length > 0) && (
        <div className="mt-5">
          <SplitBar currencyDiv={latest.net_worth_div - latest.other_div} gearDiv={latest.other_div} />
        </div>
      )}

      {tabs.length > 0 && <TabBreakdown tabs={tabs} series={tabSeries} />}
    </section>
  );
}

/** currency-vs-gear share of net worth as a single stacked bar */
function SplitBar({ currencyDiv, gearDiv }: { currencyDiv: number; gearDiv: number }) {
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

/** per-stash-tab worth: value, share-of-total bar, and a value-over-time sparkline per tab */
function TabBreakdown({ tabs, series }: { tabs: TabRow[]; series: TabSeriesPoint[] }) {
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
        {tabs.map((t) => {
          const hist = byTab.get(t.tab) ?? [];
          const first = hist[0]?.value;
          const delta = first != null && hist.length > 1 ? t.value_div - first : null;
          return (
            <div key={t.tab} className="flex items-center gap-3 rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2">
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
        })}
      </div>
    </div>
  );
}

function Holding({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded bg-neutral-900/60 py-1">
      <div className="font-semibold tabular-nums">{fmt(v, 0)}</div>
      <div className="text-neutral-500">{label}</div>
    </div>
  );
}

function ManualForm({ onSaved }: { onSaved: () => void }) {
  const [divine, setDivine] = useState("");
  const [exalted, setExalted] = useState("");
  const [chaos, setChaos] = useState("");

  const submit = () => {
    fetch("/api/balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        divine: Number(divine || 0),
        exalted: Number(exalted || 0),
        chaos: Number(chaos || 0),
      }),
    }).then(onSaved);
  };

  return (
    <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
      <p className="mb-2 text-xs text-neutral-500">read your currency-tab stacks → type here. Gear value is added automatically from trade.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Num label="Divine" v={divine} set={setDivine} />
        <Num label="Exalted" v={exalted} set={setExalted} />
        <Num label="Chaos" v={chaos} set={setChaos} />
        <button onClick={submit} className="rounded bg-good/80 px-3 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-good">save</button>
      </div>
    </div>
  );
}

function Num({ label, v, set }: { label: string; v: string; set: (s: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      {label}
      <input
        value={v}
        onChange={(e) => set(e.target.value)}
        inputMode="decimal"
        placeholder="0"
        className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-right text-sm tabular-nums"
      />
    </label>
  );
}
