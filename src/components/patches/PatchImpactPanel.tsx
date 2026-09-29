"use client";

import { useState } from "react";
import { ChevronDown, LineChart } from "lucide-react";
import { assertOk, describeError } from "../../lib/clientWarn";
import {
  HORIZON_KEYS,
  HORIZON_LABEL,
  impactBannerText,
  patchImpactResponseSchema,
  patchTimeSourceLabel,
  type HorizonKey,
  type ImpactCategory,
  type ImpactItem,
  type LikelyAffected,
  type PatchImpactResponse,
  type PatchTextSource,
} from "../../lib/patchImpactContract";
import { DataTable, type Column } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { ItemArt } from "../ui/ItemArt";
import { PriceChip } from "../ui/PriceChip";
import { Sparkline } from "../ui/Sparkline";

type ImpactState = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; impact: PatchImpactResponse };

/** Fetched only when opened: each open reads a week of snapshots per named item. */
function useImpact(threadId: number) {
  const [state, setState] = useState<ImpactState>({ kind: "idle" });
  const load = (): void => {
    setState({ kind: "loading" });
    const url = `/api/patches/${threadId}/impact`;
    fetch(url, { cache: "no-store" })
      .then(async (r) => setState({ kind: "ready", impact: patchImpactResponseSchema.parse(await assertOk(r, url).json()) }))
      .catch((e: unknown) => {
        console.error("[patches] impact failed", e);
        setState({ kind: "error", message: describeError(e) });
      });
  };
  return { state, load };
}

const SOURCE_TIP: Record<PatchTextSource, string> = {
  title: "Named in the thread title",
  body: "Named in the official change list",
  summary: "Named in the AI summary (verify in the official notes)",
};

function SourceChips({ sources }: { sources: readonly PatchTextSource[] }) {
  return (
    <span className="inline-flex gap-1">
      {sources.map((s) => (
        <span key={s} title={SOURCE_TIP[s]} className="rounded border border-line px-1 text-xs text-neutral-400">
          {s}
        </span>
      ))}
    </span>
  );
}

function fmtPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toLocaleString("en", { maximumFractionDigits: Math.abs(pct) >= 10 ? 0 : 1 })}%`;
}

function PctCell({ pct, due, note }: { pct: number | null; due: boolean; note?: string }) {
  if (pct === null) {
    const why = due ? "No snapshot within ±3h of this horizon (or none before the patch)" : "This horizon has not been reached yet";
    return <span title={why} className="text-neutral-500">{due ? "—" : "…"}</span>;
  }
  const tone = pct > 0.05 ? "text-emerald-400" : pct < -0.05 ? "text-red-300" : "text-neutral-300";
  return <span className={`tabular-nums ${tone}`} title={note}>{fmtPct(pct)}</span>;
}

function trendPoints(item: ImpactItem): number[] {
  const later = HORIZON_KEYS.map((k) => item.points[k].div).filter((v): v is number => v !== null);
  return item.preDiv === null ? [] : [item.preDiv, ...later];
}

function itemColumns(due: PatchImpactResponse["due"]): Column<ImpactItem>[] {
  const horizon = (key: HorizonKey): Column<ImpactItem> => ({
    key,
    header: HORIZON_LABEL[key],
    align: "right",
    tip: `Price change from just before the patch to the snapshot nearest ${HORIZON_LABEL[key]} (±3h).`,
    cell: (r) => <PctCell pct={r.points[key].pct} due={due[key]} />,
  });
  return [
    {
      key: "item",
      header: "Item",
      wrap: true,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <ItemArt src={r.icon} size={6} />
          <span>{r.name}</span>
          <span className="text-xs text-neutral-500">{r.category}</span>
        </span>
      ),
    },
    { key: "seen", header: "Seen in", tip: "Where the patch names this item: title, change list or AI summary.", cell: (r) => <SourceChips sources={r.sources} /> },
    { key: "pre", header: "Before", align: "right", tip: "Last poe.ninja snapshot 1–7h before the patch time.", cell: (r) => <PriceChip div={r.preDiv} exPerDiv={null} source="ninja" /> },
    ...HORIZON_KEYS.map(horizon),
    { key: "trend", header: "Trend", align: "center", cell: (r) => <Sparkline data={trendPoints(r)} /> },
  ];
}

function categoryColumns(due: PatchImpactResponse["due"]): Column<ImpactCategory>[] {
  const horizon = (key: HorizonKey): Column<ImpactCategory> => ({
    key,
    header: HORIZON_LABEL[key],
    align: "right",
    tip: `Median ${HORIZON_LABEL[key]} change over every item of the category that has both prices.`,
    cell: (r) => <PctCell pct={r.medians[key].pct} due={due[key]} note={`median of ${r.medians[key].n} items`} />,
  });
  return [
    { key: "category", header: "Category", cell: (r) => r.category },
    {
      key: "why",
      header: "Why",
      wrap: true,
      tip: "Keywords that point at the category, or a named item that belongs to it.",
      cell: (r) => (r.keywords.length > 0 ? r.keywords.join(", ") : "named item"),
    },
    { key: "seen", header: "Seen in", cell: (r) => <SourceChips sources={r.sources} /> },
    ...HORIZON_KEYS.map(horizon),
  ];
}

const LIKELY_TIP: Record<LikelyAffected["kind"], string> = {
  unique: "Unique — poe2scout prices are not kept as history, so no move can be measured.",
  base: "Item base — bases have no exchange price.",
  exchange: "Exchange item without a measurable move here: poe.ninja never priced it in this league, or it is the Divine Orb (prices are in Divine).",
};

/** Native titles, not Tooltips: a long list must not add a tab stop per chip. */
function LikelyAffectedList({ rows }: { rows: LikelyAffected[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-neutral-400">Likely affected (no price history):</p>
      <div className="flex flex-wrap gap-1">
        {rows.map((r) => (
          <span
            key={`${r.kind}:${r.name}`}
            title={`${LIKELY_TIP[r.kind]} Seen in: ${r.sources.join(", ")}.`}
            className="rounded border border-line px-1.5 py-0.5 text-xs text-neutral-300"
          >
            {r.name} <span className="text-neutral-500">· {r.kind}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function ImpactHeader({ impact }: { impact: PatchImpactResponse }) {
  const at = new Date(impact.patchTime.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="space-y-1 text-xs text-neutral-400">
      <p>
        <span title={`From: ${impact.patchTime.raw}`}>
          patch time ≈ {at} ({patchTimeSourceLabel(impact.patchTime.source)})
        </span>
        {impact.league && <> · league {impact.league}</>}
      </p>
      <p>
        Correlation, not causation: prices move for many reasons (league age, streamers, supply shocks). Moves compare the last poe.ninja
        snapshot before the patch with the one nearest each horizon; &quot;—&quot; means no snapshot close enough, &quot;…&quot; not yet.
      </p>
      {impact.banner && (
        <p role="status" className="rounded border border-amber-400/40 px-2 py-1 text-amber-200">
          {impactBannerText(impact.banner, impact.retentionDays)}
        </p>
      )}
    </div>
  );
}

function ImpactView({ impact }: { impact: PatchImpactResponse }) {
  const nothing = impact.items.length === 0 && impact.categories.length === 0 && impact.likelyAffected.length === 0;
  return (
    <div className="space-y-3">
      <ImpactHeader impact={impact} />
      {nothing ? (
        <EmptyState icon={<LineChart className="h-4 w-4" />} sentence="This patch names no exchange item, unique, base or item family we track." />
      ) : (
        <>
          <DataTable columns={itemColumns(impact.due)} rows={impact.items} rowKey={(r) => r.itemId} emptyState={<p className="text-xs text-neutral-400">No priced exchange item is named by name.</p>} />
          {impact.categories.length > 0 && <DataTable columns={categoryColumns(impact.due)} rows={impact.categories} rowKey={(r) => r.category} emptyState={null} />}
          <LikelyAffectedList rows={impact.likelyAffected} />
        </>
      )}
    </div>
  );
}

export function PatchImpactPanel({ threadId }: { threadId: number }) {
  const [open, setOpen] = useState(false);
  const { state, load } = useImpact(threadId);
  const toggle = (): void => {
    if (!open && state.kind !== "ready" && state.kind !== "loading") load();
    setOpen((o) => !o);
  };
  return (
    <div className="border-t border-line pt-2">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200">
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
        Price impact
      </button>
      {open && (
        <div className="mt-2">
          {state.kind === "loading" && <p className="text-xs text-neutral-400">Loading…</p>}
          {state.kind === "error" && <p className="text-xs text-amber-300">Could not load the price impact: {state.message}</p>}
          {state.kind === "ready" && <ImpactView impact={state.impact} />}
        </div>
      )}
    </div>
  );
}
