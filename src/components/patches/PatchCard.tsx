"use client";

import { useId, useState } from "react";
import { ChevronDown, ExternalLink, RotateCcw } from "lucide-react";
import { assertOk, describeError } from "../../lib/clientWarn";
import { resummarizeResponseSchema, reviewHintLabel, reviewLabel, summaryBadge, type PatchListItem } from "../../lib/patchesContract";
import type { SummaryKind } from "../../sources/patchNotes/summaryContract";
import { Button } from "../ui/Button";
import { Tooltip } from "../ui/Tooltip";
import { groupKindStyle } from "./groupKinds";
import { PatchBody } from "./PatchBody";
import { GroupIconView } from "./PatchGroupCard";
import { PatchImpactPanel } from "./PatchImpactPanel";
import { PatchSummaryView } from "./PatchSummaryView";

interface PatchCardProps {
  patch: PatchListItem;
  /** The newest patch on the board: its version badge carries the accent. */
  newest: boolean;
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

/** The summary's own flag wins; otherwise a lettered version (0.5.5d) is a hotfix. */
function patchKindLabel(patch: PatchListItem): "Hotfix" | "Patch" {
  const flagged = patch.summary?.data?.hotfix;
  if (flagged !== undefined) return flagged ? "Hotfix" : "Patch";
  return /^\d+\.\d+\.\d+[a-z]$/i.test(patch.versionText.trim()) ? "Hotfix" : "Patch";
}

function Chip({ text, tip }: { text: string; tip: string }) {
  return (
    <Tooltip tip={tip} align="end">
      <span className="rounded border border-line px-1.5 py-0.5 text-xs text-neutral-300">{text}</span>
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

/** Owner review state; the AI's review hint rides in its tooltip instead of a prose line. */
function ReviewChip({ patch }: { patch: PatchListItem }) {
  const data = patch.summary?.data;
  const hint = data ? `${reviewHintLabel(data.review_hint)} — ${data.review_reason}` : null;
  if (!patch.review && !hint) return null;
  const text = patch.review ? reviewLabel(patch.review) : "AI review hint";
  const tip = ["Owner review state (patch:review) — the AI hint never changes it.", hint].filter((t): t is string => t !== null).join(" ");
  return <Chip text={text} tip={tip} />;
}

function HeaderRight({ patch, canResummarize, onChanged }: Pick<PatchCardProps, "patch" | "canResummarize" | "onChanged">) {
  const resummarize = useResummarize(patch.threadId, onChanged);
  // A finished summary is announced once, by its own ⓘ; the header only flags pending/failed.
  const status = patch.summary?.status;
  const badge = status && status !== "done" ? summaryBadge(status) : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-neutral-400">{publishedLabel(patch)}</span>
      {badge && <Chip text={badge.label} tip={badge.hint} />}
      {canResummarize && <ReviewChip patch={patch} />}
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
      <a
        href={patch.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Official forum thread"
        title="Official forum thread"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sky-300 hover:bg-neutral-800 hover:text-sky-200"
      >
        <ExternalLink className="h-4 w-4" aria-hidden />
      </a>
    </div>
  );
}

/** One icon per group the summary has, so even a collapsed card says what kind of change it is. */
function GroupDots({ kinds }: { kinds: readonly SummaryKind[] }) {
  if (kinds.length === 0) return null;
  const labels = kinds.map((k) => groupKindStyle(k).label).join(" · ");
  return (
    <span className="flex shrink-0 items-center gap-1 opacity-70" title={labels}>
      {kinds.map((k) => (
        <GroupIconView key={k} icon={groupKindStyle(k).icon} />
      ))}
      <span className="sr-only">{labels}</span>
    </span>
  );
}

function VersionBadge({ version, newest }: { version: string; newest: boolean }) {
  const tone = newest ? "border-amber-400/40 text-amber-200" : "border-line text-neutral-300";
  return <span className={`shrink-0 rounded-md border px-2 py-0.5 font-mono text-sm ${tone}`}>{version}</span>;
}

export function PatchCard({ patch, newest, canResummarize, defaultOpen, onChanged }: PatchCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const kinds = [...new Set((patch.summary?.data?.groups ?? []).map((g) => g.kind))];
  return (
    <section className="rounded-lg border border-line bg-surface/60 p-4">
      <header className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 ${open ? "mb-3" : ""}`}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-[min(100%,18rem)] flex-1 items-center gap-2 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
        >
          <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "" : "-rotate-90"}`} />
          <VersionBadge version={patch.versionText} newest={newest} />
          <span className="shrink-0 text-xs text-neutral-400">{patchKindLabel(patch)}</span>
          <span className="min-w-0 truncate text-base font-semibold text-neutral-100">{patch.title}</span>
          <GroupDots kinds={kinds} />
        </button>
        <HeaderRight patch={patch} canResummarize={canResummarize} onChanged={onChanged} />
      </header>
      {/* Mounted only while open: the price impact loads with the card, not for every collapsed one. */}
      {open && (
        <div id={bodyId} className="space-y-3">
          <PatchSummaryView summary={patch.summary} />
          {patch.bodyValid && <PatchBody threadId={patch.threadId} />}
          <PatchImpactPanel threadId={patch.threadId} />
        </div>
      )}
    </section>
  );
}
