"use client";

import { AlertsFeed } from "./AlertsFeed";
import { AlertDelivery } from "./AlertDelivery";
import { PageHeader } from "../ui/PageHeader";
import { TAB_ICONS } from "../shell/tabIcons";

/**
 * The Alerts page (the header bell's "All alerts & delivery"): the feed on the left, how alerts
 * reach you (the only place it is set) on the right.
 */
export function AlertsTab() {
  return (
    <>
      <PageHeader
        title="Alerts"
        purpose="See everything the scanners flagged for you, and choose where each kind of alert is delivered."
        legend="The bell counts only alerts you can act on — snipes, craft margins and exchange spreads. League, trend and spike alerts stay in this feed."
        art={TAB_ICONS.alerts.src}
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
