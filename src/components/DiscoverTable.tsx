"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { SearchX } from "lucide-react";
import { DiscoverResponseSchema, type DiscoverResponse } from "../lib/discoverContract";
import { WatchlistResponseSchema, inLeague } from "../lib/watchlistContract";
import { DataTable, type SortDir } from "./ui/DataTable";
import { Button } from "./ui/Button";
import { EmptyState } from "./ui/EmptyState";
import { edgeSortTier, MarketSourceBadge } from "./FlipEdge";
import { discoverColumns } from "./DiscoverColumns";
import { CxRoutesStrip } from "./CxRoutesStrip";
import { TopFlipCards } from "./flip/TopFlipCards";
import type { Candidate, FlipSelection } from "./flip/flipTypes";

type CxSummary = NonNullable<DiscoverResponse["cx"]>;
const NO_DATA: DiscoverResponse = { rates: null, candidates: [] };

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

async function json(r: Response, label: string): Promise<unknown> {
  if (!r.ok) throw new Error(`${label} failed (${r.status})`);
  return r.json();
}

function send(method: "POST" | "DELETE", body: unknown): Promise<unknown> {
  return fetch("/api/watchlist", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) =>
    json(r, method === "POST" ? "watch" : "unwatch"),
  );
}

/** /api/discover (whole market, or a server-side name search) + the ids you watch in this league. */
function useDiscover(query: string) {
  const [data, setData] = useState<DiscoverResponse>(NO_DATA);
  // the empty NO_DATA placeholder must not read as "no flip qualifies" before the first answer
  const [loaded, setLoaded] = useState(false);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const loadWatched = useCallback(
    () =>
      fetch("/api/watchlist")
        .then(async (r) => WatchlistResponseSchema.parse(await json(r, "watchlist")))
        // a row watched in another league is not watched HERE: its prices and alerts belong there
        .then((d) => setWatched(new Set(d.watchlist.filter((w) => w.active === 1 && inLeague(w, d.league)).map((w) => w.item_id))))
        .catch((e: unknown) => setErr(String(e))),
    [],
  );
  const load = useCallback(() => {
    const term = query.trim();
    return fetch(`/api/discover?limit=1000${term ? `&q=${encodeURIComponent(term)}` : ""}`)
      .then(async (r) => DiscoverResponseSchema.parse(await json(r, "discover")))
      .then((d) => {
        setData(d);
        setLoaded(true);
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
  return { data, loaded, watched, err, mutate };
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

function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Market-wide Top Flips: the best three as cards, then every liquid item scored; the plan opens on click. */
export function DiscoverTable({ selectedId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [hideFalling, setHideFalling] = useState(false);
  const [topOnly, setTopOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const now = useNow();
  const { sort, onSort } = useSort();
  const { data, loaded, watched, err, mutate } = useDiscover(query);
  // a route chip whose item is not in the list is information, not an error
  const [routeNote, setRouteNote] = useState<string | null>(null);
  const rows = useMemo(() => data.candidates, [data]);
  const shown = rows
    .filter((r) => (!hideFalling || r.risk !== "DECLINE") && (!topOnly || r.worthScore >= TOP_SCORE))
    .sort((a, b) => cmp(a, b, sort.key, sort.dir));
  const visible = showAll || query.trim() !== "" ? shown : shown.slice(0, PAGE);
  const gate = data.cx?.rankGate ?? null;
  const columns = discoverColumns({
    watched,
    gate,
    maxVol: shown.reduce((m, r) => Math.max(m, r.volume), 0),
    onWatch: (r) => mutate(send("POST", { itemId: r.itemId, itemName: r.item, category: r.category })),
    onUnwatch: (r) => mutate(send("DELETE", { itemId: r.itemId })),
  });
  const select = (row: Candidate) => onSelect({ row, rates: data.rates });
  const selectRoute = ({ id, name }: { id: string; name: string }) => {
    const row = rows.find((r) => r.itemId === id);
    setRouteNote(row ? null : `${name} is not in the current flip list (too thin or over the price cap) — search for it by name.`);
    if (row) select(row);
  };

  return (
    <>
      {/* a search narrows the data to its matches, so the market's top three show only unfiltered */}
      {loaded && query.trim() === "" && <TopFlipCards rows={rows} gate={gate} selectedId={selectedId} onPlan={select} />}
      <section className="rounded-lg border border-line bg-neutral-900/50 p-4">
        <TopFlipsHeader rows={rows} cx={data.cx ?? null} age={ageText(data.fetchedAt, now)} query={query} setQuery={setQuery}>
          <FilterCheck label="Top flips only" checked={topOnly} onChange={setTopOnly} title={`score ≥ ${TOP_SCORE}`} />
          <FilterCheck label="Hide falling" checked={hideFalling} onChange={setHideFalling} />
        </TopFlipsHeader>
        <CxRoutesStrip onSelect={selectRoute} />
        {routeNote && <p role="status" className="mb-2 text-sm text-neutral-400">{routeNote}</p>}
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
            Show all {shown.length}
          </Button>
        )}
      </section>
    </>
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
