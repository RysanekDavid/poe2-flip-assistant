"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { SearchX } from "lucide-react";
import type { ExchangeRates } from "../core/priceEngine";
import { DataTable, type SortDir } from "./ui/DataTable";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { edgeSortTier, MarketSourceBadge, type PersistedNextHour, type RankGate } from "./FlipEdge";
import { discoverColumns } from "./DiscoverColumns";
import { CxRoutesStrip } from "./CxRoutesStrip";
import type { Candidate, FlipSelection } from "./flip/flipTypes";

interface CxSummary {
  newestHour: number;
  rankGate: RankGate;
  persistedNextHour: PersistedNextHour;
}
interface DiscoverResponse {
  candidates?: Candidate[];
  rates?: ExchangeRates | null;
  fetchedAt?: string | null;
  cx?: CxSummary | null;
}

type SortKey = "item" | "edgePct" | "change7d" | "volume" | "worthScore";
const SORT_KEYS: readonly SortKey[] = ["item", "edgePct", "change7d", "volume", "worthScore"];
const TOP_SCORE = 50; // worthScore at/above this = a "top flip"
const PAGE = 20; // rows before "show all" — the flip plan sits below the table

function cmp(a: Candidate, b: Candidate, key: SortKey, dir: SortDir): number {
  // Edge sorts by rank tier first in BOTH directions: an unranked fat number never tops the list.
  if (key === "edgePct" && edgeSortTier(a) !== edgeSortTier(b)) return edgeSortTier(b) - edgeSortTier(a);
  const d = key === "item" ? a.item.localeCompare(b.item) : (a[key] ?? -Infinity) - (b[key] ?? -Infinity);
  return dir === "asc" ? d : -d;
}

async function json<T>(r: Response, label: string): Promise<T> {
  if (!r.ok) throw new Error(`${label} failed (${r.status})`);
  return (await r.json()) as T;
}

function send(method: "POST" | "DELETE", body: unknown): Promise<unknown> {
  return fetch("/api/watchlist", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) =>
    json<unknown>(r, method === "POST" ? "watch" : "unwatch"),
  );
}

/** /api/discover (whole market, or a server-side name search) + the ids you watch. */
function useDiscover(query: string) {
  const [data, setData] = useState<DiscoverResponse>({});
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const loadWatched = useCallback(
    () =>
      fetch("/api/watchlist")
        .then((r) => json<{ watchlist?: Array<{ item_id: string; active: number }> }>(r, "watchlist"))
        .then((d) => setWatched(new Set((d.watchlist ?? []).filter((w) => w.active === 1).map((w) => w.item_id))))
        .catch((e: unknown) => setErr(String(e))),
    [],
  );
  const load = useCallback(() => {
    const term = query.trim();
    return fetch(`/api/discover?limit=1000${term ? `&q=${encodeURIComponent(term)}` : ""}`)
      .then((r) => json<DiscoverResponse>(r, "discover"))
      .then((d) => {
        setData(d);
        setErr(null);
      })
      .catch((e: unknown) => setErr(String(e)));
  }, [query]);
  useEffect(() => {
    const debounce = setTimeout(load, query ? 300 : 0);
    loadWatched();
    const id = setInterval(load, 60_000);
    window.addEventListener("watchlist-changed", loadWatched);
    return () => {
      clearTimeout(debounce);
      clearInterval(id);
      window.removeEventListener("watchlist-changed", loadWatched);
    };
  }, [load, loadWatched, query]);
  const mutate = (p: Promise<unknown>) =>
    p.then(() => window.dispatchEvent(new Event("watchlist-changed"))).catch((e: unknown) => setErr(String(e)));
  return { data, watched, err, setErr, mutate };
}

function ageText(fetchedAt: string | null | undefined, now: number): string | null {
  if (!fetchedAt) return null;
  const mins = Math.max(0, Math.round((now - Date.parse(fetchedAt.replace(" ", "T") + "Z")) / 60000));
  return mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function FilterCheck({ label, checked, onChange, title }: { label: string; checked: boolean; onChange: (v: boolean) => void; title?: string }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-neutral-300" title={title}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function useSort() {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "worthScore", dir: "desc" });
  const onSort = (k: string) => {
    const key = SORT_KEYS.find((s) => s === k);
    if (!key) throw new Error(`Top Flips: unknown sort column ${k}`);
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "item" ? "asc" : "desc" }));
  };
  return { sort, onSort };
}

interface Props {
  selectedId?: string;
  onSelect: (s: FlipSelection) => void;
}

/** Market-wide Top Flips: every liquid item scored, the plan opens on row click. */
export function DiscoverTable({ selectedId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [hideFalling, setHideFalling] = useState(false);
  const [topOnly, setTopOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { sort, onSort } = useSort();
  const { data, watched, err, setErr, mutate } = useDiscover(query);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const rows = useMemo(() => data.candidates ?? [], [data]);
  const shown = rows
    .filter((r) => (!hideFalling || r.risk !== "DECLINE") && (!topOnly || r.worthScore >= TOP_SCORE))
    .sort((a, b) => cmp(a, b, sort.key, sort.dir));
  const visible = showAll || query.trim() !== "" ? shown : shown.slice(0, PAGE);
  const columns = discoverColumns({
    watched,
    gate: data.cx?.rankGate ?? null,
    maxVol: shown.reduce((m, r) => Math.max(m, r.volume), 0),
    onWatch: (r) => mutate(send("POST", { itemId: r.itemId, itemName: r.item, category: r.category })),
    onUnwatch: (r) => mutate(send("DELETE", { itemId: r.itemId })),
  });
  const select = (row: Candidate) => onSelect({ row, rates: data.rates ?? null });
  const selectRoute = ({ id, name }: { id: string; name: string }) => {
    const row = rows.find((r) => r.itemId === id);
    if (row) select(row);
    else setErr(`${name} is not in the current flip list — search for it by name`);
  };

  return (
    <section className="rounded-lg border border-line bg-neutral-900/50 p-4">
      <TopFlipsHeader rows={rows} cx={data.cx ?? null} age={ageText(data.fetchedAt, now)} query={query} setQuery={setQuery}>
        <FilterCheck label="top flips only" checked={topOnly} onChange={setTopOnly} title={`score ≥ ${TOP_SCORE}`} />
        <FilterCheck label="hide falling" checked={hideFalling} onChange={setHideFalling} />
        <SeedButton onSeeded={() => window.dispatchEvent(new Event("watchlist-changed"))} onError={setErr} />
      </TopFlipsHeader>
      <CxRoutesStrip onSelect={selectRoute} />
      {err && <p role="alert" className="mb-2 text-sm text-bad">{err}</p>}
      <DataTable
        columns={columns}
        rows={visible}
        rowKey={(r) => r.itemId}
        onRowClick={select}
        selectedKey={selectedId}
        sort={{ key: sort.key, dir: sort.dir, onSort }}
        emptyState={<EmptyState icon={<SearchX className="h-5 w-5" />} sentence={query ? `No flip matches "${query}".` : "No flip candidates yet — prices appear after the next market poll."} />}
      />
      {visible.length < shown.length && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(true)}>
          show all {shown.length}
        </Button>
      )}
    </section>
  );
}

function TopFlipsHeader(props: {
  rows: Candidate[];
  cx: CxSummary | null;
  age: string | null;
  query: string;
  setQuery: (q: string) => void;
  children: ReactNode;
}) {
  const { rows, cx } = props;
  return (
    <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
      <h3 className="text-lg font-semibold text-neutral-100">Top Flips</h3>
      <MarketSourceBadge
        newestHour={cx?.newestHour ?? null}
        ranked={rows.filter((r) => r.source === "cx" && r.ranked).length}
        observed={rows.filter((r) => r.source === "cx").length}
        total={rows.length}
        persisted={cx?.persistedNextHour ?? null}
      />
      {props.age && <span className="text-xs text-neutral-400" title="poe.ninja refreshes about hourly">data {props.age}</span>}
      <input
        value={props.query}
        onChange={(e) => props.setQuery(e.target.value)}
        aria-label="search the whole market"
        placeholder="search item… (kulemak, rune, omen)"
        className="ml-auto h-8 w-64 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-neutral-500"
      />
      {props.children}
    </header>
  );
}

function SeedButton({ onSeeded, onError }: { onSeeded: () => void; onError: (e: string) => void }) {
  const [seeding, setSeeding] = useState(false);
  const seed = () => {
    setSeeding(true);
    fetch("/api/discover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ perCategory: 2 }) })
      .then((r) => json<unknown>(r, "watch top 2 per category"))
      .then(onSeeded)
      .catch((e: unknown) => onError(String(e)))
      .finally(() => setSeeding(false));
  };
  return (
    <Button size="sm" onClick={seed} disabled={seeding} title="add the two best-scoring items of every category to your watchlist">
      {seeding ? "adding…" : "watch top 2 / category"}
    </Button>
  );
}
