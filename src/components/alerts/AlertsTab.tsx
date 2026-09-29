"use client";

import { AlertsFeed } from "./AlertsFeed";
import { DesktopNotifyControl, useNotifyPermission, type NotifyPermission } from "./DesktopNotifyControl";
import { NotificationsSettings } from "./NotificationsSettings";
import { useAlertCenter } from "./AlertsContext";

function popupBlockedReason(perm: NotifyPermission): string | null {
  if (perm === "granted") return null;
  if (perm === "unsupported") return "this browser has no desktop notifications";
  if (perm === "denied") return "blocked by the browser — see Desktop popups above";
  return "allow desktop notifications above first";
}

/** How alerts reach you: browser permission plus the per-type routing grid. Also on Settings. */
export function AlertRouting() {
  const [perm, request] = useNotifyPermission();
  return (
    <>
      <DesktopNotifyControl perm={perm} request={request} />
      <NotificationsSettings popupBlocked={popupBlockedReason(perm)} />
    </>
  );
}

/** Alerts tab: the feed on the left, how alerts reach you on the right. */
export function AlertsTab() {
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
      <AlertsFeed />
      <aside className="space-y-4 lg:sticky lg:top-[var(--shell-h,9rem)]">
        <AlertRouting />
      </aside>
    </div>
  );
}

/** Unseen count on the Alerts tab button (every type — this is where muted ones are read). */
export function AlertsTabBadge() {
  const { groups } = useAlertCenter();
  const n = groups.reduce((sum, g) => sum + g.unseen, 0);
  if (n === 0) return null;
  return <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-bold leading-4 text-neutral-950">{n > 99 ? "99+" : n}</span>;
}
