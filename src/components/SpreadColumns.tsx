"use client";

import { compact, fmtSmart } from "../lib/format";
import { formatDenom, formatObservedDenom, type Denom } from "../core/treasury";
import { marginTint, worthTone } from "../lib/tableStyle";
import { FlameIcon, ArrowDownIcon } from "./ui/icons";
import { ItemArt } from "./ui/ItemArt";
import type { Column } from "./ui/DataTable";
import { EdgeBadge, edgeTooltip, liquidityBar, type RankGate } from "./FlipEdge";
import { TrendCell } from "./DiscoverColumns";
import type { Candidate } from "./flip/flipTypes";

/** A watched row: the shared flip row plus whether its saved Ange prices expired. */
export interface FlipRow extends Candidate {
  manualStale?: boolean;
}

/** Every watchlist column but Item, which always shows. */
export const OPTIONAL_COLUMNS = ["midDivine", "buyExalt", "sellChaos", "marginPct", "change7d", "volume", "throughputDivDay", "oscScore", "worthScore", "mode"] as const;
export type OptionalColumn = (typeof OPTIONAL_COLUMNS)[number];

/** The six that decide a flip at a glance: what you pay, what you get, the margin, the trend and the money per day. */
export const DEFAULT_COLUMNS: readonly OptionalColumn[] = ["buyExalt", "sellChaos", "marginPct", "change7d", "throughputDivDay"];

/** Observed exchange legs keep their precision; your own and estimated prices keep whole orbs. */
function legText(r: FlipRow, d: Denom): string {
  return r.mode === "RECO" && r.source === "cx" ? formatObservedDenom(d) : formatDenom(d);
}

/** Only a ranked margin earns a tint: never an estimate (a volume lookup) nor an unranked edge. */
function marginTone(r: FlipRow): string {
  if (!r.ranked) return "text-neutral-500";
  return r.mode === "RECO" && r.source === "estimated" ? "text-neutral-500" : marginTint(r.marginPct);
}

function ItemCell({ r }: { r: FlipRow }) {
  return (
    <span className="inline-flex max-w-[16rem] items-center gap-2" title={`${r.item} · ${r.category}`}>
      <ItemArt src={r.icon} size={6} />
      <span className="truncate font-medium text-neutral-100">{r.item}</span>
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
  );
}

function VolumeCell({ r, maxVol }: { r: FlipRow; maxVol: number }) {
  const width = maxVol > 0 ? (Math.log10(r.volume + 1) / Math.log10(maxVol + 1)) * 100 : 0;
  return (
    <span className="inline-flex flex-col items-end gap-0.5" title={`liquidity ${r.liquidityTier}`}>
      <span className="tabular-nums text-neutral-400">{compact(r.volume)}</span>
      <span className="h-0.5 w-12 overflow-hidden rounded bg-neutral-800">
        <span className={`block h-full rounded ${liquidityBar(r.liquidityTier)}`} style={{ width: `${width}%` }} />
      </span>
    </span>
  );
}

function ModeCell({ r, gate }: { r: FlipRow; gate: RankGate | null }) {
  if (r.mode === "REAL") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-good">
        <span className="h-1.5 w-1.5 rounded-full bg-good" />
        real
      </span>
    );
  }
  if (r.manualStale) {
    return (
      <span className="text-xs text-warn" title="your real Ange prices expired — showing estimate">
        est ⏳
      </span>
    );
  }
  return (
    <span title={edgeTooltip(r, gate)}>
      <EdgeBadge row={r} />
    </span>
  );
}

export interface SpreadColumnCtx {
  gate: RankGate | null;
  maxVol: number;
  maxOsc: number;
}

const num = (text: string, tone = "text-neutral-200") => <span className={`tabular-nums ${tone}`}>{text}</span>;

/** All watchlist columns, keyed by the field they sort on (Mode has no sort). */
export function spreadColumns(ctx: SpreadColumnCtx): Record<OptionalColumn | "item", Column<FlipRow>> {
  return {
    item: { key: "item", header: "Item", sortable: true, cell: (r) => <ItemCell r={r} /> },
    midDivine: { key: "midDivine", header: "Mid (Div)", tip: "poe.ninja price of one item, in Divine", align: "right", sortable: true, cell: (r) => num(fmtSmart(r.midDivine), "text-neutral-400") },
    buyExalt: { key: "buyExalt", header: "Buy", tip: "what you pay per item: your Ange price when you set one, the market leg otherwise", align: "right", sortable: true, cell: (r) => num(legText(r, r.buyDisp)) },
    sellChaos: { key: "sellChaos", header: "Sell", tip: "what you get per item: your Ange price when you set one, the market leg otherwise", align: "right", sortable: true, cell: (r) => num(legText(r, r.sellDisp)) },
    marginPct: {
      key: "marginPct",
      header: "Margin",
      tip: "(sell − buy) ÷ buy with your Ange prices; otherwise the market's net edge. Grey = an estimate or not ranked",
      align: "right",
      sortable: true,
      cell: (r) => <span className={`rounded px-1.5 py-0.5 font-semibold tabular-nums ${marginTone(r)}`}>{r.marginPct.toFixed(1)}%</span>,
    },
    change7d: { key: "change7d", header: "7d", tip: "7-day price trend (poe.ninja)", align: "right", sortable: true, cell: (r) => <TrendCell r={r} /> },
    volume: { key: "volume", header: "Vol", tip: "poe.ninja trade volume; the bar is liquidity (green safe · amber risky · grey thin)", align: "right", sortable: true, cell: (r) => <VolumeCell r={r} maxVol={ctx.maxVol} /> },
    throughputDivDay: {
      key: "throughputDivDay",
      header: "Div/day",
      tip: "Divine per day this flip could make you: profit per item × the share of the slower leg's flow you can expect to fill",
      align: "right",
      sortable: true,
      cell: (r) => (r.throughputDivDay >= 0.1 ? num(compact(r.throughputDivDay), r.throughputDivDay >= 1 ? "font-semibold text-good" : "text-neutral-400") : num("—", "text-neutral-500")),
    },
    oscScore: {
      key: "oscScore",
      header: "Osc",
      tip: "Oscillation: how much the price swung over 7 days beyond its drift — high means the flip repeats well",
      align: "right",
      sortable: true,
      cell: (r) => num(r.oscScore.toFixed(0), ctx.maxOsc > 0 && r.oscScore >= ctx.maxOsc * 0.6 ? "font-semibold text-neutral-100" : "text-neutral-400"),
    },
    worthScore: {
      key: "worthScore",
      header: "Score",
      tip: "0–100: 45% edge + 40% liquidity + 15% oscillation, scaled by hours the edge held (of 6). Estimates score half; pump/decline ×0.75",
      align: "right",
      sortable: true,
      cell: (r) => <span className={`font-bold tabular-nums ${worthTone(r.worthScore)}`}>{r.worthScore}</span>,
    },
    mode: {
      key: "mode",
      header: "Mode",
      tip: "real = your own Ange prices · est ⏳ = your saved prices expired, showing the estimate · otherwise hours of 6 the market edge held (est. = estimate)",
      align: "center",
      cell: (r) => <ModeCell r={r} gate={ctx.gate} />,
    },
  };
}
