"use client";

import { compact, fmtSmart } from "../lib/format";
import { formatDenom, formatObservedDenom, type Denom } from "../core/treasury";
import { categoryColor, worthTone, ROW_BASE, CELL } from "../lib/tableStyle";
import { FlameIcon, ArrowDownIcon, PlusIcon } from "./ui/icons";
import { Sparkline } from "./ui/Sparkline";
import { EdgeCell, liquidityBar, type FlipEdgeInfo } from "./FlipEdge";

/** One Top Flips row as /api/discover returns it (core/flipModel FlipRow, the fields we show). */
export interface Candidate extends FlipEdgeInfo {
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
  spark: number[] | null;
  profitChaos: number;
  profitDiv: number;
  throughputDivDay: number;
  oscScore: number;
  worthScore: number;
  risk: "PUMP" | "DECLINE" | null;
  stable: boolean;
}

function signed(n: number | null): string {
  return n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(0)}%`;
}

/** Observed legs keep their precision; estimated ones keep the whole-orb display. */
function legText(r: Candidate, d: Denom): string {
  return r.source === "cx" ? formatObservedDenom(d) : formatDenom(d);
}

function changeTone(n: number | null): string {
  return n == null ? "text-neutral-600" : n >= 0 ? "text-good" : "text-bad";
}

function ItemName({ r }: { r: Candidate }) {
  return (
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
  );
}

function VolumeBar({ r, maxVol }: { r: Candidate; maxVol: number }) {
  const width = maxVol > 0 ? (Math.log10(r.volume + 1) / Math.log10(maxVol + 1)) * 100 : 0;
  return (
    <span
      className="inline-flex flex-col items-end gap-0.5"
      title={`${compact(r.volume)} Div/h (poe.ninja) · slower leg ${compact(r.slowerLegDivPerHour)} Div/h · ${r.liquidityTier}`}
    >
      <span className="tabular-nums text-neutral-400">{compact(r.volume)}</span>
      <span className="h-0.5 w-12 overflow-hidden rounded bg-neutral-800">
        <span className={`block h-full rounded ${liquidityBar(r.liquidityTier)}`} style={{ width: `${width}%` }} />
      </span>
    </span>
  );
}

function WatchButton({ watched, onWatch, onUnwatch }: { watched: boolean; onWatch: () => void; onUnwatch: () => void }) {
  if (watched) {
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          onUnwatch();
        }}
        className="group inline-flex items-center gap-1 rounded-md border border-good/40 px-2 py-1 text-xs text-good transition-colors hover:border-bad/60 hover:text-bad"
        title="tracked — click to unwatch"
      >
        <span className="group-hover:hidden">✓ watching</span>
        <span className="hidden group-hover:inline">✕ unwatch</span>
      </button>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onWatch();
      }}
      className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-good/60 hover:text-good"
    >
      <PlusIcon className="h-3 w-3" />
      watch
    </button>
  );
}

interface RowProps {
  r: Candidate;
  selected: boolean;
  watched: boolean;
  maxOsc: number;
  maxVol: number;
  onSelect: () => void;
  onWatch: () => void;
  onUnwatch: () => void;
}

export function DiscoverRow({ r, selected, watched, maxOsc, maxVol, onSelect, onWatch, onUnwatch }: RowProps) {
  const oscTone = maxOsc > 0 && r.oscScore >= maxOsc * 0.6 ? "font-semibold text-sky-300" : "text-neutral-400";
  // An estimated row's profit is the heuristic's, so its Div/day is shown but never highlighted.
  const perDayTone = r.source === "cx" && r.throughputDivDay >= 1 ? "font-semibold text-emerald-300" : "text-neutral-500";
  return (
    <tr onClick={onSelect} className={`${ROW_BASE} cursor-pointer ${selected ? "bg-sky-950/40" : ""}`} title="click → flip detail + price chart">
      <td className={`${CELL} font-medium`}>
        <ItemName r={r} />
      </td>
      <td className={CELL}>
        <span className={`rounded px-1.5 py-0.5 text-xs ${categoryColor(r.category)}`}>{r.category}</span>
      </td>
      <td className={`${CELL} text-right tabular-nums text-neutral-400`}>{fmtSmart(r.midDivine)}</td>
      <td className={`${CELL} whitespace-nowrap text-right tabular-nums`}>{legText(r, r.buyDisp)}</td>
      <td className={`${CELL} whitespace-nowrap text-right tabular-nums`}>{legText(r, r.sellDisp)}</td>
      <td className={`${CELL} whitespace-nowrap text-right`}>
        <EdgeCell row={r} />
      </td>
      <td className={`${CELL} text-right font-semibold tabular-nums ${changeTone(r.change24h)}`}>{signed(r.change24h)}</td>
      <td className={`${CELL} whitespace-nowrap text-right`}>
        <span className="inline-flex items-center justify-end gap-1.5">
          {r.spark && <Sparkline data={r.spark} />}
          <span className={`tabular-nums ${changeTone(r.change7d)}`}>{signed(r.change7d)}</span>
        </span>
      </td>
      <td className={`${CELL} text-right`}>
        <VolumeBar r={r} maxVol={maxVol} />
      </td>
      <td className={`${CELL} text-right tabular-nums ${perDayTone}`}>
        {r.throughputDivDay >= 0.1 ? `${r.source === "cx" ? "" : "~"}${compact(r.throughputDivDay)}` : "—"}
      </td>
      <td className={`${CELL} text-right tabular-nums`}>
        <span className={oscTone}>
          {r.oscScore >= 10 ? "〰 " : ""}
          {r.oscScore.toFixed(0)}
        </span>
      </td>
      <td className={`${CELL} text-right text-base font-bold tabular-nums ${worthTone(r.worthScore)}`}>{r.worthScore}</td>
      <td className={`${CELL} text-center`}>
        <WatchButton watched={watched} onWatch={onWatch} onUnwatch={onUnwatch} />
      </td>
    </tr>
  );
}
