"use client";

import type { LeagueStartItem, LeagueStartSignal } from "../../lib/leagueStartContract";
import { fmtSmart } from "../../lib/format";
import type { Column } from "../ui/DataTable";
import { ItemArt } from "../ui/ItemArt";
import { Tooltip } from "../ui/Tooltip";

const SIGNAL_LABEL: Record<LeagueStartSignal, string> = {
  "sell-now": "Sell now",
  drift: "Drifting",
  hold: "Hold",
  rising: "Rising",
  unknown: "Unknown",
};

// Red/green carry direction only; amber stays reserved for the one primary action.
const SIGNAL_CLASS: Record<LeagueStartSignal, string> = {
  "sell-now": "border-bad/50 bg-red-950/40 text-red-200",
  drift: "border-line bg-neutral-900 text-neutral-300",
  hold: "border-line bg-neutral-900 text-neutral-300",
  rising: "border-good/50 bg-emerald-950/40 text-emerald-200",
  unknown: "border-line bg-neutral-900 text-neutral-400",
};

const SIGNAL_TIP: Record<LeagueStartSignal, string> = {
  "sell-now": "Lost 30%+ over the next 7 days at this point of past league starts.",
  drift: "Moved 15–30% over the next 7 days in past leagues — a trend, not a strong call.",
  hold: "Stayed within ±15% over the next 7 days in past leagues.",
  rising: "Gained 30%+ over the next 7 days in past leagues.",
  unknown: "Fewer than two past leagues recorded this item on this day.",
};

/** ×0.62 → "−38%". */
export function ratioPct(ratio: number | null): string {
  if (ratio == null) return "—";
  const pct = Math.round((ratio - 1) * 100);
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
}

const divText = (div: number | null): string => (div == null ? "—" : `${fmtSmart(div)} div`);

function ratioTone(ratio: number | null): string {
  if (ratio == null) return "text-neutral-500";
  if (ratio < 0.85) return "text-bad";
  if (ratio > 1.15) return "text-good";
  return "text-neutral-300";
}

function rowTip(row: LeagueStartItem): string {
  const leagues = `${row.confidence} past league${row.confidence === 1 ? "" : "s"}`;
  const expected = row.expected7Div == null ? "" : ` · at that pace ≈ ${divText(row.expected7Div)} in 7 days`;
  return `${SIGNAL_TIP[row.signal]} Median of ${leagues}: 7d ${ratioPct(row.ratio7)}, 14d ${ratioPct(row.ratio14)}${expected}.`;
}

export function SignalChip({ row }: { row: LeagueStartItem }) {
  return (
    <Tooltip tip={rowTip(row)} align="end">
      <span className={`inline-flex rounded border px-1.5 py-0.5 text-xs font-medium ${SIGNAL_CLASS[row.signal]}`}>
        {SIGNAL_LABEL[row.signal]}
      </span>
    </Tooltip>
  );
}

export const LEAGUE_START_COLUMNS: Column<LeagueStartItem>[] = [
  {
    key: "item",
    header: "Item",
    cell: (r) => (
      <span className="inline-flex items-center gap-2">
        <ItemArt src={r.icon} size={6} />
        <span className="truncate text-neutral-100">{r.name}</span>
      </span>
    ),
  },
  { key: "now", header: "Now", align: "right", tip: "Latest hourly exchange mid in this league.", cell: (r) => <span className="tabular-nums">{divText(r.nowDiv)}</span> },
  {
    key: "r7",
    header: "Next 7d",
    align: "right",
    tip: "Median price change over the following 7 days, from the same league day of past league starts.",
    cell: (r) => <span className={`tabular-nums ${ratioTone(r.ratio7)}`}>{ratioPct(r.ratio7)}</span>,
  },
  {
    key: "r14",
    header: "Next 14d",
    align: "right",
    tip: "Same, 14 days out (capped at the last recorded day of each past league).",
    cell: (r) => <span className={`tabular-nums ${ratioTone(r.ratio14)}`}>{ratioPct(r.ratio14)}</span>,
  },
  { key: "signal", header: "Signal", align: "right", cell: (r) => <SignalChip row={r} /> },
];
