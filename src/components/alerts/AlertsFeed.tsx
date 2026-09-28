"use client";

import { useMemo, useState } from "react";
import { BellRing, CheckCheck, TriangleAlert } from "lucide-react";
import { useAlertCenter } from "./AlertsContext";
import { AlertActions, LeagueTag, typeTone } from "./AlertBits";
import { SnipeCardView, ageLabel } from "./SnipeCardView";
import type { Alert, AlertGroup } from "../../lib/alertCenter";

type Filter = "ALL" | string;

function FilterChip({ label, unseen, total, active, tone, onClick }: {
  label: string;
  unseen: number;
  total: number;
  active: boolean;
  tone: string;
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
      <span className={`font-semibold ${tone}`}>{label}</span>
      <span className="tabular-nums">{unseen > 0 ? <span className="text-amber-300">{unseen}</span> : total}</span>
    </button>
  );
}

/** Non-snipe alert (or a snipe from before cards / with an unreadable card): one compact row. */
function CompactRow({ a }: { a: Alert }) {
  return (
    <li className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border px-3 py-1.5 text-sm ${a.seen === 0 ? "border-amber-500/30 bg-neutral-800/50" : "border-neutral-800/70 bg-neutral-900/40"}`}>
      <span className={`w-24 shrink-0 text-xs font-semibold ${typeTone(a.type)}`}>{a.type}</span>
      <span className="font-medium text-neutral-100">{a.item_name ?? a.item_id}</span>
      <LeagueTag league={a.foreign_league} />
      {a.details_error && (
        <span title={`item card unavailable: ${a.details_error}`}>
          <TriangleAlert className="h-3.5 w-3.5 text-warn" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-neutral-400" title={a.message}>{a.message}</span>
      <AlertActions alert={a} />
      <time className="shrink-0 text-[11px] text-neutral-500" title={`${a.created_at} UTC`}>{ageLabel(a.created_at)}</time>
    </li>
  );
}

function FeedList({ alerts, hidden }: { alerts: Alert[]; hidden: number }) {
  if (alerts.length === 0) {
    return <p className="py-10 text-center text-sm text-neutral-500">no alerts here yet</p>;
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a) =>
        a.type === "SNIPE" && a.details ? (
          <li key={a.id}>
            <SnipeCardView alert={a} card={a.details} />
          </li>
        ) : (
          <CompactRow key={a.id} a={a} />
        ),
      )}
      {hidden > 0 && <li className="px-2 text-[11px] text-neutral-600">+{hidden} older not shown (the newest 15 per type are kept here)</li>}
    </ul>
  );
}

function visible(groups: readonly AlertGroup[], filter: Filter): { alerts: Alert[]; hidden: number } {
  const picked = filter === "ALL" ? groups : groups.filter((g) => g.type === filter);
  const alerts = picked.flatMap((g) => g.alerts).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
  const hidden = picked.reduce((n, g) => n + Math.max(0, g.total - g.alerts.length), 0);
  return { alerts, hidden };
}

/** Alerts tab, main column: the whole feed, filterable by type; snipes render as item cards. */
export function AlertsFeed() {
  const { groups, unseen, error, markSeen } = useAlertCenter();
  const [filter, setFilter] = useState<Filter>("ALL");
  const active = filter === "ALL" || groups.some((g) => g.type === filter) ? filter : "ALL";
  const { alerts, hidden } = useMemo(() => visible(groups, active), [groups, active]);
  const total = groups.reduce((n, g) => n + g.total, 0);
  // muted types still count here: this tab is where they are read (the badge skips them)
  const allUnseen = groups.reduce((n, g) => n + g.unseen, 0);
  const activeUnseen = active === "ALL" ? allUnseen : (groups.find((g) => g.type === active)?.unseen ?? 0);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2">
        <BellRing className={`h-5 w-5 ${unseen > 0 ? "text-amber-300" : "text-neutral-500"}`} />
        <h2 className="text-lg font-semibold">Alert feed</h2>
        {error && <span className="text-xs text-bad">could not refresh: {error}</span>}
        {activeUnseen > 0 && (
          <button
            onClick={() => void markSeen(active === "ALL" ? { all: true } : { type: active })}
            className="ml-auto inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
            title={active === "ALL" ? "mark every alert in this league view seen" : `mark every ${active} alert seen`}
          >
            <CheckCheck className="h-3.5 w-3.5" /> {active === "ALL" ? "mark all seen" : "mark seen"} ({activeUnseen})
          </button>
        )}
      </header>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <FilterChip label="All" unseen={allUnseen} total={total} active={active === "ALL"} tone="text-neutral-200" onClick={() => setFilter("ALL")} />
        {groups.map((g) => (
          <FilterChip key={g.type} label={g.type} unseen={g.unseen} total={g.total} active={active === g.type} tone={typeTone(g.type)} onClick={() => setFilter(g.type)} />
        ))}
      </div>
      <FeedList alerts={alerts} hidden={hidden} />
    </section>
  );
}
