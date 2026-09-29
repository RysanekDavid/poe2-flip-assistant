"use client";

import { TriangleAlert, Bell, BellRing } from "lucide-react";
import { useAlertCenter } from "./alerts/AlertsContext";
import { AlertActions, LeagueTag, typeTone } from "./alerts/AlertBits";
import { alertTypeLabel } from "../lib/alertLabels";
import { tickerRecent, type Alert } from "../lib/alertCenter";
import { Button } from "./ui/Button";

function TickerItem({ a }: { a: Alert }) {
  return (
    <span className={`flex min-w-0 max-w-[26rem] items-center gap-1.5 ${a.seen === 0 ? "" : "opacity-70"}`}>
      <span className={`shrink-0 font-semibold ${typeTone(a.type)}`}>{alertTypeLabel(a.type)}</span>
      <span className="shrink-0 text-neutral-100">{a.item_name ?? a.item_id}</span>
      <LeagueTag league={a.foreign_league} />
      <span className="min-w-0 truncate text-neutral-400" title={a.message}>{a.message}</span>
      <AlertActions alert={a} />
    </span>
  );
}

/**
 * One-line alert strip for the Exchange tab: unseen count and the newest alerts of types shown in
 * the feed. Per-type muting and routing live in the Alerts tab, not here.
 */
export function AlertTicker() {
  const { data, error, unseen, markSeen } = useAlertCenter();
  const recent = data ? tickerRecent(data.alerts, data.tickerMuted, 2) : [];

  return (
    <section data-tour="alerts" aria-label="latest alerts" className="flex h-10 min-w-0 items-center gap-3 overflow-hidden rounded-lg border border-line bg-neutral-900/50 px-3 text-xs">
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-neutral-100">
        {unseen > 0 ? <BellRing aria-hidden className="h-4 w-4 text-amber-300" /> : <Bell aria-hidden className="h-4 w-4 text-neutral-400" />}
        Alerts
        {unseen > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-bold text-neutral-950">{unseen}</span>}
        {error && (
          <span title={`alerts could not refresh: ${error}`} role="img" aria-label="alerts could not refresh">
            <TriangleAlert className="h-3.5 w-3.5 text-bad" />
          </span>
        )}
      </span>
      {recent.length === 0 ? (
        <span className="truncate text-neutral-400">Nothing yet — snipes, craft margins and watched spreads that clear their threshold land here.</span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
          {recent.map((a) => <TickerItem key={a.id} a={a} />)}
        </span>
      )}
      {unseen > 0 && (
        <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void markSeen({ all: true })} title="mark every alert in this view seen">
          mark seen
        </Button>
      )}
    </section>
  );
}
