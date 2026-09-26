"use client";

import { compact } from "../../lib/format";
import { formatDenom, type Denom } from "../../core/treasury";
import { categoryColor, worthTone, SCROLL_BOX, THEAD_STICKY, ROW_BASE, CELL } from "../../lib/tableStyle";
import { Sparkline } from "../ui/Sparkline";

export interface DemandRow {
  id: number;
  name: string;
  type: string;
  category: string;
  icon: string | null;
  market: Denom;
  marketDivine: number;
  quantity: number;
  listedAvg: number;
  sellThrough: number;
  momentumPct: number;
  spark: number[];
  heat: number;
  trust: "ok" | "thin" | "noisy";
  divergePct: number;
  tradeUrl: string;
}

export type SortKey = "name" | "marketDivine" | "quantity" | "listedAvg" | "sellThrough" | "momentumPct" | "heat";
export type SortDir = "asc" | "desc";

// Column tooltips carry the honesty caveats: none of these numbers is a sale price or a sale count.
const COLUMNS: ReadonlyArray<{ k: SortKey; label: string; right?: boolean; tip?: string }> = [
  { k: "name", label: "Item" },
  {
    k: "marketDivine",
    label: "cheapest ask",
    right: true,
    tip: "poe2scout CurrentPrice = the cheapest listed ask (outlier-guarded against the recent log) — what sellers ask, not what buyers paid",
  },
  { k: "quantity", label: "Listed", right: true, tip: "listings right now" },
  { k: "listedAvg", label: "listed (avg)", right: true, tip: "average listing count over the price log — supply, not trade flow" },
  {
    k: "sellThrough",
    label: "sell-through",
    right: true,
    tip: "average drop in listing count between scrapes (rises clipped to 0) — a proxy: a delisting or re-index is not a sale",
  },
  { k: "momentumPct", label: "Trend", right: true },
  { k: "heat", label: "Heat", right: true, tip: "sell-through proxy blended with rising price" },
];

function ItemCell({ r }: { r: DemandRow }) {
  return (
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
  );
}

function AskCell({ r }: { r: DemandRow }) {
  return (
    <td className={`${CELL} whitespace-nowrap text-right tabular-nums text-neutral-300`}>
      {formatDenom(r.market)}
      {r.trust === "noisy" && (
        <span className="ml-1 text-warn" title={`headline ask was a ~${r.divergePct.toFixed(0)}% outlier vs the recent log — showing recent median, verify on trade`}>
          ⚠
        </span>
      )}
      {r.trust === "thin" && (
        <span className="ml-1 text-neutral-600" title="few listings/data points — low confidence">
          ~
        </span>
      )}
    </td>
  );
}

function DemandRowView({ r }: { r: DemandRow }) {
  return (
    <tr className={ROW_BASE}>
      <ItemCell r={r} />
      <AskCell r={r} />
      <td className={`${CELL} text-right tabular-nums text-neutral-400`}>{compact(r.quantity)}</td>
      <td className={`${CELL} text-right tabular-nums text-neutral-400`}>{compact(r.listedAvg)}</td>
      <td className={`${CELL} text-right tabular-nums text-neutral-400`}>{r.sellThrough.toFixed(1)}</td>
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
        <a href={r.tradeUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600">
          open →
        </a>
      </td>
    </tr>
  );
}

/** Sortable demand table; the parent owns filtering and sort state. */
export function DemandTable({ rows, sortKey, sortDir, onSort }: {
  rows: DemandRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const arrow = (k: SortKey) => (k === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  return (
    <div className={SCROLL_BOX}>
      <table className="w-full text-sm">
        <thead className={THEAD_STICKY}>
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.k}
                onClick={() => onSort(c.k)}
                title={c.tip}
                className={`${CELL} cursor-pointer select-none font-medium hover:text-neutral-200 ${c.right ? "text-right" : ""}`}
              >
                {c.label}
                <span className="text-good">{arrow(c.k)}</span>
              </th>
            ))}
            <th className={`${CELL} text-center`}>Trade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <DemandRowView key={r.id} r={r} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={COLUMNS.length + 1} className="py-3 text-center text-neutral-500">
                nothing matches
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
