"use client";

import { compact } from "../../lib/format";
import type { DemandRow } from "../../lib/demandContract";
import type { SortDir, SortKey } from "../../lib/demandView";
import { categoryColor, worthTone, SCROLL_BOX, THEAD_STICKY, ROW_BASE, CELL } from "../../lib/tableStyle";
import { PriceChip } from "../ui/PriceChip";
import { Sparkline } from "../ui/Sparkline";
import { StaleBadge } from "../ui/StaleBadge";

/** Same threshold the Farm board uses for scout unique prices: older than two days reads amber. */
const PRICE_WARN_AFTER_MIN = 48 * 60;

const NO_LEAGUE_HISTORY = "poe2scout has no price history this league";
const NO_ITEM_HISTORY = "poe2scout has too little price history for this item";

// Column tooltips carry the honesty caveats: none of these numbers is a sale price or a sale count.
const COLUMNS: ReadonlyArray<{ k: SortKey; label: string; right?: boolean; tip?: string }> = [
  { k: "name", label: "Item" },
  {
    k: "marketDivine",
    label: "cheapest ask",
    right: true,
    tip: "poe2scout CurrentPrice = the cheapest listed ask (outlier-guarded against the recent log) — what sellers ask, not what buyers paid. The chip is how long ago poe2scout set it.",
  },
  { k: "quantity", label: "Listed", right: true, tip: "listings right now" },
  { k: "listedAvg", label: "listed (avg)", right: true, tip: "average listing count over the price log — supply, not trade flow" },
  {
    k: "sellThrough",
    label: "sell-through",
    right: true,
    tip: "average share of listings gone between scrapes (rises clipped to 0) — a proxy: a delisting or re-index is not a sale",
  },
  { k: "momentumPct", label: "Trend", right: true },
  { k: "heat", label: "Heat", right: true, tip: "sell-through proxy blended with rising price" },
];

/** "—" for a figure scout gives no data for; the reason rides on the title, as PriceChip does. */
function Unknown({ tip }: { tip: string }) {
  return (
    <span className="text-neutral-500" title={tip}>
      <span aria-hidden>—</span>
      <span className="sr-only">{tip}</span>
    </span>
  );
}

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

function priceAgeMin(priceAt: string | null): number | null {
  if (priceAt == null) return null;
  return (Date.now() - Date.parse(priceAt)) / 60_000;
}

function AskCell({ r, exPerDiv }: { r: DemandRow; exPerDiv: number }) {
  const ageMin = priceAgeMin(r.priceAt);
  return (
    <td className={`${CELL} whitespace-nowrap text-right`}>
      <span className="inline-flex items-center justify-end gap-1.5">
        <PriceChip div={r.marketDivine} exPerDiv={exPerDiv} source="scout" ageMin={ageMin ?? undefined} />
        {ageMin != null ? (
          <StaleBadge ageMin={ageMin} warnAfterMin={PRICE_WARN_AFTER_MIN} />
        ) : (
          <Unknown tip="price age unknown — poe2scout's history has no point for this item" />
        )}
        {r.trust === "noisy" && (
          <span className="text-warn" title={`headline ask was a ~${r.divergePct.toFixed(0)}% outlier vs the recent log — showing recent median, verify on trade`}>
            ⚠
          </span>
        )}
        {r.trust === "thin" && (
          <span className="text-neutral-500" title="few listings/data points — low confidence">
            ~
          </span>
        )}
      </span>
    </td>
  );
}

function UnknownCell({ tip }: { tip: string }) {
  return (
    <td className={`${CELL} text-right`}>
      <Unknown tip={tip} />
    </td>
  );
}

function Num({ value, fmt, unknownTip }: { value: number | null; fmt: (n: number) => string; unknownTip: string }) {
  if (value == null) return <UnknownCell tip={unknownTip} />;
  return <td className={`${CELL} text-right tabular-nums text-neutral-400`}>{fmt(value)}</td>;
}

const pct = (fraction: number): string => `${(fraction * 100).toFixed(0)}%`;

function TrendCell({ r, unknownTip }: { r: DemandRow; unknownTip: string }) {
  if (r.momentumPct == null) return <UnknownCell tip={unknownTip} />;
  const m = r.momentumPct;
  return (
    <td className={`${CELL} whitespace-nowrap text-right`}>
      <span className="inline-flex items-center justify-end gap-1.5">
        {r.spark.length >= 2 && <Sparkline data={r.spark} />}
        <span className={`tabular-nums ${m >= 0 ? "text-good" : "text-bad"}`}>
          {m >= 0 ? "+" : ""}
          {m.toFixed(0)}%
        </span>
      </span>
    </td>
  );
}

function DemandRowView({ r, exPerDiv, unknownTip }: { r: DemandRow; exPerDiv: number; unknownTip: string }) {
  return (
    <tr className={ROW_BASE}>
      <ItemCell r={r} />
      <AskCell r={r} exPerDiv={exPerDiv} />
      <td className={`${CELL} text-right tabular-nums text-neutral-400`}>{compact(r.quantity)}</td>
      <Num value={r.listedAvg} fmt={compact} unknownTip={unknownTip} />
      <Num value={r.sellThrough} fmt={pct} unknownTip={unknownTip} />
      <TrendCell r={r} unknownTip={unknownTip} />
      {r.heat == null ? (
        <UnknownCell tip={unknownTip} />
      ) : (
        <td className={`${CELL} text-right font-bold tabular-nums ${worthTone(r.heat)}`}>{r.heat}</td>
      )}
      <td className={`${CELL} text-center`}>
        <a href={r.tradeUrl} target="_blank" rel="noopener noreferrer" className="inline-block rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600">
          open →
        </a>
      </td>
    </tr>
  );
}

/** Sortable demand table; the parent owns filtering, sort state and the empty state. */
export function DemandTable({ rows, exPerDiv, historyAvailable, sortKey, sortDir, onSort }: {
  rows: DemandRow[];
  exPerDiv: number;
  /** False = no row has a log, so every unknown figure says the league has none. */
  historyAvailable: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const arrow = (k: SortKey) => (k === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");
  const unknownTip = historyAvailable ? NO_ITEM_HISTORY : NO_LEAGUE_HISTORY;
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
            <DemandRowView key={r.id} r={r} exPerDiv={exPerDiv} unknownTip={unknownTip} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
