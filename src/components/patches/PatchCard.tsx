"use client";

import { useState } from "react";
import { ExternalLink, RotateCcw } from "lucide-react";
import { assertOk, describeError } from "../../lib/clientWarn";
import {
  resummarizeResponseSchema,
  reviewHintLabel,
  reviewLabel,
  summaryBadge,
  type PatchListItem,
} from "../../lib/patchesContract";
import { Button } from "../ui/Button";
import { Panel } from "../ui/Panel";
import { Tooltip } from "../ui/Tooltip";
import { PatchBody } from "./PatchBody";
import { PatchSummaryView } from "./PatchSummaryView";

interface PatchCardProps {
  patch: PatchListItem;
  /** Owner: sees the review state and may queue a fresh summary. */
  canResummarize: boolean;
  defaultOpen: boolean;
  onChanged: () => void;
}

function publishedLabel(patch: PatchListItem): string {
  if (patch.publishedAt == null) return patch.publishedText;
  const date = new Date(patch.publishedAt);
  return Number.isNaN(date.getTime()) ? patch.publishedText : date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function Chip({ text, tip, accent = false }: { text: string; tip: string; accent?: boolean }) {
  return (
    <Tooltip tip={tip} align="end">
      <span className={`rounded border px-1.5 py-0.5 text-xs ${accent ? "border-amber-400/40 text-amber-200" : "border-line text-neutral-300"}`}>{text}</span>
    </Tooltip>
  );
}

function useResummarize(threadId: number, onChanged: () => void) {
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const run = (): void => {
    setState({ busy: true, error: null });
    const url = `/api/patches/${threadId}`;
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "resummarize" }) })
      .then(async (r) => {
        resummarizeResponseSchema.parse(await assertOk(r, url).json());
        setState({ busy: false, error: null });
        onChanged();
      })
      .catch((e: unknown) => {
        console.error("[patches] re-summarize failed", e);
        setState({ busy: false, error: describeError(e) });
      });
  };
  return { ...state, run };
}

function HeaderRight({ patch, canResummarize, onChanged }: Omit<PatchCardProps, "defaultOpen">) {
  const resummarize = useResummarize(patch.threadId, onChanged);
  const badge = patch.summary ? summaryBadge(patch.summary.status) : null;
  return (
    <>
      <span className="text-xs text-neutral-400">{publishedLabel(patch)}</span>
      {badge && <Chip text={badge.label} tip={badge.hint} accent={patch.summary?.status === "done"} />}
      {canResummarize && patch.review && <Chip text={reviewLabel(patch.review)} tip="Owner review state (patch:review) — the AI hint below never changes it." />}
      {canResummarize && patch.bodyValid && (
        <Button size="sm" variant="ghost" onClick={resummarize.run} disabled={resummarize.busy} title="Queue a fresh AI summary (no new alert)" aria-label="Re-summarize this patch">
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        </Button>
      )}
      {resummarize.error && (
        <span role="alert" className="text-xs text-amber-300">
          re-summarize failed: {resummarize.error}
        </span>
      )}
      <a href={patch.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-300 hover:text-sky-200">
        forum <ExternalLink className="h-3 w-3" aria-hidden />
      </a>
    </>
  );
}

export function PatchCard({ patch, canResummarize, defaultOpen, onChanged }: PatchCardProps) {
  const hint = patch.summary?.data?.review_hint;
  return (
    <Panel
      title={`${patch.versionText} · ${patch.title}`}
      collapsible
      defaultOpen={defaultOpen}
      right={<HeaderRight patch={patch} canResummarize={canResummarize} onChanged={onChanged} />}
    >
      <div className="space-y-3">
        {canResummarize && hint && (
          <p className="text-xs text-neutral-400">
            {reviewHintLabel(hint)} — {patch.summary?.data?.review_reason}
          </p>
        )}
        <PatchSummaryView summary={patch.summary} />
        {patch.bodyValid && <PatchBody threadId={patch.threadId} />}
      </div>
    </Panel>
  );
}
