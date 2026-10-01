"use client";

import { TrendingUp } from "lucide-react";
import { compact } from "../../lib/format";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ItemArt } from "../ui/ItemArt";
import { InfoTip } from "../ui/Tooltip";
import { EdgeBadge, edgeTooltip, type RankGate } from "../FlipEdge";
import { edgeTone, legText, TrendCell } from "../DiscoverColumns";
import type { Candidate } from "./flipTypes";

const TOP_COUNT = 3;

/**
 * The table's default order (worthScore desc), restricted to rows that cleared the rank gate and
 * are not falling — a card is a recommendation, so an unranked fat number or a decline never gets one.
 */
export function pickTopFlips(rows: readonly Candidate[]): Candidate[] {
  return rows
    .filter((r) => r.ranked && r.risk !== "DECLINE")
    .sort((a, b) => b.worthScore - a.worthScore)
    .slice(0, TOP_COUNT);
}

/** Net edge for an observed exchange flip, the margin for an estimate (marked "~", like the table). */
function Headline({ r, gate }: { r: Candidate; gate: RankGate | null }) {
  const observed = r.source === "cx";
  const pct = observed ? r.edgePct : r.marginPct;
  return (
    <span className="flex shrink-0 flex-col items-end gap-1" title={edgeTooltip(r, gate)}>
      <span className={`text-xl font-bold tabular-nums ${edgeTone(r, pct)}`}>
        {observed ? "" : "~"}
        {pct >= 0 ? "+" : ""}
        {pct.toFixed(1)}%
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
        {observed ? "net edge" : "margin"} <EdgeBadge row={r} />
      </span>
    </span>
  );
}

function flowText(r: Candidate): string {
  const flow = r.flowObserved ? ` · ${compact(r.slowerLegDivPerHour)} Div/h traded` : "";
  const day = r.throughputDivDay >= 0.1 ? ` · ~${compact(r.throughputDivDay)} Div/day for you` : "";
  return `liquidity ${r.liquidityTier}${flow}${day}`;
}

interface CardProps {
  r: Candidate;
  gate: RankGate | null;
  selected: boolean;
  onPlan: (r: Candidate) => void;
}

function TopFlipCard({ r, gate, selected, onPlan }: CardProps) {
  return (
    <article className={`flex flex-col gap-3 rounded-lg border bg-neutral-900/60 p-3 ${selected ? "border-amber-400/60" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2" title={`${r.item} · ${r.category}`}>
          <ItemArt src={r.icon} size={8} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-neutral-100">{r.item}</span>
            <span className="block truncate text-xs text-neutral-400">{r.category}</span>
          </span>
        </span>
        <Headline r={r} gate={gate} />
      </div>
      <ul className="space-y-1 text-xs text-neutral-400">
        <li className="tabular-nums text-neutral-200">
          buy {legText(r, r.buyDisp)} → sell {legText(r, r.sellDisp)}
        </li>
        <li>{flowText(r)}</li>
        <li className="flex items-center gap-1.5">
          7d <TrendCell r={r} />
        </li>
      </ul>
      <div className="mt-auto flex justify-end">
        <Button size="sm" onClick={() => onPlan(r)} aria-pressed={selected}>
          Plan this flip
        </Button>
      </div>
    </article>
  );
}

interface Props {
  rows: readonly Candidate[];
  gate: RankGate | null;
  selectedId?: string;
  onPlan: (r: Candidate) => void;
}

/** The three best flips as cards above the full Top Flips table (hybrid: pick here, compare below). */
export function TopFlipCards({ rows, gate, selectedId, onPlan }: Props) {
  const top = pickTopFlips(rows);
  return (
    <section aria-labelledby="top-3-flips" className="space-y-2">
      <h3 id="top-3-flips" className="flex items-center gap-2 text-sm font-semibold text-neutral-200">
        Top 3 flips
        <InfoTip tip="The highest-scoring flips that cleared the rank gate and are not falling — the same order as the table below." label="About Top 3 flips" />
      </h3>
      {top.length === 0 ? (
        <EmptyState icon={<TrendingUp className="h-5 w-5" />} sentence="No flip clears the safety bar right now — the full list is below." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {top.map((r) => (
            <TopFlipCard key={r.itemId} r={r} gate={gate} selected={r.itemId === selectedId} onPlan={onPlan} />
          ))}
        </div>
      )}
    </section>
  );
}
