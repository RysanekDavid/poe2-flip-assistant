"use client";

import { Check, Plus, X } from "lucide-react";
import { compact } from "../lib/format";
import { formatDenom, formatObservedDenom, type Denom } from "../core/treasury";
import { worthTone } from "../lib/tableStyle";
import { FlameIcon, ArrowDownIcon } from "./ui/icons";
import { ItemArt } from "./ui/ItemArt";
import { Sparkline } from "./ui/Sparkline";
import type { Column } from "./ui/DataTable";
import { edgeTooltip, liquidityBar, type RankGate } from "./FlipEdge";
import type { Candidate } from "./flip/flipTypes";

/** Observed legs keep their precision; estimated ones keep the whole-orb display. */
function legText(r: Candidate, d: Denom): string {
  return r.source === "cx" ? formatObservedDenom(d) : formatDenom(d);
}

function ItemCell({ r }: { r: Candidate }) {
  return (
    <span className="inline-flex max-w-[16rem] items-center gap-2">
      <ItemArt src={r.icon} size={6} />
      <span className="truncate font-medium text-neutral-100" title={`${r.item} · ${r.category}`}>{r.item}</span>
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
    </span>
  );
}

/** Only a RANKED observed edge earns a colour; an estimate reads grey with a "~". */
function EdgeValue({ r, gate }: { r: Candidate; gate: RankGate | null }) {
  const observed = r.source === "cx";
  const tone = !observed || !r.ranked ? "text-neutral-400" : r.edgePct >= 10 ? "text-good" : r.edgePct >= 3 ? "text-warn" : r.edgePct > 0 ? "text-neutral-200" : "text-bad";
  return (
    <span className={`font-semibold tabular-nums ${tone}`} title={edgeTooltip(r, gate)}>
      {observed ? "" : "~"}
      {r.edgePct >= 0 ? "+" : ""}
      {r.edgePct.toFixed(1)}%
    </span>
  );
}

function TrendCell({ r }: { r: Candidate }) {
  const tone = r.change7d == null ? "text-neutral-500" : r.change7d >= 0 ? "text-good" : "text-bad";
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {r.spark && <Sparkline data={r.spark} />}
      <span className={`w-11 text-right tabular-nums ${tone}`}>
        {r.change7d == null ? "—" : `${r.change7d >= 0 ? "+" : ""}${r.change7d.toFixed(0)}%`}
      </span>
    </span>
  );
}

function VolumeCell({ r, maxVol }: { r: Candidate; maxVol: number }) {
  const width = maxVol > 0 ? (Math.log10(r.volume + 1) / Math.log10(maxVol + 1)) * 100 : 0;
  const flow = `${compact(r.slowerLegDivPerHour)} ${r.flowObserved ? "Div/h" : "(ninja, unverified)"}`;
  return (
    <span className="inline-flex flex-col items-end gap-0.5" title={`poe.ninja volume ${compact(r.volume)} · traded ${flow} · liquidity ${r.liquidityTier}`}>
      <span className="tabular-nums text-neutral-300">{compact(r.volume)}</span>
      <span className="h-0.5 w-12 overflow-hidden rounded bg-neutral-800">
        <span className={`block h-full rounded ${liquidityBar(r.liquidityTier)}`} style={{ width: `${width}%` }} />
      </span>
    </span>
  );
}

function WatchButton({ r, watched, onWatch, onUnwatch }: { r: Candidate; watched: boolean; onWatch: (r: Candidate) => void; onUnwatch: (r: Candidate) => void }) {
  if (watched) {
    return (
      <button
        type="button"
        onClick={() => onUnwatch(r)}
        aria-label={`stop watching ${r.item}`}
        className="group inline-flex h-7 items-center gap-1 rounded-md border border-good/40 px-2 text-xs text-good hover:border-bad/60 hover:text-bad"
      >
        <Check aria-hidden className="h-3.5 w-3.5 group-hover:hidden" />
        <X aria-hidden className="hidden h-3.5 w-3.5 group-hover:inline" />
        watching
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onWatch(r)}
      aria-label={`watch ${r.item}`}
      className="inline-flex h-7 items-center gap-1 rounded-md border border-neutral-700 px-2 text-xs text-neutral-300 hover:border-amber-400/60 hover:text-amber-300"
    >
      <Plus aria-hidden className="h-3.5 w-3.5" /> watch
    </button>
  );
}

export interface DiscoverColumnCtx {
  watched: ReadonlySet<string>;
  gate: RankGate | null;
  maxVol: number;
  onWatch: (r: Candidate) => void;
  onUnwatch: (r: Candidate) => void;
}

/** Top Flips columns. Mid, Osc and Div/day live in the flip plan, not here. */
export function discoverColumns(ctx: DiscoverColumnCtx): Column<Candidate>[] {
  return [
    { key: "item", header: "Item", sortable: true, cell: (r) => <ItemCell r={r} /> },
    {
      key: "legs",
      header: "Buy → Sell",
      tip: "the two legs of the flip: buy in one currency, sell in another. Exchange rows show the last hour's volume-weighted fills; ~ rows are a volume-based estimate",
      align: "right",
      cell: (r) => <span className="tabular-nums text-neutral-200">{legText(r, r.buyDisp)} → {legText(r, r.sellDisp)}</span>,
    },
    {
      key: "edgePct",
      header: "Edge",
      tip: "net edge after gold fees, median of the last 6 hours on GGG's exchange. Grey ~ = no exchange market, heuristic target. Hover a value for fees, band and time to sell",
      align: "right",
      sortable: true,
      cell: (r) => <EdgeValue r={r} gate={ctx.gate} />,
    },
    { key: "change7d", header: "7d", tip: "7-day price trend (poe.ninja)", align: "right", sortable: true, cell: (r) => <TrendCell r={r} /> },
    { key: "volume", header: "Vol", tip: "poe.ninja volume; the bar is liquidity (green safe · amber risky · grey thin)", align: "right", sortable: true, cell: (r) => <VolumeCell r={r} maxVol={ctx.maxVol} /> },
    {
      key: "worthScore",
      header: "Score",
      tip: "0–100: 45% edge + 40% liquidity + 15% oscillation, scaled by hours the edge held (of 6). Estimates score half; pump/decline ×0.75",
      align: "right",
      sortable: true,
      cell: (r) => <span className={`text-base font-bold tabular-nums ${worthTone(r.worthScore)}`}>{r.worthScore}</span>,
    },
    {
      key: "watch",
      header: "Watch",
      align: "center",
      cell: (r) => <WatchButton r={r} watched={ctx.watched.has(r.itemId)} onWatch={ctx.onWatch} onUnwatch={ctx.onUnwatch} />,
    },
  ];
}

/** The one note about estimated rows and markers, behind the page header's ⓘ. */
export function TopFlipsLegend() {
  return (
    <span className="block space-y-1">
      <span className="block">
        Edges come from GGG&apos;s hourly exchange digest — verify in-game before trading, it is not a live order book.
      </span>
      <span className="block">
        Rows marked <b>~</b> have no exchange market: their legs and edge are a heuristic estimate, not executable prices,
        and they score half.
      </span>
      <span className="block">Flame = spiking (risky to hold) · down arrow = falling &gt;20% in 7d. Mid, Osc and Div/day are in the flip plan.</span>
    </span>
  );
}
