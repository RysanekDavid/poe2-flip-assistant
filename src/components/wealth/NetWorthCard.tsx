"use client";

import { useState } from "react";
import { Delta, fmt } from "./WealthCharts";
import { postJson, type Snapshot, type Source, type Stats } from "./useBalance";

const SOURCE_META: Record<Source, string> = { trade: "🌐 trade", stash: "📦 stash", ocr: "👁 ocr", manual: "✍ manual" };

function Holding({ label, v }: { label: string; v: number }) {
  return (
    <div className="rounded bg-neutral-900/60 py-1">
      <div className="font-semibold tabular-nums">{fmt(v, 0)}</div>
      <div className="text-neutral-500">{label}</div>
    </div>
  );
}

/** Loud warning when the trade read could not see every listing (trade2 returns ≤100 ids). */
function TruncationWarning({ s }: { s: Snapshot }) {
  if (s.listed_seen == null || s.listed_total == null || s.listed_total <= s.listed_seen) return null;
  const missing = s.listed_total - s.listed_seen;
  return (
    <p role="alert" className="mt-2 rounded border border-amber-600/60 bg-amber-950/40 px-2 py-1.5 text-xs font-medium text-amber-300">
      ⚠ read {s.listed_seen} of {s.listed_total} listings — the {missing} cheapest items are NOT counted in this net worth.
    </p>
  );
}

/** Gear line — says so when part of it is priced at your own asking price, not the market's. */
function GearLine({ s }: { s: Snapshot }) {
  if (s.other_div <= 0) return null;
  const atAsk = s.gear_at_ask_div ?? 0;
  return (
    <div className="mt-1 text-center text-xs text-neutral-500">
      + gear <span className="font-semibold text-neutral-300">{fmt(s.other_div)}</span> Div{" "}
      {atAsk > 0 ? (
        <span
          className="cursor-help text-amber-400/90 underline decoration-dotted underline-offset-2"
          title="no market price was found for these items, so they are valued at YOUR listing price — what you ask, not what buyers pay"
        >
          ({fmt(atAsk)} at your asks)
        </span>
      ) : (
        <span className="text-neutral-600">(market value, auto from trade)</span>
      )}
    </div>
  );
}

/** Current net worth: value, like-with-like deltas, currency split, gear, truncation. */
export function NetWorthCard({ stats }: { stats: Stats | null }) {
  const latest = stats?.latest ?? null;
  if (!latest) {
    return (
      <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
        <p className="py-4 text-center text-sm text-neutral-500">no snapshot yet — read your stash or enter manually</p>
      </div>
    );
  }
  return (
    <div className="rounded border border-neutral-800 bg-neutral-950/40 p-3">
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums">{fmt(latest.net_worth_div)}</span>
        <span className="text-sm text-neutral-400">Div</span>
        <span className="ml-auto text-xs text-neutral-600">{SOURCE_META[latest.source]}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" title={`changes compare ${latest.source} snapshots only (like-with-like)`}>
        <Delta label="24h" pct={stats?.change24hPct ?? null} />
        <Delta label="7d" pct={stats?.change7dPct ?? null} />
        <Delta label="all" pct={stats?.changeAllPct ?? null} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1 text-center text-xs">
        <Holding label="Div" v={latest.divine} />
        <Holding label="Ex" v={latest.exalted} />
        <Holding label="Ch" v={latest.chaos} />
      </div>
      <GearLine s={latest} />
      <TruncationWarning s={latest} />
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

/** Manual currency entry. A rejected save (e.g. 409 gear read failed) stays open with the reason. */
export function ManualForm({ onSaved }: { onSaved: () => void }) {
  const [divine, setDivine] = useState("");
  const [exalted, setExalted] = useState("");
  const [chaos, setChaos] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    postJson("/api/balance", { divine: Number(divine || 0), exalted: Number(exalted || 0), chaos: Number(chaos || 0) })
      .then(onSaved)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
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
      {error && <p role="alert" className="mt-2 text-xs text-bad">⚠ {error}</p>}
    </div>
  );
}
