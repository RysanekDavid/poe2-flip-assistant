"use client";

import { compact, fmtSmart } from "../lib/format";

type EdgeIssue = "thin" | "coarse" | "single-market" | "fee-unknown" | "implausible" | "sporadic";

/** Every observed number here is an hour-old digest statistic, never a live order book. */
const VERIFY = "verify in-game before trading — hourly digest, not a live order book";

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
  implausible: "an hour in the last 6 printed an edge above the plausibility cap — treated as a data artefact",
  sporadic: "fewer than 3 of the last 6 hours had a valid edge — prints, not a market",
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
    `GGG exchange · ${kind} · ${VERIFY}`,
    ...(r.ranked ? [] : ["NOT RANKED — needs ≥4/6h held and ≥100 Div/h on the slower leg"]),
    `net edge 6h median ${pct(r.edgePct)} (silent/invalid hours = 0) · last hour ${pct(r.edgeLatestPct)} · 24h ${pct(r.edgeMedian24Pct)}`,
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

/** Chip after an edge: hours of 6 it held (grey when unranked), "est." for heuristic rows, "n/a" for artefacts. */
export function EdgeBadge({ row }: { row: FlipEdgeInfo }) {
  if (row.source === "estimated") {
    if (!row.ranked) return <span className={`${CHIP} border-bad/40 text-bad/80`}>n/a</span>;
    return <span className={`${CHIP} border-neutral-700 text-neutral-500`}>est.</span>;
  }
  const p = row.persistence6 ?? 0;
  const tone = row.ranked ? persistTone(p) : "border-neutral-800 text-neutral-600";
  return <span className={`${CHIP} tabular-nums ${tone}`}>{p}/6h</span>;
}

/**
 * Sort tier for the Edge column: ranked observed edges first, then estimates, then everything
 * kept out of ranking — so a fat unranked number can never sort to the top.
 */
export function edgeSortTier(row: FlipEdgeInfo): number {
  if (!row.ranked) return 0;
  return row.source === "cx" ? 2 : 1;
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
export interface HitRate {
  hits: number;
  resolved: number;
  days: number;
}

function hitRateLine(h: HitRate | null): string {
  if (h == null || h.resolved === 0) return "Outcome log: no published edge has been checked against its next hour yet.";
  return `Published edges that still held the next hour: ${h.hits}/${h.resolved} (${Math.round((100 * h.hits) / h.resolved)}%) over ${h.days}d.`;
}

export function MarketSourceBadge({
  newestHour,
  observed,
  total,
  hitRate,
}: {
  newestHour: number | null;
  observed: number;
  total: number;
  hitRate: HitRate | null;
}) {
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
      title={`Edges from GGG's hourly exchange digest (volume-weighted fills), last closed hour to ${clock(newestHour)} — ${VERIFY}. ${total - observed} row(s) without a computable exchange edge are marked "est.". ${hitRateLine(hitRate)}`}
    >
      GGG exchange · {observed}/{total}
    </span>
  );
}

/** Volume-bar colour by liquidity tier, so thin legs stand out without another column. */
export function liquidityBar(tier: FlipEdgeInfo["liquidityTier"]): string {
  return tier === "safe" ? "bg-emerald-500/60" : tier === "risky" ? "bg-amber-500/60" : "bg-neutral-500/60";
}
