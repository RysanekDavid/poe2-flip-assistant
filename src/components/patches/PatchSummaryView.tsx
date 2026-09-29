"use client";

import { TriangleAlert } from "lucide-react";
import artExchange from "../../assets/Currency_exchange.png";
import type { PatchSummaryState } from "../../lib/patchesContract";
import type { PatchSummary } from "../../sources/patchNotes/summaryContract";
import { InfoTip } from "../ui/Tooltip";
import { PatchGroupCard } from "./PatchGroupCard";

/** Provenance lives in the tooltip; model/prompt stay in the API for debugging, not on screen. */
function summaryTip(summary: PatchSummaryState): string {
  const notes = [
    "AI summary, generated from the official forum thread — verify anything important in-game.",
    summary.truncated ? "Covers only the first part of very long notes." : "",
    summary.status === "pending" ? "Updating for an edited thread." : "",
    summary.status === "failed" ? "The latest edit could not be summarized." : "",
  ];
  return notes.filter((note) => note !== "").join(" ");
}

/** The one block this app exists for, so it leads — a quiet box, no fill colour, no glow. */
function TradingImpact({ text }: { text: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-line bg-neutral-900/70 p-3">
      <img src={artExchange.src} alt="" className="h-5 w-5 shrink-0 object-contain" />
      <div className="min-w-0">
        <p className="text-xs text-neutral-400">Trading impact</p>
        <p className="text-sm text-neutral-200">{text}</p>
      </div>
    </div>
  );
}

function SummaryBody({ data, summary }: { data: PatchSummary; summary: PatchSummaryState }) {
  return (
    <div className="space-y-3">
      <p className="text-base text-neutral-100">
        {data.tldr} <InfoTip tip={summaryTip(summary)} label="About the AI summary" align="start" />
      </p>
      <TradingImpact text={data.trading_impact} />
      {data.groups.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {data.groups.map((group) => (
            <PatchGroupCard key={group.kind} kind={group.kind} bullets={group.bullets} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One muted line; the detail rides in the tooltip instead of an error box. */
function MutedLine({ text, tip }: { text: string; tip?: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-neutral-400" title={tip}>
      <TriangleAlert aria-hidden className="h-4 w-4 text-amber-300" />
      {text}
    </p>
  );
}

function Skeleton({ tip }: { tip: string }) {
  return (
    <div role="status" aria-label="AI summary in progress" title={tip} className="space-y-2">
      <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-800/60" />
      <div className="h-4 w-full animate-pulse rounded bg-neutral-800/60" />
      <div className="h-4 w-2/3 animate-pulse rounded bg-neutral-800/60" />
    </div>
  );
}

/**
 * The summary is display-only text from a model reading untrusted forum content: rendered as plain
 * React text (never HTML, never links), with the official thread linked from the card header.
 */
export function PatchSummaryView({ summary }: { summary: PatchSummaryState | null }) {
  if (summary == null) return <MutedLine text="No stored text for this thread — read it on the forum." />;
  if (summary.data) return <SummaryBody data={summary.data} summary={summary} />;
  if (summary.status === "failed") {
    return <MutedLine text="AI summary unavailable — read the forum thread." tip={summary.error ?? "The summary could not be produced."} />;
  }
  const retrying = summary.error ? ` Last attempt failed, retrying with backoff: ${summary.error}` : "";
  return <Skeleton tip={`Summary queued — it appears after the next patch check.${retrying}`} />;
}
