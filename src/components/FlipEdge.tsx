"use client";

import { compact, fmtSmart } from "../lib/format";

type EdgeIssue = "thin" | "coarse" | "single-market" | "fee-unknown" | "implausible";

/** The observed-market fields a flip row carries (see core/flipModel FlipRow). */
export interface FlipEdgeInfo {
  source: "cx" | "estimated";
  edgePct: number;
  ranked: boolean;
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
  legsHour: number | null;
  cxIssue: EdgeIssue | null;
  cxRawNetPct: number | null;
  flowObserved: boolean;
}

/** Why an item that trades on the exchange still has no computable edge. */
const ISSUE_TEXT: Record<EdgeIssue, string> = {
  thin: "a leg trades too little to quote",
  coarse: "prices sit on the exchange's N:1 ratio grid — the gap is quantisation, not an edge",
  "single-market": "only one currency market — no cross edge to measure",
  "fee-unknown": "item's own gold fee unknown and it is worth under an Exalt",
  implausible: "edge above the plausibility cap — treated as a data artefact",
};

const pct = (n: number | null): string => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);

function hours(h: number): string {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  return `${(h / 24).toFixed(0)}d`;
}

const clock = (unixHour: number): string =>
  new Date(unixHour * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function feeLine(r: FlipEdgeInfo): string {
  const gold = r.feeGold == null ? "?" : `${compact(r.feeGold)} gold`;
  const div = r.feeDiv == null ? "" : ` ≈ ${fmtSmart(r.feeDiv)} Div`;
  return `fee/unit ${gold}${div}${r.feeComplete ? "" : " (this item's own fee unknown — only the currency leg counted)"}`;
}

function flowLines(r: FlipEdgeInfo): string[] {
  const unit = r.flowObserved ? "Div/h" : "Div/? (poe.ninja volume, time unit unverified)";
  const liquidity = `liquidity ${r.liquidityTier} · ${compact(r.slowerLegDivPerHour)} ${unit}`;
  const sell = r.timeToSellHint
    ? `~${hours(r.timeToSellHint.hours)} to clear ${r.timeToSellHint.sizeUnits} units at your share of flow${r.flowObserved ? "" : " (unit-uncertain)"}`
    : "time to clear: unknown";
  return [liquidity, sell];
}

function estimatedTooltip(r: FlipEdgeInfo): string {
  const why =
    r.cxIssue == null
      ? "no exchange market for this item"
      : `exchange edge not computable: ${ISSUE_TEXT[r.cxIssue]}${r.cxRawNetPct == null ? "" : ` (would read ${pct(r.cxRawNetPct)})`}`;
  return [`ESTIMATED — ${why}`, "legs + margin are a volume-based target, not an observed edge", ...flowLines(r)].join("\n");
}

/** Everything behind the number, for the hover tooltip — prose stays out of the table. */
export function edgeTooltip(r: FlipEdgeInfo): string {
  if (r.source === "estimated") return estimatedTooltip(r);
  const kind = r.edgeKind === "cross" ? "cross-market (buy in one currency, sell in another)" : "in-market band";
  const band = r.band ? `ratio extremes ${fmtSmart(r.band.lowDiv)}–${fmtSmart(r.band.highDiv)} Div (not fills)` : "no ratio extremes published";
  return [
    `GGG exchange · ${kind}`,
    `net edge 6h median ${pct(r.edgePct)} · last hour ${pct(r.edgeLatestPct)} · 24h median ${pct(r.edgeMedian24Pct)}`,
    `buy/sell shown = last valid hour${r.legsHour == null ? "" : ` (to ${clock(r.legsHour)})`}, not the median`,
    `held ${r.persistence6 ?? 0}/6h · ${r.persistence24 ?? 0}/24h`,
    band,
    feeLine(r),
    ...flowLines(r),
  ].join("\n");
}

function persistTone(p: number): string {
  if (p >= 4) return "border-good/40 text-good";
  if (p >= 2) return "border-amber-700/50 text-amber-300";
  return "border-neutral-700 text-neutral-500";
}

const CHIP = "rounded border px-1 text-[10px]";

/** Chip after an edge: hours of 6 it held, "est." for heuristic rows, "n/a" for artefacts. */
export function EdgeBadge({ row }: { row: FlipEdgeInfo }) {
  if (!row.ranked) return <span className={`${CHIP} border-bad/40 text-bad/80`}>n/a</span>;
  if (row.source === "estimated") return <span className={`${CHIP} border-neutral-700 text-neutral-500`}>est.</span>;
  const p = row.persistence6 ?? 0;
  return <span className={`${CHIP} tabular-nums ${persistTone(p)}`}>{p}/6h</span>;
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
        title="No computable exchange edge — every row is a volume-based estimate, not an observed edge."
      >
        estimated · not executable
      </span>
    );
  }
  return (
    <span
      className="rounded border border-emerald-900/50 bg-emerald-950/20 px-1.5 py-0.5 text-[10px] text-emerald-300"
      title={`Edges from GGG's hourly exchange digest (volume-weighted fills), last closed hour to ${clock(newestHour)}. Not a live bid/ask. ${total - observed} row(s) without a computable exchange edge are marked "est.".`}
    >
      GGG exchange · {observed}/{total}
    </span>
  );
}

/** Volume-bar colour by liquidity tier, so thin legs stand out without another column. */
export function liquidityBar(tier: FlipEdgeInfo["liquidityTier"]): string {
  return tier === "safe" ? "bg-emerald-500/60" : tier === "risky" ? "bg-amber-500/60" : "bg-neutral-500/60";
}
