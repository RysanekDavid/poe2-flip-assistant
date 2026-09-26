"use client";

import { useState } from "react";
import { ComputedLeague } from "./ui/ComputedLeague";
import { PnlHero, SplitBar, TabBreakdown, ValueChart } from "./wealth/WealthCharts";
import { ManualForm, NetWorthCard } from "./wealth/NetWorthCard";
import { postJson, useBalance, type BalanceData } from "./wealth/useBalance";

interface ReadResp {
  scan?: { listingsSeen: number; total: number; divine: number; exalted: number; chaos: number; truncated: boolean };
  warning?: string | null;
}

/** "read from trade" result line — says loudly when the read was truncated or degraded. */
function readSummary(d: ReadResp): { text: string; tone: "ok" | "warn" } {
  const s = d.scan;
  const parts = [s ? `read ${s.listingsSeen}/${s.total} listings · ${s.divine}d ${s.exalted}ex ${s.chaos}c` : "snapshot saved"];
  if (s?.truncated) parts.push(`⚠ ${s.total - s.listingsSeen} cheapest listings not read (trade2 caps a search at 100)`);
  if (d.warning) parts.push(`⚠ ${d.warning}`);
  return { text: parts.join(" · "), tone: s?.truncated || d.warning ? "warn" : "ok" };
}

/** Left column: current value, read/manual actions, and their messages. */
function StashActions({ data, onChanged }: { data: BalanceData; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "warn" | "bad" } | null>(null);
  const [showManual, setShowManual] = useState(false);

  const readStash = () => {
    setBusy(true);
    setMsg(null);
    postJson<ReadResp>("/api/balance/read")
      .then((d) => {
        setMsg(readSummary(d));
        onChanged();
      })
      .catch((e: unknown) => setMsg({ text: `trade read failed: ${e instanceof Error ? e.message : String(e)}`, tone: "bad" }))
      .finally(() => setBusy(false));
  };
  const tone = msg?.tone === "bad" ? "text-bad" : msg?.tone === "warn" ? "text-amber-400" : "text-neutral-400";

  return (
    <div className="flex flex-col gap-3">
      <NetWorthCard stats={data.stats} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={readStash}
          disabled={busy || !data.stashEnabled}
          title={data.stashEnabled ? "read your public-tab currency via trade" : "connect POESESSID + account name in Settings"}
          className="rounded bg-sky-600/80 px-3 py-1.5 text-xs font-semibold hover:bg-sky-600 disabled:opacity-40"
        >
          {busy ? "reading…" : "read from trade"}
        </button>
        <button onClick={() => setShowManual((v) => !v)} className="rounded border border-neutral-700 px-3 py-1.5 text-xs hover:border-neutral-500">
          {showManual ? "close" : "manual entry"}
        </button>
      </div>
      {!data.stashEnabled && (
        <p className="text-xs text-amber-400/90">
          “read from trade” needs your POESESSID <b>and</b> account name — set both in <b>Settings</b>.
        </p>
      )}
      <p className="rounded bg-sky-500/10 px-2 py-1.5 text-xs text-sky-300/90">
        reads currency from your <strong>public</strong> stash tabs (set tab → make public). Private tabs are invisible to
        trade. Read-only, never buys. No public tab? Use <strong>manual entry</strong>.
      </p>
      {msg && <p className={`text-xs ${tone}`}>{msg.text}</p>}
      {showManual && <ManualForm onSaved={() => { setShowManual(false); onChanged(); }} />}
    </div>
  );
}

export function BalancePanel() {
  const { data, error, load } = useBalance();
  const latest = data.stats?.latest ?? null;
  const chart = data.series.map((s) => ({ t: s.fetched_at.slice(5, 16), value: s.net_worth_div }));

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold">Wealth</h2>
          <ComputedLeague league={data.league} />
        </span>
        <span className="text-xs text-neutral-500">read-only · your account · never auto-trades</span>
      </header>
      {error && <p role="alert" className="mb-3 text-sm text-bad">wealth data unavailable: {error}</p>}

      <PnlHero pnl={data.pnl} />

      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">stash net worth · trade auto / manual</div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <StashActions data={data} onChanged={load} />
        <ValueChart
          points={chart}
          height={240}
          label="net worth"
          empty={["no history yet — take a few snapshots", "one snapshot — need ≥2 for a trend line"]}
        />
      </div>

      {/* currency vs gear split + per-stash-tab breakdown with sparklines */}
      {latest && (latest.other_div > 0 || data.tabs.length > 0) && (
        <div className="mt-5">
          <SplitBar currencyDiv={latest.net_worth_div - latest.other_div} gearDiv={latest.other_div} />
        </div>
      )}

      {data.tabs.length > 0 && <TabBreakdown tabs={data.tabs} series={data.tabSeries} />}
    </section>
  );
}
