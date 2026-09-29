"use client";

import { useCallback, useState } from "react";
import { RefreshCw, ScrollText, TriangleAlert } from "lucide-react";
import { assertOk, describeError, warnOnFailure } from "../../lib/clientWarn";
import { patchesResponseSchema, type PatchListItem, type PatchesResponse } from "../../lib/patchesContract";
import { useVisiblePoll } from "../../lib/useVisiblePoll";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { PageHeader } from "../ui/PageHeader";
import { PatchCard } from "./PatchCard";

// The poller checks the forum every 30 minutes; a quarter-hour poll shows a new summary promptly.
const POLL_MS = 15 * 60_000;
const ROUTE = "/api/patches";
const PAGE = 10;
// The newest few are what a player opens the tab for; older ones start collapsed.
const OPEN_BY_DEFAULT = 3;

async function fetchPage(before: number | null): Promise<PatchesResponse> {
  const params = new URLSearchParams({ limit: String(PAGE) });
  if (before != null) params.set("before", String(before));
  const url = `${ROUTE}?${params.toString()}`;
  const response = await fetch(url, { cache: "no-store" });
  return patchesResponseSchema.parse(await assertOk(response, ROUTE).json());
}

function usePatches() {
  const [first, setFirst] = useState<PatchesResponse | null>(null);
  const [older, setOlder] = useState<{ patches: PatchListItem[]; nextBefore: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const load = useCallback(() => {
    fetchPage(null)
      .then((page) => {
        setFirst(page);
        setError(null);
      })
      .catch((e: unknown) => {
        warnOnFailure("[patches] list")(e);
        setError(describeError(e));
      });
  }, []);
  useVisiblePoll(load, POLL_MS);
  const cursor = older ? older.nextBefore : (first?.nextBefore ?? null);
  const loadOlder = (): void => {
    if (cursor == null) return;
    setLoadingOlder(true);
    fetchPage(cursor)
      .then((page) => setOlder((prev) => ({ patches: [...(prev?.patches ?? []), ...page.patches], nextBefore: page.nextBefore })))
      .catch((e: unknown) => {
        warnOnFailure("[patches] older page")(e);
        setError(describeError(e));
      })
      .finally(() => setLoadingOlder(false));
  };
  // A poll can bring a new patch that pushes a row into the "older" range: never list it twice.
  const shown = new Set(first?.patches.map((p) => p.threadId) ?? []);
  const patches = [...(first?.patches ?? []), ...(older?.patches ?? []).filter((p) => !shown.has(p.threadId))];
  return { first, patches, error, reload: load, loadOlder, hasOlder: cursor != null, loadingOlder };
}

const LEGEND =
  "Summaries are AI-generated from the official forum thread and can be wrong or incomplete; verify anything that matters in-game " +
  "or in the linked notes. Trading impact is a hint, not a price prediction. New patches also reach the alert feed (and Discord, " +
  "if enabled in Alerts). Very long notes are summarized from their first part and say so.";

export function PatchesBoard() {
  const { first, patches, error, reload, loadOlder, hasOlder, loadingOlder } = usePatches();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Patch notes"
        purpose="Official PoE2 patch threads, newest first — what changed and what it may mean for prices."
        legend={LEGEND}
        action={
          <Button size="sm" variant="ghost" onClick={reload} aria-label="Refresh patch notes">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Refresh
          </Button>
        }
      />
      {error && (
        <EmptyState icon={<TriangleAlert className="h-5 w-5 text-amber-300" />} sentence={`Could not load patch notes: ${error}`} />
      )}
      {first && patches.length === 0 && (
        <EmptyState icon={<ScrollText className="h-5 w-5" />} sentence="No patch threads stored yet — the watcher fills this after its first forum check." />
      )}
      {!first && !error && <p className="text-sm text-neutral-400">Loading patch notes…</p>}
      {first &&
        patches.map((patch, index) => (
          <PatchCard key={patch.threadId} patch={patch} newest={index === 0} canResummarize={first.canResummarize} defaultOpen={index < OPEN_BY_DEFAULT} onChanged={reload} />
        ))}
      {hasOlder && (
        <div className="flex justify-center">
          <Button size="sm" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder ? "Loading…" : "Show older patches"}
          </Button>
        </div>
      )}
    </div>
  );
}
