"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { compact } from "../lib/format";
import { formatDenom, type Denom } from "../core/treasury";
import { categoryColor, worthTone, SCROLL_BOX, THEAD_STICKY, ROW_BASE, CELL } from "../lib/tableStyle";
import { Sparkline } from "./ui/Sparkline";

interface DemandRow {
  id: number;
  name: string;
  type: string;
  category: string;
  icon: string | null;
  market: Denom;
  marketDivine: number;
  quantity: number;
  turnover: number;
  momentumPct: number;
  spark: number[];
  heat: number;
  trust: "ok" | "thin" | "noisy";
  divergePct: number;
  tradeUrl: string;
}

type SortKey = "name" | "marketDivine" | "quantity" | "turnover" | "momentumPct" | "heat";
type SortDir = "asc" | "desc";
const NUMERIC: Set<SortKey> = new Set(["marketDivine", "quantity", "turnover", "momentumPct", "heat"]);

function cmp(a: DemandRow, b: DemandRow, key: SortKey, dir: SortDir): number {
  const d = NUMERIC.has(key)
    ? (a[key] as number) - (b[key] as number)
    : String(a[key]).localeCompare(String(b[key]));
  return dir === "asc" ? d : -d;
}

export function DemandBoard() {
  const [rows, setRows] = useState<DemandRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [trustedOnly, setTrustedOnly] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("heat");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [budget, setBudget] = useState(""); // Divine on hand — filter to affordable

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/demand")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setErr(d.error);
          setRows([]);
        } else {
          setRows(d.rows ?? []);
          setErr(null);
        }
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cats = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);
  const query = q.trim().toLowerCase();
  const bud = Number(budget) || 0;
  const shown = rows
    .filter((r) => {
      if (trustedOnly && r.trust === "thin") return false;
      if (cat && r.category !== cat) return false;
      if (bud > 0 && r.marketDivine > bud) return false; // only what your budget affords
      if (query && !r.name.toLowerCase().includes(query) && !r.type.toLowerCase().includes(query)) return false;
      return true;
    })
    .sort((a, b) => cmp(a, b, sortKey, sortDir));

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" ? "asc" : "desc");
    }
  };
  const arrow = (k: SortKey) => (k === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");
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
      <header className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Market — unique flip targets</h2>
        <span className="text-xs text-neutral-500">poe2scout · price + flow + momentum · {shown.length} shown</span>
      </header>
      <p className="mb-3 text-xs text-neutral-600">
        Every tradeable unique, ranked. <b>Heat</b> = turnover blended with rising price. <b>Market</b> = current
        poe2scout price (outlier-guarded) — <span className="text-warn">⚠</span> = headline was an outlier, showing
        recent median (verify on trade),{" "}
        <span className="text-neutral-500">~</span> = thin data. Set <b>budget</b> to see only what you can afford. Click a
        column to sort; <span className="text-good">open →</span> opens a live buyout search.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter by name or base…"
          className="min-w-48 flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm focus:border-neutral-600 focus:outline-none"
        />
        <label className="flex items-center gap-1 text-xs text-neutral-400">
          budget
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            inputMode="decimal"
            placeholder="Div"
            className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-right tabular-nums"
            title="how many Divine you have — shows only items you can afford"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-neutral-400">
          <input type="checkbox" checked={trustedOnly} onChange={(e) => setTrustedOnly(e.target.checked)} />
          hide thin
        </label>
        <button onClick={load} className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500">
          refresh
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Pill active={cat === ""} onClick={() => setCat("")} label="all" />
        {cats.map((c) => (
          <Pill key={c} active={cat === c} onClick={() => setCat(c)} label={c} dot={categoryColor(c).split(" ")[0]} />
        ))}
      </div>

      {err && <p className="text-sm text-bad">error: {err}</p>}
      {loading && <p className="text-sm text-neutral-500">loading poe2scout…</p>}

      {!loading && !err && (
        <div className={SCROLL_BOX}>
          <table className="w-full text-sm">
            <thead className={THEAD_STICKY}>
              <tr>
                <Th k="name" label="Item" />
                <Th k="marketDivine" label="Market" right />
                <Th k="quantity" label="Listed" right />
                <Th k="turnover" label="Flow" right />
                <Th k="momentumPct" label="Trend" right />
                <Th k="heat" label="Heat" right />
                <th className={`${CELL} text-center`}>Trade</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={ROW_BASE}>
                  <td className={`${CELL} font-medium`}>
                    <span className="inline-flex items-center gap-2 align-middle">
                      {r.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.icon} alt="" className="h-6 w-6 shrink-0 object-contain" loading="lazy" />
                      ) : (
                        <span className={`inline-block h-2 w-2 rounded-full ${categoryColor(r.category).split(" ")[0]}`} />
                      )}
                      <span>
                        {r.name}
                        {r.type && <span className="ml-1 text-xs text-neutral-500">{r.type}</span>}
                      </span>
                    </span>
                  </td>
                  <td className={`${CELL} whitespace-nowrap text-right tabular-nums text-neutral-300`}>
                    {formatDenom(r.market)}
                    {r.trust === "noisy" && (
                      <span className="ml-1 text-warn" title={`headline price was a ~${r.divergePct.toFixed(0)}% outlier vs the recent log — showing recent median, verify on trade`}>
                        ⚠
                      </span>
                    )}
                    {r.trust === "thin" && (
                      <span className="ml-1 text-neutral-600" title="few listings/data points — low confidence">
                        ~
                      </span>
                    )}
                  </td>
                  <td className={`${CELL} text-right tabular-nums text-neutral-400`}>{compact(r.quantity)}</td>
                  <td className={`${CELL} text-right tabular-nums text-neutral-400`}>{compact(r.turnover)}</td>
                  <td className={`${CELL} whitespace-nowrap text-right`}>
                    <span className="inline-flex items-center justify-end gap-1.5">
                      {r.spark.length >= 2 && <Sparkline data={r.spark} />}
                      <span className={`tabular-nums ${r.momentumPct >= 0 ? "text-good" : "text-bad"}`}>
                        {r.momentumPct >= 0 ? "+" : ""}
                        {r.momentumPct.toFixed(0)}%
                      </span>
                    </span>
                  </td>
                  <td className={`${CELL} text-right font-bold tabular-nums ${worthTone(r.heat)}`}>{r.heat}</td>
                  <td className={`${CELL} text-center`}>
                    <a
                      href={r.tradeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600"
                    >
                      open →
                    </a>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-3 text-center text-neutral-500">
                    nothing matches
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
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
