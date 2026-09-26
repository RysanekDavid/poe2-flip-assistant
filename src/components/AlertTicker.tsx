"use client";

import { useEffect, useState } from "react";
import { TriangleAlert, Bell, BellRing } from "lucide-react";
import { useAlertCenter } from "./alerts/AlertsContext";
import { notificationsSupported, requestNotifyPermission } from "./alerts/browserNotify";
import { AlertActions, LeagueTag, MuteToggle, typeTone } from "./alerts/AlertBits";
import { tickerRecent, type AlertGroup } from "../lib/alertCenter";

/** Per-type chip: unseen/total with a mute toggle. Muted chips stay visible (dimmed) so they can be unmuted. */
function TypeChip({ group, onMute }: { group: AlertGroup; onMute: (muted: boolean) => void }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-neutral-800 bg-neutral-950/60 px-1.5 py-0.5 text-[11px] ${group.muted ? "opacity-50" : ""}`}
      title={`${group.type}: ${group.unseen} unseen of ${group.total}${group.muted ? " — muted" : ""}`}
    >
      <span className={`font-semibold ${typeTone(group.type)}`}>{group.type}</span>
      <span className="tabular-nums text-neutral-400">
        {group.unseen > 0 ? <span className="text-amber-300">{group.unseen}</span> : 0}/{group.total}
      </span>
      <MuteToggle type={group.type} muted={group.muted} onToggle={onMute} />
    </span>
  );
}

function BrowserNotifyToggle() {
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  useEffect(() => {
    setPerm(notificationsSupported() ? Notification.permission : "unsupported");
  }, []);
  if (perm === "unsupported") return null;
  if (perm === "granted") {
    return (
      <span className="flex items-center gap-1 text-xs text-good" title="browser notifications on (muted types never pop)">
        <BellRing className="h-3.5 w-3.5" /> on
      </span>
    );
  }
  return (
    <button
      onClick={() => {
        requestNotifyPermission()
          .then(setPerm)
          .catch((e: unknown) => console.error("[alerts] notification permission request failed", e));
      }}
      className="flex items-center gap-1 rounded border border-neutral-700 px-2 py-0.5 text-xs hover:border-sky-500"
      title="pop a browser notification on new alerts — for a fullscreen game, set up Discord in Settings instead"
    >
      <Bell className="h-3.5 w-3.5" /> enable
    </button>
  );
}

/** Live alert strip for the Exchange tab: per-type counts with mute, and the newest unmuted alerts inline. */
export function AlertTicker() {
  const { data, error, groups, unseen, markSeen, setMuted } = useAlertCenter();
  const recent = data ? tickerRecent(data.alerts, data.tickerMuted, 3) : [];

  return (
    <section data-tour="alerts" className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {unseen > 0 ? <BellRing className="h-4 w-4 text-amber-300" /> : <Bell className="h-4 w-4 text-neutral-400" />}
          Alerts
          {unseen > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold text-neutral-950">{unseen}</span>}
          {error && (
            <span title={`alerts could not refresh: ${error}`}>
              <TriangleAlert className="h-3.5 w-3.5 text-bad" />
            </span>
          )}
        </span>

        {groups.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {groups.map((g) => (
              <TypeChip key={g.type} group={g} onMute={(muted) => void setMuted(g.type, muted)} />
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {unseen > 0 && (
            <button onClick={() => void markSeen({ all: true })} className="text-xs text-neutral-400 hover:text-neutral-100" title="mark every alert in this view seen">
              clear
            </button>
          )}
          <BrowserNotifyToggle />
        </div>
      </div>

      {recent.length === 0 ? (
        <p className="mt-1 text-xs text-neutral-500">none yet — fires when a watched REAL spread clears its threshold, a snipe or craft margin passes, or a trend flips</p>
      ) : (
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {recent.map((a) => (
            <span key={a.id} className={`flex min-w-0 items-center gap-1 ${a.seen === 0 ? "" : "opacity-60"}`}>
              <span className={`font-semibold ${typeTone(a.type)}`}>{a.type}</span>
              <span className="text-neutral-200">{a.item_name ?? a.item_id}</span>
              <LeagueTag league={a.foreign_league} />
              <span className="truncate text-neutral-500" title={a.message}>{a.message}</span>
              <AlertActions alert={a} />
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
