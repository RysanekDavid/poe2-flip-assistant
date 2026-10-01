"use client";

import Link from "next/link";
import { deliverySummary } from "../../lib/notifySummary";
import { DELIVERY_ANCHOR } from "../alerts/AlertDelivery";
import { useNotifyPermission } from "../alerts/DesktopNotifyControl";
import { useNotifySettings } from "../alerts/useNotifySettings";
import { TabArt } from "../shell/TabArt";
import { TAB_ICONS } from "../shell/tabIcons";
import { tabRouteHref } from "../shell/tabRegistry";

/**
 * Settings › Notifications: read-only delivery status and a way to the Alerts page, the single place
 * routing is edited. No toggles here, so there is one source of truth.
 */
export function NotificationsLink() {
  const [perm] = useNotifyPermission();
  const { view, error } = useNotifySettings();
  const status = view ? deliverySummary(perm, view).text : error ? `status unavailable — ${error}` : "loading…";
  return (
    <section className="rounded-lg border border-line bg-surface/60 p-4">
      <header className="mb-1 flex items-center gap-2">
        <TabArt src={TAB_ICONS.alerts} className="h-5 w-5 object-contain" />
        <h3 className="text-lg font-semibold text-neutral-100">Notifications</h3>
      </header>
      <p className={`mb-3 text-sm ${view == null && error ? "text-bad" : "text-neutral-400"}`}>{status}</p>
      <Link
        href={`${tabRouteHref({ tab: "alerts", tool: null })}#${DELIVERY_ANCHOR}`}
        prefetch={false}
        className="inline-flex h-9 items-center rounded-md bg-amber-400 px-3.5 text-sm font-medium text-neutral-950 transition-colors hover:bg-amber-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-200"
      >
        Open alert routing →
      </Link>
    </section>
  );
}
