"use client";

import { useEffect, useState, useCallback } from "react";
import { SCROLL_BOX, THEAD_STICKY, CELL } from "../lib/tableStyle";
import { MarketSourceBadge } from "./FlipEdge";
import { DiscoverRow, type Candidate } from "./DiscoverRow";
import { CxRoutesStrip } from "./CxRoutesStrip";

interface CxSummary {
  newestHour: number;
  coverage: { cxItems: number; mapped: number; unnamed: number; unmatched: number; ambiguous: number };
}

type SortKey =
  | "item"
  | "category"
  | "midDivine"
  | "buyExalt"
  | "sellChaos"
  | "edgePct"
  | "change24h"
  | "change7d"
  | "volume"
  | "throughputDivDay"
  | "oscScore"
  | "worthScore";
type SortDir = "asc" | "desc";
const TOP_SCORE = 50; // worthScore at/above this = a "top flip" (margin+liquidity+oscillation, risk-adjusted)
const NUMERIC: Set<SortKey> = new Set([
  "midDivine",
  "buyExalt",
  "sellChaos",
  "edgePct",
  "change24h",
  "change7d",
  "volume",
  "throughputDivDay",
  "oscScore",
  "worthScore",
]);

function cmp(a: Candidate, b: Candidate, key: SortKey, dir: SortDir): number {
  let d: number;
  if (NUMERIC.has(key)) d = ((a[key] as number | null) ?? -Infinity) - ((b[key] as number | null) ?? -Infinity);
  else d = String(a[key]).localeCompare(String(b[key]));
  return dir === "asc" ? d : -d;
}

async function responseJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) throw new Error(`${label} failed (${response.status})`);
  return (await response.json()) as T;
}

export function DiscoverTable({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect?: (item: { id: string; name: string }) => void;
}) {
  const [rows, setRows] = useState<Candidate[]>([]);
  const [watched, setWatched] = useState<Set<string>>(new Set());
  const [hideFalling, setHideFalling] = useState(false);
  const [topOnly, setTopOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("worthScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [seeding, setSeeding] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [cx, setCx] = useState<CxSummary | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [err, setErr] = useState<string | null>(null);

  const loadWatched = useCallback(
    () =>
      fetch("/api/watchlist")
        .then((response) => responseJson<{ watchlist?: Array<{ item_id: string; active: number }> }>(response, "watchlist"))
        .then((d: { watchlist?: Array<{ item_id: string; active: number }> }) =>
          setWatched(new Set((d.watchlist ?? []).filter((w) => w.active === 1).map((w) => w.item_id))),
        )
        .catch((error: unknown) => setErr(`watchlist failed: ${String(error)}`)),
    [],
  );

  const load = useCallback(() => {
    const term = query.trim();
    const url = `/api/discover?limit=1000${term ? `&q=${encodeURIComponent(term)}` : ""}`;
    return fetch(url)
      .then((response) =>
        responseJson<{ candidates?: Candidate[]; fetchedAt?: string | null; cx?: CxSummary | null }>(response, "discover"),
      )
      .then((d) => {
        setRows(d.candidates ?? []);
        setFetchedAt(d.fetchedAt ?? null);
        setCx(d.cx ?? null);
        setErr(null);
      })
      .catch((e) => setErr(String(e)));
  }, [query]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const dataAge = (() => {
    if (!fetchedAt) return null;
    const t = new Date(fetchedAt.replace(" ", "T") + "Z").getTime();
    const mins = Math.max(0, Math.round((now - t) / 60000));
    return mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  })();

  useEffect(() => {
    const debounce = setTimeout(load, query ? 300 : 0); // debounce keystrokes while searching
    loadWatched();
    const id = setInterval(load, 60_000);
    const onChange = () => loadWatched();
    window.addEventListener("watchlist-changed", onChange);
    return () => {
      clearTimeout(debounce);
      clearInterval(id);
      window.removeEventListener("watchlist-changed", onChange);
    };
  }, [load, loadWatched, query]);

  const notifyChange = () => window.dispatchEvent(new Event("watchlist-changed"));

  const addWatch = (c: Candidate) =>
    fetch("/api/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: c.itemId, itemName: c.item, category: c.category }),
    })
      .then((response) => responseJson<unknown>(response, "add watch"))
      .then(loadWatched)
      .then(notifyChange)
      .catch((error: unknown) => setErr(String(error)));

  const unwatch = (itemId: string) =>
    fetch("/api/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    })
      .then((response) => responseJson<unknown>(response, "remove watch"))
      .then(loadWatched)
      .then(notifyChange)
      .catch((error: unknown) => setErr(String(error)));

  const seedTop = () => {
    setSeeding(true);
    fetch("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perCategory: 2 }),
    })
      .then((response) => responseJson<unknown>(response, "seed top flips"))
      .then(() => loadWatched())
      .then(notifyChange)
      .catch((error: unknown) => setErr(String(error)))
      .finally(() => setSeeding(false));
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(NUMERIC.has(key) ? "desc" : "asc");
    }
  };

  // name search is server-side now (whole market); falling + top-flip filters are client-side
  const shown = rows
    .filter((r) => !hideFalling || r.risk !== "DECLINE")
    .filter((r) => !topOnly || r.worthScore >= TOP_SCORE)
    .sort((a, b) => cmp(a, b, sortKey, sortDir));
  const maxOsc = shown.reduce((m, r) => Math.max(m, r.oscScore), 0);
  const maxVol = shown.reduce((m, r) => Math.max(m, r.volume), 0);
  const topCount = rows.filter((r) => r.worthScore >= TOP_SCORE).length;

  const arrow = (key: SortKey) => (key === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`${CELL} cursor-pointer select-none font-medium hover:text-neutral-200 ${right ? "text-right" : ""}`}
    >
      {label}
      <span className="text-good">{arrow(k)}</span>
    </th>
  );

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold">Top Flips — whole market</h2>
          <MarketSourceBadge
            newestHour={cx?.newestHour ?? null}
            observed={rows.filter((r) => r.source === "cx").length}
            total={rows.length}
          />
          {dataAge && (
            <span className="text-xs text-neutral-500" title="poe.ninja refreshes ~hourly, so prices move slowly">
              · data {dataAge}
            </span>
          )}
          <span className="text-xs text-neutral-600">· {shown.length} shown · {topCount} top</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={seedTop}
            disabled={seeding}
            className="rounded bg-good/80 px-2.5 py-1 text-xs font-medium text-neutral-950 hover:bg-good disabled:opacity-50"
            title="auto-add top 2 flip-score items per category to watchlist"
          >
            {seeding ? "seeding…" : "+ seed top 2/category"}
          </button>
          <label className="flex items-center gap-1.5 text-xs text-neutral-400" title={`top flip = score ≥ ${TOP_SCORE}`}>
            <input type="checkbox" checked={topOnly} onChange={(e) => setTopOnly(e.target.checked)} />
            top flips only
          </label>
          <label className="flex items-center gap-1.5 text-xs text-neutral-400">
            <input type="checkbox" checked={hideFalling} onChange={(e) => setHideFalling(e.target.checked)} />
            hide falling (↓)
          </label>
        </div>
      </header>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="search item… (e.g. kulemak, rune, reliquary)"
        className="mb-3 w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:border-neutral-600 focus:outline-none"
      />
      <CxRoutesStrip onSelect={onSelect} />
      {err && <p className="text-bad text-sm">error: {err}</p>}

      <div className={SCROLL_BOX}>
        <table className="w-full text-sm">
          <thead className={THEAD_STICKY}>
            <tr>
              <Th k="item" label="Item" />
              <Th k="category" label="Cat" />
              <Th k="midDivine" label="Mid (Div)" right />
              <Th k="buyExalt" label="Buy" right />
              <Th k="sellChaos" label="Sell" right />
              <th
                onClick={() => toggleSort("edgePct")}
                title="net edge after priced gold fees, median of the last 6 hours on GGG's exchange · chip = hours of 6 it held · est. = no exchange market, heuristic target"
                className={`${CELL} cursor-pointer select-none text-right font-medium hover:text-neutral-200`}
              >
                Edge{arrow("edgePct")}
              </th>
              <Th k="change24h" label="24h" right />
              <Th k="change7d" label="7d" right />
              <Th k="volume" label="Vol" right />
              <th
                onClick={() => toggleSort("throughputDivDay")}
                title="profit/unit (Div, net of priced fees) × units you can fill per day — assumes you take 10% of the slower leg's flow · ~ = estimated profit or ninja flow of unverified unit"
                className={`${CELL} cursor-pointer select-none text-right font-medium hover:text-neutral-200`}
              >
                Div/day{arrow("throughputDivDay")}
              </th>
              <th
                onClick={() => toggleSort("oscScore")}
                title="how much the 7d price wiggles beyond its net drift — high = flips repeatedly without trending away"
                className={`${CELL} cursor-pointer select-none text-right font-medium hover:text-neutral-200`}
              >
                Osc{arrow("oscScore")}
              </th>
              <th
                onClick={() => toggleSort("worthScore")}
                title="0–100 overall: 45% edge + 40% liquidity + 15% oscillation, scaled by hours the edge held (of 6) · est. rows: no edge term, ×0.5 · ×0.75 if pump/decline"
                className={`${CELL} cursor-pointer select-none text-right font-medium hover:text-neutral-200`}
              >
                Score{arrow("worthScore")}
              </th>
              <th className={`${CELL} text-center`}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <DiscoverRow
                key={r.itemId}
                r={r}
                selected={selectedId === r.itemId}
                watched={watched.has(r.itemId)}
                maxOsc={maxOsc}
                maxVol={maxVol}
                onSelect={() => onSelect?.({ id: r.itemId, name: r.item })}
                onWatch={() => addWatch(r)}
                onUnwatch={() => unwatch(r.itemId)}
              />
            ))}
            {shown.length === 0 && !err && (
              <tr>
                <td colSpan={13} className="py-3 text-center text-neutral-500">
                  no candidates — run a poll first
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-neutral-600">
        Click a row for its flip plan + price chart · hover <span className="text-good">Edge</span> for band, fees and
        time to sell · <span className="text-warn">flame</span> = spiking, risky to hold.
      </p>
    </section>
  );
}
