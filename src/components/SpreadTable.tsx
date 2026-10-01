"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, SearchX } from "lucide-react";
import { z } from "zod";
import { CandidateSchema, RankGateSchema, RatesSchema } from "../lib/discoverContract";
import type { ExchangeRates } from "../core/priceEngine";
import { DataTable, type SortDir } from "./ui/DataTable";
import { EmptyState } from "./ui/EmptyState";
import { usePersistedChoice } from "./ui/usePersistedChoice";
import { PanelLoading } from "./shell/PanelLoading";
import { ColumnPicker } from "./ColumnPicker";
import type { RankGate } from "./FlipEdge";
import { DEFAULT_COLUMNS, OPTIONAL_COLUMNS, spreadColumns, type FlipRow, type OptionalColumn } from "./SpreadColumns";
import type { FlipSelection } from "./flip/flipTypes";

const SpreadsResponseSchema = z.object({
  rates: RatesSchema.nullable(),
  spreads: z.array(CandidateSchema.extend({ manualStale: z.boolean().optional() })),
  // absent while there are no rates yet (the route answers with a note instead)
  rankGate: RankGateSchema.optional(),
});

type SortKey = "item" | Exclude<OptionalColumn, "mode">;
const SORT_KEYS: readonly SortKey[] = ["item", "midDivine", "buyExalt", "sellChaos", "marginPct", "change7d", "volume", "throughputDivDay", "oscScore", "worthScore"];

const COLUMNS_KEY = "flips-watchlist-columns";
const COLUMNS_SCHEMA = z.array(z.enum(OPTIONAL_COLUMNS));

function cmp(a: FlipRow, b: FlipRow, key: SortKey, dir: SortDir): number {
  const d = key === "item" ? a.item.localeCompare(b.item) : (a[key] ?? -Infinity) - (b[key] ?? -Infinity);
  return dir === "asc" ? d : -d;
}

/** Sort state lives here, not in the columns: a hidden column's key keeps sorting the rows. */
function useSort() {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "worthScore", dir: "desc" });
  const onSort = (k: string) => {
    const key = SORT_KEYS.find((s) => s === k);
    if (!key) throw new Error(`Watchlist: unknown sort column ${k}`);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "item" ? "asc" : "desc" }));
  };
  return { sort, onSort };
}

/** /api/spreads, refreshed every minute and whenever the watchlist changes anywhere on the page. */
function useSpreads() {
  const [rows, setRows] = useState<FlipRow[]>([]);
  const [gate, setGate] = useState<RankGate | null>(null);
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(
    () =>
      fetch("/api/spreads")
        .then(async (r) => {
          if (!r.ok) throw new Error(`watchlist failed (${r.status})`);
          return SpreadsResponseSchema.parse(await r.json());
        })
        .then((d) => {
          setRows(d.spreads);
          setGate(d.rankGate ?? null);
          setRates(d.rates);
          setLoaded(true);
          setErr(null);
        })
        .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e))),
    [],
  );
  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    window.addEventListener("watchlist-changed", load);
    return () => {
      clearInterval(id);
      window.removeEventListener("watchlist-changed", load);
    };
  }, [load]);
  return { rows, gate, rates, loaded, err };
}

const EMPTY_SENTENCE = "Your watchlist is empty — use Watch top flips, or + watch on a Top Flips row, then enter your real Ange prices for true spreads.";

export function SpreadTable({ selectedId, onSelect }: { selectedId?: string; onSelect?: (s: FlipSelection) => void }) {
  const { rows, gate, rates, loaded, err } = useSpreads();
  const { sort, onSort } = useSort();
  const [filter, setFilter] = useState("");
  const [visibleCols, setVisibleCols] = usePersistedChoice<OptionalColumn[]>(COLUMNS_KEY, COLUMNS_SCHEMA, [...DEFAULT_COLUMNS]);

  if (!loaded && !err) return <PanelLoading />;
  if (rows.length === 0 && !err) return <EmptyState icon={<Eye className="h-5 w-5" />} title="Watchlist" sentence={EMPTY_SENTENCE} />;

  const q = filter.trim().toLowerCase();
  const shown = rows.filter((r) => q === "" || r.item.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)).sort((a, b) => cmp(a, b, sort.key, sort.dir));
  const all = spreadColumns({ gate, maxVol: shown.reduce((m, r) => Math.max(m, r.volume), 0), maxOsc: shown.reduce((m, r) => Math.max(m, r.oscScore), 0) });
  const columns = [all.item, ...OPTIONAL_COLUMNS.filter((k) => visibleCols.includes(k)).map((k) => all[k])];
  const options = OPTIONAL_COLUMNS.map((k) => ({ key: k, label: all[k].header }));

  return (
    <section className="rounded-lg border border-line bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg font-semibold text-neutral-100">Watchlist</h2>
        <span className="text-xs text-neutral-400">Pick a row for its flip plan.</span>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="filter tracked items"
          placeholder="Filter by name or category…"
          className="ml-auto h-8 w-56 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-neutral-500"
        />
        <ColumnPicker options={options} visible={visibleCols} onChange={setVisibleCols} defaults={DEFAULT_COLUMNS} />
      </header>
      {err && <p role="alert" className="mb-2 text-sm text-bad">{err}</p>}
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.itemId}
        onRowClick={onSelect ? (row) => onSelect({ row, rates }) : undefined}
        selectedKey={selectedId}
        sort={{ key: sort.key, dir: sort.dir, onSort }}
        emptyState={<EmptyState icon={<SearchX className="h-5 w-5" />} sentence={q === "" ? EMPTY_SENTENCE : `No tracked item matches "${filter.trim()}".`} />}
      />
    </section>
  );
}
