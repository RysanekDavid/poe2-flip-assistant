"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { deliverySummary, type PopupPermission } from "../../lib/notifySummary";
import { TabArt } from "../shell/TabArt";
import { TAB_ICONS } from "../shell/tabIcons";
import { DesktopNotifyControl, useNotifyPermission } from "./DesktopNotifyControl";
import { NotificationsSettings } from "./NotificationsSettings";
import { useNotifySettings } from "./useNotifySettings";

/** Anchor the Settings › Notifications card links to (`?tab=alerts#alerts-delivery`). */
export const DELIVERY_ANCHOR = "alerts-delivery";

function popupBlockedReason(perm: PopupPermission): string | null {
  if (perm === "granted") return null;
  if (perm === "unsupported") return "this browser has no desktop notifications";
  if (perm === "denied") return "blocked by the browser — see Desktop popups above";
  return "allow desktop notifications above first";
}

/** True when the page was opened on the delivery anchor; it then opens and scrolls into view. */
function useDeepLinked(): boolean {
  const [linked, setLinked] = useState(false);
  useEffect(() => {
    const check = (): void => {
      if (window.location.hash !== `#${DELIVERY_ANCHOR}`) return;
      setLinked(true);
      requestAnimationFrame(() => document.getElementById(DELIVERY_ANCHOR)?.scrollIntoView({ block: "start" }));
    };
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  return linked;
}

function Art() {
  const icon = TAB_ICONS.alerts;
  if (icon.kind === "glyph") return <icon.Icon aria-hidden className="h-5 w-5 text-amber-200/80" />;
  return <TabArt icon={icon} className="h-5 w-5 object-contain" />;
}

/**
 * How alerts leave the feed: browser popups plus the per-type routing grid and Discord. The one
 * home of these settings (Settings links here). Collapsed once a channel is set up, so the feed
 * gets the width; the summary line keeps the state visible while closed.
 */
export function AlertDelivery() {
  const [perm, request] = useNotifyPermission();
  const settings = useNotifySettings();
  const linked = useDeepLinked();
  const [choice, setChoice] = useState<boolean | null>(null);
  const bodyId = useId();
  const summary = settings.view ? deliverySummary(perm, settings.view) : null;
  const open = choice ?? (linked || (summary != null && !summary.configured));
  const status = summary?.text ?? (settings.error ? `unavailable — ${settings.error}` : "loading…");
  return (
    <section id={DELIVERY_ANCHOR} className="scroll-mt-[var(--shell-h,0px)] space-y-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setChoice(!open)}
        className="flex w-full items-start gap-2.5 rounded-lg border border-line bg-surface/60 px-4 py-3 text-left hover:border-neutral-600"
      >
        <Art />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-base font-semibold text-neutral-100">Delivery</span>
          <span className={`text-xs ${summary == null && settings.error ? "text-bad" : "text-neutral-400"}`}>{status}</span>
        </span>
        <ChevronDown aria-hidden className={`mt-1 h-4 w-4 shrink-0 text-neutral-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {/* hidden, not unmounted: a half-typed webhook URL must survive a collapse */}
      <div id={bodyId} hidden={!open} className="space-y-4">
        <DesktopNotifyControl perm={perm} request={request} />
        <NotificationsSettings popupBlocked={popupBlockedReason(perm)} settings={settings} />
      </div>
    </section>
  );
}
