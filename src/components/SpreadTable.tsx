"use client";

import { useEffect, useState, useCallback } from "react";
import { compact, fmtSmart } from "../lib/format";
import { formatDenom, formatObservedDenom, type Denom } from "../core/treasury";
import { categoryColor, marginTint, worthTone, SCROLL_BOX, THEAD_STICKY, ROW_BASE, CELL } from "../lib/tableStyle";
import { FlameIcon, ArrowDownIcon } from "./ui/icons";
import { EmptySection } from "./ui/EmptySection";
import { Sparkline } from "./ui/Sparkline";
import { EdgeBadge, edgeTooltip, type FlipEdgeInfo, type RankGate } from "./FlipEdge";

interface FlipRow extends FlipEdgeInfo {
  itemId: string;
  item: string;
  category: string;
  icon: string | null;
  midDivine: number;
  volume: number;
  change7d: number | null;
  spark: number[] | null;
  buyExalt: number;
  sellChaos: number;
  buyDisp: Denom;
  sellDisp: Denom;
  marginPct: number;
  mode: "REAL" | "RECO";
  profitChaos: number;
  throughputDivDay: number;
  oscScore: number;
  worthScore: number;
  manualStale?: boolean;
  risk: "PUMP" | "DECLINE" | null;
  stable: boolean;
}

type SortKey = "item" | "midDivine" | "buyExalt" | "sellChaos" | "marginPct" | "change7d" | "volume" | "throughputDivDay" | "oscScore" | "worthScore";
type SortDir = "asc" | "desc";
const NUMERIC: Set<SortKey> = new Set(["midDivine", "buyExalt", "sellChaos", "marginPct", "change7d", "volume", "throughputDivDay", "oscScore", "worthScore"]);

/** Observed exchange legs keep their precision; your own and estimated prices keep whole orbs. */
function legText(r: FlipRow, d: Denom): string {
  return r.mode === "RECO" && r.source === "cx" ? formatObservedDenom(d) : formatDenom(d);
}

/** Only a ranked margin earns a tint: never an estimate (a volume lookup) nor an unranked edge. */
function marginTone(r: FlipRow): string {
  if (!r.ranked) return "text-neutral-500";
  return r.mode === "RECO" && r.source === "estimated" ? "text-neutral-500" : marginTint(r.marginPct);
}

function cmp(a: FlipRow, b: FlipRow, key: SortKey, dir: SortDir): number {
  let d: number;
  if (NUMERIC.has(key)) d = ((a[key] as number | null) ?? -Infinity) - ((b[key] as number | null) ?? -Infinity);
  else d = String(a[key]).localeCompare(String(b[key]));
  return dir === "asc" ? d : -d;
}

export function SpreadTable({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect?: (s: { id: string; name: string }) => void;
}) {
  const [rows, setRows] = useState<FlipRow[]>([]);
  const [gate, setGate] = useState<RankGate | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("worthScore");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filter, setFilter] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/spreads")
        .then((r) => r.json())
        .then((d) => {
          setRows(d.spreads ?? []);
          setGate(d.rankGate ?? null);
          setErr(null);
        })
        .catch((e) => setErr(String(e))),
    [],
  );

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    const onChange = () => load();
    window.addEventListener("watchlist-changed", onChange);
    return () => {
      clearInterval(id);
      window.removeEventListener("watchlist-changed", onChange);
    };
  }, [load]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir(NUMERIC.has(key) ? "desc" : "asc");
    }
  };

  const q = filter.trim().toLowerCase();
  const shown = rows
    .filter((r) => q === "" || r.item.toLowerCase().includes(q) || r.category.toLowerCase().includes(q))
    .sort((a, b) => cmp(a, b, sortKey, sortDir));
  const maxOsc = shown.reduce((m, r) => Math.max(m, r.oscScore), 0);
  const maxVol = shown.reduce((m, r) => Math.max(m, r.volume), 0);
  const arrow = (k: SortKey) => (k === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  const Th = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th onClick={() => toggleSort(k)} className={`${CELL} cursor-pointer select-none font-medium hover:text-neutral-200 ${right ? "text-right" : ""}`}>
      {label}
      <span className="text-good">{arrow(k)}</span>
    </th>
  );

  if (rows.length === 0 && !err) {
    return (
      <EmptySection
        title="Watchlist — tracked spreads"
        hint="empty — add items from Top Flips (+ watch / seed), then enter your real Ange prices for true spreads"
      />
    );
  }

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Watchlist — tracked spreads</h2>
        <span className="text-xs text-neutral-500">click a row → flip plan</span>
      </header>
      <div className="relative mb-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter tracked items… (name or category)"
          className="w-full rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm focus:border-neutral-600 focus:outline-none"
        />
        {filter && (
          <button
            onClick={() => setFilter("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-500 hover:text-neutral-200"
          >
            clear
          </button>
        )}
      </div>
      {err && <p className="text-bad text-sm">error: {err}</p>}

      <div className={SCROLL_BOX}>
        <table className="w-full text-sm">
          <thead className={THEAD_STICKY}>
            <tr>
              <Th k="item" label="Item" />
              <Th k="midDivine" label="Mid (Div)" right />
              <Th k="buyExalt" label="Buy" right />
              <Th k="sellChaos" label="Sell" right />
              <Th k="marginPct" label="Margin" right />
              <Th k="change7d" label="7d" right />
              <Th k="volume" label="Vol" right />
              <Th k="throughputDivDay" label="Div/day" right />
              <Th k="oscScore" label="Osc" right />
              <Th k="worthScore" label="Score" right />
              <th className={`${CELL} text-center`}>Mode</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.itemId}
                onClick={() => onSelect?.({ id: r.itemId, name: r.item })}
                className={`cursor-pointer ${ROW_BASE} ${selectedId === r.itemId ? "!bg-sky-500/10 ring-1 ring-inset ring-sky-500/40" : ""}`}
              >
                <td className={`${CELL} font-medium`}>
                  <span className="inline-flex items-center gap-1.5 align-middle">
                    {r.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.icon} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" title={r.category} />
                    ) : (
                      <span className={`inline-block h-2 w-2 rounded-full ${categoryColor(r.category).split(" ")[0]}`} title={r.category} />
                    )}
                    {r.item}
                    {r.risk === "PUMP" && (
                      <span className="text-warn" title="spiking">
                        <FlameIcon />
                      </span>
                    )}
                    {r.risk === "DECLINE" && (
                      <span className="text-bad" title="falling">
                        <ArrowDownIcon />
                      </span>
                    )}
                  </span>
                </td>
                <td className={`${CELL} text-right tabular-nums text-neutral-400`}>{fmtSmart(r.midDivine)}</td>
                <td className={`${CELL} whitespace-nowrap text-right tabular-nums`}>{legText(r, r.buyDisp)}</td>
                <td className={`${CELL} whitespace-nowrap text-right tabular-nums`}>{legText(r, r.sellDisp)}</td>
                <td className={`${CELL} text-right`}>
                  <span className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${marginTone(r)}`}>{r.marginPct.toFixed(1)}%</span>
                </td>
                <td className={`${CELL} whitespace-nowrap text-right`}>
                  <span className="inline-flex items-center justify-end gap-1.5">
                    {r.spark && <Sparkline data={r.spark} />}
                    <span className={`tabular-nums ${r.change7d == null ? "text-neutral-600" : r.change7d >= 0 ? "text-good" : "text-bad"}`}>
                      {r.change7d == null ? "—" : `${r.change7d >= 0 ? "+" : ""}${r.change7d.toFixed(0)}%`}
                    </span>
                  </span>
                </td>
                <td className={`${CELL} text-right`}>
                  <span className="inline-flex flex-col items-end gap-0.5">
                    <span className="tabular-nums text-neutral-400">{compact(r.volume)}</span>
                    <span className="h-0.5 w-12 overflow-hidden rounded bg-neutral-800">
                      <span
                        className="block h-full rounded bg-sky-500/60"
                        style={{ width: `${maxVol > 0 ? (Math.log10(r.volume + 1) / Math.log10(maxVol + 1)) * 100 : 0}%` }}
                      />
                    </span>
                  </span>
                </td>
                <td className={`${CELL} text-right tabular-nums ${r.throughputDivDay >= 1 ? "font-semibold text-emerald-300" : "text-neutral-500"}`}>
                  {r.throughputDivDay >= 0.1 ? compact(r.throughputDivDay) : "—"}
                </td>
                <td className={`${CELL} text-right tabular-nums`}>
                  <span className={maxOsc > 0 && r.oscScore >= maxOsc * 0.6 ? "font-semibold text-sky-300" : "text-neutral-400"}>
                    {r.oscScore.toFixed(0)}
                  </span>
                </td>
                <td className={`${CELL} text-right font-bold tabular-nums ${worthTone(r.worthScore)}`}>{r.worthScore}</td>
                <td className={`${CELL} text-center`}>
                  {r.mode === "REAL" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-good">
                      <span className="h-1.5 w-1.5 rounded-full bg-good" />
                      real
                    </span>
                  ) : r.manualStale ? (
                    <span className="text-xs text-warn" title="your real Ange prices expired — showing estimate">
                      est ⏳
                    </span>
                  ) : (
                    <span title={edgeTooltip(r, gate)}>
                      <EdgeBadge row={r} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && !err && (
              <tr>
                <td colSpan={11} className="py-3 text-center text-neutral-500">
                  {q !== "" && rows.length > 0
                    ? `no tracked item matches “${filter.trim()}”`
                    : "empty — add items from “Top Flips” (+ watch / seed), then enter your real Ange prices"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
