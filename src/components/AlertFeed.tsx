"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAlertCenter } from "./alerts/AlertsContext";
import { AlertActions, LeagueTag, MuteToggle, typeTone } from "./alerts/AlertBits";
import type { AlertGroup } from "../lib/alertCenter";

function GroupHeader({ group, open, onToggle }: { group: AlertGroup; open: boolean; onToggle: () => void }) {
  const { markSeen, setMuted } = useAlertCenter();
  return (
    <div className="flex items-center gap-2 border-b border-neutral-800 pb-1">
      <button onClick={onToggle} className="flex flex-1 items-center gap-1.5 text-left text-sm" aria-expanded={open}>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-neutral-500" /> : <ChevronRight className="h-3.5 w-3.5 text-neutral-500" />}
        <span className={`font-semibold ${typeTone(group.type)}`}>{group.type}</span>
        <span className="text-xs tabular-nums text-neutral-500" title={`${group.unseen} unseen of ${group.total}`}>
          {group.unseen > 0 && <span className="text-amber-300">{group.unseen} new · </span>}
          {group.total}
        </span>
        {group.muted && <span className="text-[10px] uppercase tracking-wider text-neutral-600">muted</span>}
      </button>
      {group.unseen > 0 && (
        <button onClick={() => void markSeen({ type: group.type })} className="text-[11px] text-neutral-400 hover:text-neutral-100" title={`mark every ${group.type} alert seen`}>
          mark seen
        </button>
      )}
      <MuteToggle type={group.type} muted={group.muted} onToggle={(m) => void setMuted(group.type, m)} />
    </div>
  );
}

function GroupSection({ group }: { group: AlertGroup }) {
  // muted groups start collapsed: they are there to be unmuted, not read
  const [open, setOpen] = useState(!group.muted && group.unseen > 0);
  return (
    <li>
      <GroupHeader group={group} open={open} onToggle={() => setOpen((o) => !o)} />
      {open && (
        <ul className="mt-1 space-y-1">
          {group.alerts.map((a) => (
            <li key={a.id} className={`rounded px-2 py-1 text-sm ${a.seen === 0 ? "bg-neutral-800/60" : ""}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold">
                  {a.item_name ?? a.item_id}
                  <LeagueTag league={a.foreign_league} />
                </span>
                <time className="shrink-0 text-xs text-neutral-500">{a.created_at.slice(5, 16)}</time>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-neutral-300">
                <span>{a.message}</span>
                <AlertActions alert={a} />
              </div>
            </li>
          ))}
          {group.total > group.alerts.length && (
            <li className="px-2 text-[11px] text-neutral-600">+{group.total - group.alerts.length} older not shown</li>
          )}
        </ul>
      )}
    </li>
  );
}

/** TopBar popover: the alert center grouped by type — counts, per-type mark-seen and mute. */
export function AlertsPanel() {
  const { groups, unseen, error, markSeen } = useAlertCenter();

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        {error ? <span className="text-xs text-bad">could not refresh: {error}</span> : <span />}
        {unseen > 0 && (
          <button onClick={() => void markSeen({ all: true })} className="text-xs text-neutral-400 hover:text-neutral-100">
            mark all seen ({unseen})
          </button>
        )}
      </div>
      <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
        {groups.map((g) => (
          <GroupSection key={g.type} group={g} />
        ))}
        {groups.length === 0 && <li className="py-3 text-center text-neutral-500">no alerts yet</li>}
      </ul>
    </div>
  );
}
