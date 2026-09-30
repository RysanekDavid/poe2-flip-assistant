"use client";

import { useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { Gem, SearchX } from "lucide-react";
import { z } from "zod";
import { categoryColor } from "../lib/tableStyle";
import { demandResponseSchema, type DemandResponse, type DemandRow } from "../lib/demandContract";
import {
  applyFilters,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  hasTypedFilter,
  MIN_VALUE_DIV,
  sortRows,
  type DemandFilters,
  type SortKey,
} from "../lib/demandView";
import { ComputedLeague } from "./ui/ComputedLeague";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { InfoTip } from "./ui/Tooltip";
import { DemandTable } from "./market/DemandTable";

const errorBody = z.object({ error: z.string() });

async function loadDemand(): Promise<DemandResponse> {
  const r = await fetch("/api/demand");
  const body: unknown = await r.json();
  const err = errorBody.safeParse(body);
  if (!r.ok || err.success) throw new Error(err.success ? err.data.error : `/api/demand → ${r.status}`);
  return demandResponseSchema.parse(body);
}

/** /api/demand, parsed against the shared contract; errors are shown, never swallowed. */
function useDemand() {
  const [data, setData] = useState<DemandResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    loadDemand()
      .then((d) => {
        setData(d);
        setErr(null);
      })
      .catch((e: unknown) => {
        setData(null);
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { data, err, loading, load };
}

function Pill({ active, onClick, label, dot }: { active: boolean; onClick: () => void; label: string; dot?: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs capitalize ${
        active ? "bg-neutral-200 text-neutral-900" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
      }`}
    >
      {dot && <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
    </button>
  );
}

function Check({ checked, onChange, label, title }: { checked: boolean; onChange: (v: boolean) => void; label: string; title: string }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-neutral-400" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function FilterBar({ f, set, cats, onRefresh }: { f: DemandFilters; set: (p: Partial<DemandFilters>) => void; cats: string[]; onRefresh: () => void }) {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="filter by name or base…"
          className="min-w-48 flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm focus:border-neutral-600 focus:outline-none"
        />
        <label className="flex items-center gap-1 text-xs text-neutral-400">
          budget
          <input
            value={f.budget}
            onChange={(e) => set({ budget: e.target.value })}
            inputMode="decimal"
            placeholder="Div"
            className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-right tabular-nums"
            title="how many Divine you have — shows only items you can afford"
          />
        </label>
        <Check checked={f.valuableOnly} onChange={(v) => set({ valuableOnly: v })} label={`≥ ${MIN_VALUE_DIV} Div`} title="hide uniques worth less than 1 Divine" />
        <Check checked={f.trustedOnly} onChange={(v) => set({ trustedOnly: v })} label="hide thin" title="hide uniques with too few listings or too short a price log" />
        <button onClick={onRefresh} className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500">
          refresh
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Pill active={f.cat === ""} onClick={() => set({ cat: "" })} label="all" />
        {cats.map((c) => (
          <Pill key={c} active={f.cat === c} onClick={() => set({ cat: c })} label={c} dot={categoryColor(c).split(" ")[0]} />
        ))}
      </div>
    </>
  );
}

const EXPLAINER =
  "Every tradeable unique, most valuable first. Cheapest ask = poe2scout's lowest listed price (outlier-guarded), not a " +
  "sale price; the chip beside it is how long ago poe2scout set it. Heat = sell-through proxy (share of listings gone " +
  "between scrapes) blended with rising price; — = poe2scout has no price history to compute it. ⚠ = the headline was " +
  "an outlier, showing the recent median (verify on trade); ~ = thin data. open → starts a live buyout search.";

function DemandBody({ rows, shown, f, clear, table }: { rows: DemandRow[]; shown: DemandRow[]; f: DemandFilters; clear: () => void; table: ReactNode }) {
  if (shown.length > 0) return <>{table}</>;
  if (rows.length > 0 && hasTypedFilter(f)) {
    return (
      <EmptyState
        icon={<SearchX className="h-5 w-5" />}
        sentence="No unique matches your filter."
        cta={<Button size="sm" onClick={clear}>Clear filters</Button>}
      />
    );
  }
  const sentence =
    rows.length > 0
      ? `Every unique here is thin or under ${MIN_VALUE_DIV} Div — untick the filters to see them.`
      : "poe2scout has no unique listings for this league yet.";
  return <EmptyState icon={<Gem className="h-5 w-5" />} sentence={sentence} />;
}

export function DemandBoard() {
  const { data, err, loading, load } = useDemand();
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const [f, setF] = useState<DemandFilters>(DEFAULT_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>(DEFAULT_SORT.key);
  const [sortDir, setSortDir] = useState(DEFAULT_SORT.dir);

  const cats = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);
  const shown = sortRows(applyFilters(rows, f), sortKey, sortDir);
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  };

  return (
    <section className="rounded-lg border border-line bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-neutral-100">Unique demand</h3>
          <InfoTip tip={EXPLAINER} label="About unique demand" side="bottom" />
          <ComputedLeague league={data?.computedLeague ?? null} />
        </span>
        <span className="text-xs text-neutral-400">poe2scout asks, listing history and momentum · {shown.length} shown</span>
      </header>
      <FilterBar f={f} set={(p) => setF((prev) => ({ ...prev, ...p }))} cats={cats} onRefresh={load} />
      {err && <p role="alert" className="text-sm text-bad">error: {err}</p>}
      {data?.warnings.map((w) => <p key={w} role="status" className="mb-2 text-xs text-warn">{w}</p>)}
      {loading && <p className="text-sm text-neutral-400">loading poe2scout…</p>}
      {!loading && !err && data && (
        <DemandBody
          rows={rows}
          shown={shown}
          f={f}
          clear={() => setF((prev) => ({ ...prev, q: "", cat: "", budget: "" }))}
          table={
            <DemandTable
              rows={shown}
              exPerDiv={data.exaltPerDivine}
              historyAvailable={data.historyAvailable}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
          }
        />
      )}
    </section>
  );
}
