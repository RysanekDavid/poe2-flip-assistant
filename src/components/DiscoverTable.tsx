"use client";

import { useEffect, useState, useCallback } from "react";
import { compact } from "../lib/format";
import { formatDenom, type Denom } from "../core/treasury";
import { categoryColor, worthTone, SCROLL_BOX, THEAD_STICKY, ROW_BASE, CELL } from "../lib/tableStyle";
import { FlameIcon, ArrowDownIcon, PlusIcon } from "./ui/icons";

interface Candidate {
  itemId: string;
  item: string;
  category: string;
  icon: string | null;
  buyExalt: number;
  sellChaos: number;
  buyDisp: Denom;
  sellDisp: Denom;
  marginPct: number;
  midDivine: number;
  volume: number;
  change7d: number | null;
  change24h: number | null;
  profitChaos: number;
  profitDiv: number;
  throughputDivDay: number;
  oscScore: number;
  worthScore: number;
  risk: "PUMP" | "DECLINE" | null;
  stable: boolean;
}

type SortKey =
  | "item"
  | "category"
  | "midDivine"
  | "buyExalt"
  | "sellChaos"
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
  const [now, setNow] = useState(() => Date.now());
  const [err, setErr] = useState<string | null>(null);

  const loadWatched = useCallback(
    () =>
      fetch("/api/watchlist")
        .then((r) => r.json())
        .then((d: { watchlist?: Array<{ item_id: string; active: number }> }) =>
          setWatched(new Set((d.watchlist ?? []).filter((w) => w.active === 1).map((w) => w.item_id))),
        )
        .catch(() => {}),
    [],
  );

  const load = useCallback(() => {
    const term = query.trim();
    const url = `/api/discover?limit=1000${term ? `&q=${encodeURIComponent(term)}` : ""}`;
    return fetch(url)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.candidates ?? []);
        setFetchedAt(d.fetchedAt ?? null);
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
      .then(loadWatched)
      .then(notifyChange);

  const unwatch = (itemId: string) =>
    fetch("/api/watchlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    })
      .then(loadWatched)
      .then(notifyChange);

  const seedTop = () => {
    setSeeding(true);
    fetch("/api/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perCategory: 2 }),
    })
      .then((r) => r.json())
      .then(() => loadWatched())
      .then(notifyChange)
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
              <Th k="change24h" label="24h" right />
              <Th k="change7d" label="7d" right />
              <Th k="volume" label="Vol" right />
              <th
                onClick={() => toggleSort("throughputDivDay")}
                title="upper-bound throughput: profit/unit (Div) × daily volume — money this spread moves if you captured ALL flow. Ranks money-makers over thin high-margin items."
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
                title="0–100 overall: 45% margin + 40% liquidity + 15% oscillation, ×0.75 if pump/decline. Higher = better flip."
                className={`${CELL} cursor-pointer select-none text-right font-medium hover:text-neutral-200`}
              >
                Score{arrow("worthScore")}
              </th>
              <th className={`${CELL} text-center`}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.itemId}
                onClick={() => onSelect?.({ id: r.itemId, name: r.item })}
                className={`${ROW_BASE} cursor-pointer ${selectedId === r.itemId ? "bg-sky-950/40" : ""}`}
                title="click → flip detail + price chart"
              >
                <td className={`${CELL} font-medium`}>
                  <span className="inline-flex items-center gap-1.5 align-middle">
                    {r.icon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.icon} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />
                    )}
                    {r.item}
                    {r.risk === "PUMP" && (
                      <span className="text-warn" title="spiked >100% 7d — wide spreads, risky to hold">
                        <FlameIcon />
                      </span>
                    )}
                    {r.risk === "DECLINE" && (
                      <span className="text-bad" title="down >20% 7d">
                        <ArrowDownIcon />
                      </span>
                    )}
                    {r.stable && <span className="text-xs text-good/70">stable</span>}
                  </span>
                </td>
                <td className={CELL}>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${categoryColor(r.category)}`}>{r.category}</span>
                </td>
                <td className={`${CELL} text-right tabular-nums text-neutral-400`}>{r.midDivine.toFixed(3)}</td>
                <td className={`${CELL} whitespace-nowrap text-right tabular-nums`}>{formatDenom(r.buyDisp)}</td>
                <td className={`${CELL} whitespace-nowrap text-right tabular-nums`}>{formatDenom(r.sellDisp)}</td>
                <td
                  className={`${CELL} text-right font-semibold tabular-nums ${
                    r.change24h == null ? "text-neutral-600" : r.change24h >= 0 ? "text-good" : "text-bad"
                  }`}
                >
                  {r.change24h == null ? "—" : `${r.change24h >= 0 ? "+" : ""}${r.change24h.toFixed(0)}%`}
                </td>
                <td
                  className={`${CELL} text-right tabular-nums ${
                    r.change7d == null ? "text-neutral-600" : r.change7d >= 0 ? "text-good" : "text-bad"
                  }`}
                >
                  {r.change7d == null ? "—" : `${r.change7d >= 0 ? "+" : ""}${r.change7d.toFixed(0)}%`}
                </td>
                <td className={`${CELL} text-right tabular-nums text-neutral-400`}>{compact(r.volume)}</td>
                <td className={`${CELL} text-right tabular-nums ${r.throughputDivDay >= 1 ? "font-semibold text-emerald-300" : "text-neutral-500"}`}>
                  {r.throughputDivDay >= 0.1 ? compact(r.throughputDivDay) : "—"}
                </td>
                <td className={`${CELL} text-right tabular-nums`}>
                  <span className={maxOsc > 0 && r.oscScore >= maxOsc * 0.6 ? "font-semibold text-sky-300" : "text-neutral-400"}>
                    {r.oscScore >= 10 ? "〰 " : ""}
                    {r.oscScore.toFixed(0)}
                  </span>
                </td>
                <td className={`${CELL} text-right text-base font-bold tabular-nums ${worthTone(r.worthScore)}`}>{r.worthScore}</td>
                <td className={`${CELL} text-center`}>
                  {watched.has(r.itemId) ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        unwatch(r.itemId);
                      }}
                      className="group inline-flex items-center gap-1 rounded-md border border-good/40 px-2 py-1 text-xs text-good transition-colors hover:border-bad/60 hover:text-bad"
                      title="tracked — click to unwatch"
                    >
                      <span className="group-hover:hidden">✓ watching</span>
                      <span className="hidden group-hover:inline">✕ unwatch</span>
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        addWatch(r);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-good/60 hover:text-good"
                    >
                      <PlusIcon className="h-3 w-3" />
                      watch
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && !err && (
              <tr>
                <td colSpan={12} className="py-3 text-center text-neutral-500">
                  no candidates — run a poll first
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-neutral-600">
        Click a row for its flip plan + price chart, a column to sort. <span className="text-good">Score</span> 0–100 =
        overall flip quality (45% margin + 40% liquidity + 15% oscillation, −25% if risky) ·{" "}
        <span className="text-sky-300">Osc</span> = repeatability · <span className="text-warn">flame</span> = spiking,
        risky to hold.
      </p>
    </section>
  );
}
