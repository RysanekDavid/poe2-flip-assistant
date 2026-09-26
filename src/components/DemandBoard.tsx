"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { categoryColor } from "../lib/tableStyle";
import { ComputedLeague } from "./ui/ComputedLeague";
import { DemandTable, type DemandRow, type SortDir, type SortKey } from "./market/DemandTable";

const NUMERIC: Set<SortKey> = new Set(["marketDivine", "quantity", "listedAvg", "sellThrough", "momentumPct", "heat"]);

function cmp(a: DemandRow, b: DemandRow, key: SortKey, dir: SortDir): number {
  const d = NUMERIC.has(key) ? (a[key] as number) - (b[key] as number) : String(a[key]).localeCompare(String(b[key]));
  return dir === "asc" ? d : -d;
}

interface Filters {
  q: string;
  cat: string;
  trustedOnly: boolean;
  budget: string; // Divine on hand — filter to affordable
}

function applyFilters(rows: DemandRow[], f: Filters): DemandRow[] {
  const query = f.q.trim().toLowerCase();
  const bud = Number(f.budget) || 0;
  return rows.filter((r) => {
    if (f.trustedOnly && r.trust === "thin") return false;
    if (f.cat && r.category !== f.cat) return false;
    if (bud > 0 && r.marketDivine > bud) return false; // only what your budget affords
    if (query && !r.name.toLowerCase().includes(query) && !r.type.toLowerCase().includes(query)) return false;
    return true;
  });
}

/** /api/demand rows + the league they were computed in; errors are shown, never swallowed. */
function useDemand() {
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [league, setLeague] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/demand")
      .then((r) => r.json() as Promise<{ rows?: DemandRow[]; computedLeague?: string; error?: string }>)
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setRows(d.rows ?? []);
        setLeague(d.computedLeague ?? null);
        setErr(null);
      })
      .catch((e: unknown) => {
        setRows([]);
        setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { rows, league, err, loading, load };
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

function FilterBar({ f, set, cats, onRefresh }: { f: Filters; set: (p: Partial<Filters>) => void; cats: string[]; onRefresh: () => void }) {
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
        <label className="flex items-center gap-1.5 text-xs text-neutral-400">
          <input type="checkbox" checked={f.trustedOnly} onChange={(e) => set({ trustedOnly: e.target.checked })} />
          hide thin
        </label>
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

function Explainer() {
  return (
    <p className="mb-3 text-xs text-neutral-600">
      Every tradeable unique, ranked. <b>Heat</b> = sell-through proxy (share of listings gone between scrapes) blended
      with rising price. <b>cheapest ask</b> = poe2scout&apos;s lowest listed price (outlier-guarded), not a sale price —{" "}
      <span className="text-warn">⚠</span> = headline was an outlier, showing recent median (verify on trade),{" "}
      <span className="text-neutral-500">~</span> = thin data. Set <b>budget</b> to see only what you can afford. Click a
      column to sort; <span className="text-good">open →</span> opens a live buyout search.
    </p>
  );
}

export function DemandBoard() {
  const { rows, league, err, loading, load } = useDemand();
  const [f, setF] = useState<Filters>({ q: "", cat: "", trustedOnly: true, budget: "" });
  const [sortKey, setSortKey] = useState<SortKey>("heat");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const cats = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);
  const shown = applyFilters(rows, f).sort((a, b) => cmp(a, b, sortKey, sortDir));
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  };

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold">Market — unique flip targets</h2>
          <ComputedLeague league={league} />
        </span>
        <span className="text-xs text-neutral-500">poe2scout · asks + listing history + momentum · {shown.length} shown</span>
      </header>
      <Explainer />
      <FilterBar f={f} set={(p) => setF((prev) => ({ ...prev, ...p }))} cats={cats} onRefresh={load} />
      {err && <p className="text-sm text-bad">error: {err}</p>}
      {loading && <p className="text-sm text-neutral-500">loading poe2scout…</p>}
      {!loading && !err && <DemandTable rows={shown} sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />}
    </section>
  );
}
