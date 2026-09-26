"use client";

import { compact, fmtSmart } from "../lib/format";

/** The observed-market fields a flip row carries (see core/flipModel FlipRow). */
export interface FlipEdgeInfo {
  source: "cx" | "estimated";
  edgePct: number;
  edgeKind: "cross" | "band" | null;
  edgeLatestPct: number | null;
  edgeMedian24Pct: number | null;
  band: { lowDiv: number; highDiv: number } | null;
  persistence6: number | null;
  persistence24: number | null;
  liquidityTier: "safe" | "risky" | "thin";
  slowerLegDivPerHour: number;
  timeToSellHint: { sizeUnits: number; hours: number } | null;
  feeGold: number | null;
  feeDiv: number | null;
  feeComplete: boolean;
}

const pct = (n: number | null): string => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);

function hours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  return `${(h / 24).toFixed(0)}d`;
}

function feeLine(r: FlipEdgeInfo): string {
  const gold = r.feeGold == null ? "?" : `${compact(r.feeGold)} gold`;
  const div = r.feeDiv == null ? "" : ` ≈ ${fmtSmart(r.feeDiv)} Div`;
  return `fee/unit ${gold}${div}${r.feeComplete ? "" : " (this item's own fee unknown — only the currency leg counted)"}`;
}

/** Everything behind the number, for the hover tooltip — prose stays out of the table. */
export function edgeTooltip(r: FlipEdgeInfo): string {
  const liquidity = `liquidity ${r.liquidityTier} · slower leg ${compact(r.slowerLegDivPerHour)} Div/h`;
  const sell = r.timeToSellHint
    ? `~${hours(r.timeToSellHint.hours)} to clear ${r.timeToSellHint.sizeUnits} units at your share of flow`
    : "time to clear: unknown";
  if (r.source === "estimated") {
    return ["ESTIMATED — no exchange market for this item; volume-based target, not an observed edge", liquidity, sell].join("\n");
  }
  const kind = r.edgeKind === "cross" ? "cross-market (buy in one currency, sell in another)" : "in-market band";
  const band = r.band ? `traded band ${fmtSmart(r.band.lowDiv)}–${fmtSmart(r.band.highDiv)} Div` : "no band published";
  return [
    `GGG exchange · ${kind}`,
    `net edge 6h median ${pct(r.edgePct)} · last hour ${pct(r.edgeLatestPct)} · 24h median ${pct(r.edgeMedian24Pct)}`,
    `held ${r.persistence6 ?? 0}/6h · ${r.persistence24 ?? 0}/24h`,
    band,
    feeLine(r),
    liquidity,
    sell,
  ].join("\n");
}

function persistTone(p: number): string {
  if (p >= 4) return "border-good/40 text-good";
  if (p >= 2) return "border-amber-700/50 text-amber-300";
  return "border-neutral-700 text-neutral-500";
}

/** Small chip after an edge: how many of the last 6h held it, or "est." for heuristic rows. */
export function EdgeBadge({ row }: { row: FlipEdgeInfo }) {
  if (row.source === "estimated") {
    return <span className="rounded border border-neutral-700 px-1 text-[10px] text-neutral-500">est.</span>;
  }
  const p = row.persistence6 ?? 0;
  return <span className={`rounded border px-1 text-[10px] tabular-nums ${persistTone(p)}`}>{p}/6h</span>;
}

function edgeTone(n: number): string {
  return n >= 10 ? "text-good" : n >= 3 ? "text-warn" : n > 0 ? "text-neutral-300" : "text-bad";
}

/** Table cell content: the edge %, its source chip, and the full story on hover. */
export function EdgeCell({ row }: { row: FlipEdgeInfo }) {
  return (
    <span className="inline-flex items-center justify-end gap-1.5" title={edgeTooltip(row)}>
      <span className={`font-semibold tabular-nums ${row.source === "cx" ? edgeTone(row.edgePct) : "text-neutral-500"}`}>
        {pct(row.edgePct)}
      </span>
      <EdgeBadge row={row} />
    </span>
  );
}

/**
 * Table-level provenance: observed exchange data when any row has it, the heuristic label when
 * none does. `newestHour` is the digest's end-of-hour boundary (unix seconds).
 */
export function MarketSourceBadge({ newestHour, observed, total }: { newestHour: number | null; observed: number; total: number }) {
  if (newestHour == null || observed === 0) {
    return (
      <span
        className="rounded border border-amber-900/50 bg-amber-950/20 px-1.5 py-0.5 text-[10px] text-amber-300"
        title="No exchange history stored yet — every row is a volume-based estimate, not an observed edge."
      >
        estimated · not executable
      </span>
    );
  }
  const asOf = new Date(newestHour * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <span
      className="rounded border border-emerald-900/50 bg-emerald-950/20 px-1.5 py-0.5 text-[10px] text-emerald-300"
      title={`Edges from GGG's hourly exchange digest, last closed hour ${asOf}. Hour's traded extremes — not a live bid/ask. ${total - observed} row(s) without an exchange market are marked "est.".`}
    >
      GGG exchange · {observed}/{total}
    </span>
  );
}

/** Volume-bar colour by liquidity tier, so thin legs stand out without another column. */
export function liquidityBar(tier: FlipEdgeInfo["liquidityTier"]): string {
  return tier === "safe" ? "bg-emerald-500/60" : tier === "risky" ? "bg-amber-500/60" : "bg-neutral-500/60";
}
