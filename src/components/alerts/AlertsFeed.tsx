"use client";

import { useMemo, useState } from "react";
import { BellRing, CheckCheck, TriangleAlert } from "lucide-react";
import { useAlertCenter } from "./AlertsContext";
import { AlertActions, LeagueTag, typeTone } from "./AlertBits";
import { AlertArt, TypeChip, TypeGlyph } from "./AlertTypeBadge";
import { SnipeCardView, ageLabel } from "./SnipeCardView";
import { NoAlerts } from "./NoAlerts";
import { collapseRuns, type Alert, type AlertGroup, type AlertRun } from "../../lib/alertCenter";
import { alertTypeLabel } from "../../lib/alertLabels";
import { useSnipeOutcomes } from "../../lib/useSnipeOutcomes";
import type { CardOutcome, SnipeOutcomesResponse } from "../../lib/snipeOutcomeContract";

/** "ALL" or one alert type. Types are open-ended here: legacy rows (VOLUME, TREND_REVERSAL)
 *  still show up as groups, so the filter mirrors whatever types the feed actually holds. */
type Filter = { kind: "all" } | { kind: "type"; type: AlertGroup["type"] };
const ALL: Filter = { kind: "all" };

/** The tracked re-checks of an alert's listing, or null (untracked: pre-feature, or outcomes not loaded). */
function cardOutcome(outcomes: SnipeOutcomesResponse | null, listingId: string): CardOutcome | null {
  const view = outcomes?.byListing[listingId];
  return view && outcomes ? { view, fetchMethod: outcomes.fetchMethod } : null;
}

function FilterChip({ label, type, unseen, total, active, onClick }: {
  label: string;
  type: string | null; // null = "All"
  unseen: number;
  total: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      title={`${unseen} unseen of ${total}`}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
        active ? "border-neutral-300 bg-neutral-800 text-neutral-100" : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
      }`}
    >
      {type != null && <TypeGlyph type={type} className={`h-3.5 w-3.5 ${typeTone(type)}`} />}
      <span className={`font-semibold ${type == null ? "text-neutral-200" : typeTone(type)}`}>{label}</span>
      <span className="tabular-nums">{unseen > 0 ? <span className="text-amber-300">{unseen}</span> : total}</span>
    </button>
  );
}

/** Non-snipe alert (or a snipe from before cards / with an unreadable card), repeats folded to ×N. */
function CompactRow({ run }: { run: AlertRun }) {
  const a = run.alert;
  return (
    <li className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-3 py-1.5 text-sm ${run.unseen ? "border-amber-500/30 bg-neutral-800/50" : "border-neutral-800/70 bg-neutral-900/40"}`}>
      <AlertArt alert={a} />
      <TypeChip type={a.type} />
      <span className="font-medium text-neutral-100">{a.item_name ?? a.item_id}</span>
      {run.count > 1 && (
        <span className="text-xs tabular-nums text-neutral-400" title={`${run.count} alerts in a row for this item — showing the latest`}>
          ×{run.count}
        </span>
      )}
      <LeagueTag league={a.foreign_league} />
      {a.details_error && (
        <span title={`item card unavailable: ${a.details_error}`}>
          <TriangleAlert className="h-3.5 w-3.5 text-warn" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-neutral-400" title={a.message}>{a.message}</span>
      <AlertActions alert={a} />
      <time className="shrink-0 text-xs text-neutral-400" title={`${a.created_at} UTC`}>{ageLabel(a.created_at)}</time>
    </li>
  );
}

function FeedList({ alerts, hidden, outcomes }: { alerts: Alert[]; hidden: number; outcomes: SnipeOutcomesResponse | null }) {
  if (alerts.length === 0) {
    return <NoAlerts />;
  }
  return (
    <ul className="space-y-2">
      {collapseRuns(alerts).map((run) => {
        const a = run.alert;
        return a.type === "SNIPE" && a.details ? (
          <li key={a.id}>
            <SnipeCardView alert={a} card={a.details} outcome={cardOutcome(outcomes, a.item_id)} />
          </li>
        ) : (
          <CompactRow key={a.id} run={run} />
        );
      })}
      {hidden > 0 && <li className="px-2 text-xs text-neutral-500">+{hidden} older not shown (the newest 15 per type are kept here)</li>}
    </ul>
  );
}

function visible(groups: readonly AlertGroup[], filter: Filter): { alerts: Alert[]; hidden: number } {
  const picked = filter.kind === "all" ? groups : groups.filter((g) => g.type === filter.type);
  const alerts = picked.flatMap((g) => g.alerts).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  const hidden = picked.reduce((n, g) => n + Math.max(0, g.total - g.alerts.length), 0);
  return { alerts, hidden };
}

/** A type filter whose type left the feed (all its alerts aged out) falls back to "all". */
function effectiveFilter(filter: Filter, groups: readonly AlertGroup[]): Filter {
  return filter.kind === "type" && !groups.some((g) => g.type === filter.type) ? ALL : filter;
}

function MarkSeenButton({ filter, unseen, onClick }: { filter: Filter; unseen: number; onClick: () => void }) {
  if (unseen === 0) return null;
  const all = filter.kind === "all";
  return (
    <button
      onClick={onClick}
      className="ml-auto inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
      title={all ? "mark every alert in this league view seen" : `mark every ${alertTypeLabel(filter.type)} alert seen`}
    >
      <CheckCheck className="h-3.5 w-3.5" /> {all ? "mark all seen" : "mark seen"} ({unseen})
    </button>
  );
}

/** Alerts tab, main column: the whole feed, filterable by type; snipes render as item cards. */
export function AlertsFeed() {
  const { groups, unseen, error, markSeen } = useAlertCenter();
  const { data: outcomes, error: outcomesError } = useSnipeOutcomes();
  const [chosen, setChosen] = useState<Filter>(ALL);
  const filter = effectiveFilter(chosen, groups);
  const { alerts, hidden } = useMemo(() => visible(groups, filter), [groups, filter]);
  const total = groups.reduce((n, g) => n + g.total, 0);
  // muted types still count here: this tab is where they are read (the badge skips them)
  const allUnseen = groups.reduce((n, g) => n + g.unseen, 0);
  const filterUnseen = filter.kind === "all" ? allUnseen : (groups.find((g) => g.type === filter.type)?.unseen ?? 0);
  const isActive = (type: string | null): boolean => (type == null ? filter.kind === "all" : filter.kind === "type" && filter.type === type);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <BellRing className={`h-5 w-5 ${unseen > 0 ? "text-amber-300" : "text-neutral-500"}`} />
        <h2 className="text-lg font-semibold">Alert feed</h2>
        {error && <span className="text-xs text-bad">could not refresh: {error}</span>}
        {outcomesError && <span className="text-xs text-warn">snipe outcomes unavailable: {outcomesError}</span>}
        <MarkSeenButton
          filter={filter}
          unseen={filterUnseen}
          onClick={() => void markSeen(filter.kind === "all" ? { all: true } : { type: filter.type })}
        />
      </header>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <FilterChip label="All" type={null} unseen={allUnseen} total={total} active={isActive(null)} onClick={() => setChosen(ALL)} />
        {groups.map((g) => (
          <FilterChip
            key={g.type}
            label={alertTypeLabel(g.type)}
            type={g.type}
            unseen={g.unseen}
            total={g.total}
            active={isActive(g.type)}
            onClick={() => setChosen({ kind: "type", type: g.type })}
          />
        ))}
      </div>
      <FeedList alerts={alerts} hidden={hidden} outcomes={outcomes} />
    </section>
  );
}
