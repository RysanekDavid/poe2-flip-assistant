"use client";

import { Hourglass, TriangleAlert } from "lucide-react";
import { groupLabel, type PatchSummaryState } from "../../lib/patchesContract";
import type { PatchSummary } from "../../sources/patchNotes/summaryContract";
import { EmptyState } from "../ui/EmptyState";
import { InfoTip } from "../ui/Tooltip";

function SummaryBody({ data }: { data: PatchSummary }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-100">
        {data.hotfix && <span className="mr-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-300">hotfix</span>}
        {data.tldr}
      </p>
      <div>
        <p className="text-xs text-neutral-500">Trading impact</p>
        <p className="text-sm text-neutral-200">{data.trading_impact}</p>
      </div>
      {data.groups.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.groups.map((group) => (
            <section key={group.kind}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{groupLabel(group.kind)}</h4>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-neutral-300">
                {group.bullets.map((bullet, index) => (
                  <li key={index}>{bullet}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Provenance lives in the tooltip; model/prompt stay in the API for debugging, not on screen. */
function summaryTip(summary: PatchSummaryState): string {
  const notes = [
    "AI-generated from the official forum thread — verify anything important in-game.",
    summary.truncated ? "Covers only the first part of very long notes." : "",
    summary.status === "pending" ? "Updating for an edited thread." : "",
    summary.status === "failed" ? "The latest edit could not be summarized." : "",
  ];
  return notes.filter((note) => note !== "").join(" ");
}

function SummaryHeading({ summary }: { summary: PatchSummaryState }) {
  return (
    <p className="flex items-center gap-1 text-xs text-neutral-500">
      AI summary
      <InfoTip tip={summaryTip(summary)} label="About the AI summary" align="start" />
    </p>
  );
}

/**
 * The summary is display-only text from a model reading untrusted forum content: rendered as plain
 * React text (never HTML, never links), with the official thread linked from the card header.
 */
export function PatchSummaryView({ summary }: { summary: PatchSummaryState | null }) {
  if (summary == null) {
    return <EmptyState icon={<TriangleAlert className="h-5 w-5" />} sentence="No stored text for this thread — read it on the forum." />;
  }
  if (summary.data) {
    return (
      <div className="space-y-1">
        <SummaryHeading summary={summary} />
        <SummaryBody data={summary.data} />
      </div>
    );
  }
  if (summary.status === "failed") {
    const detail = summary.error ? ` (${summary.error})` : "";
    return <EmptyState icon={<TriangleAlert className="h-5 w-5 text-amber-300" />} sentence={`AI summary unavailable — read the official notes.${detail}`} />;
  }
  const retrying = summary.error ? ` Last attempt failed, retrying with backoff: ${summary.error}` : "";
  return <EmptyState icon={<Hourglass className="h-5 w-5" />} sentence={`Summary queued — it appears after the next patch check.${retrying}`} />;
}
