"use client";

import { AlertsFeed } from "./AlertsFeed";
import { AlertDelivery } from "./AlertDelivery";
import { useAlertCenter } from "./AlertsContext";
import { PageHeader } from "../ui/PageHeader";

/** Alerts tab: the feed on the left, how alerts reach you (the only place it is set) on the right. */
export function AlertsTab() {
  return (
    <>
      <PageHeader
        title="Alerts"
        purpose="Everything the scanners flagged for you, and where each kind of alert is delivered."
        legend="The bell counts only alerts you can act on — snipes, craft margins and exchange spreads. League, trend and spike alerts stay in this feed."
      />
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
        <AlertsFeed />
        <aside className="lg:sticky lg:top-[var(--shell-h,9rem)]">
          <AlertDelivery />
        </aside>
      </div>
    </>
  );
}

/** Unseen count on the Alerts tab button (every type — this is where muted ones are read). */
export function AlertsTabBadge() {
  const { groups } = useAlertCenter();
  const n = groups.reduce((sum, g) => sum + g.unseen, 0);
  if (n === 0) return null;
  return <span className="rounded-full bg-amber-400 px-1.5 text-xs font-bold leading-4 text-neutral-950">{n > 99 ? "99+" : n}</span>;
}
