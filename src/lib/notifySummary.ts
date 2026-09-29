import type { NotifySettings } from "./notifySettings";

/** Browser popup permission as the page reads it; "unsupported" = no Notification API at all. */
export type PopupPermission = NotificationPermission | "unsupported";

export interface DeliverySummary {
  /** One status line, e.g. "Popups blocked · Discord on for 5 types · digest daily". */
  text: string;
  /** Any channel beyond the feed is set up: popups allowed or a Discord webhook saved. */
  configured: boolean;
}

function popupPart(perm: PopupPermission, popupTypes: number): string {
  switch (perm) {
    case "granted":
      return popupTypes > 0 ? `Popups on for ${popupTypes} ${popupTypes === 1 ? "type" : "types"}` : "Popups allowed, none routed";
    case "denied":
      return "Popups blocked by the browser";
    case "default":
      return "Popups not enabled";
    case "unsupported":
      return "No popups in this browser";
  }
}

function discordPart(view: NotifySettings): string {
  switch (view.webhook.state) {
    case "none":
      return "Discord off";
    case "unreadable":
      return "Discord webhook unreadable — paste it again";
    case "set": {
      const n = view.prefs.filter((p) => p.discord).length;
      return `Discord on for ${n} ${n === 1 ? "type" : "types"}`;
    }
  }
}

/**
 * How alerts leave the feed, in one line. The Alerts tab's Delivery disclosure and the Settings
 * link card both show it, so the two can never disagree about the same data.
 */
export function deliverySummary(perm: PopupPermission, view: NotifySettings): DeliverySummary {
  const popupTypes = view.prefs.filter((p) => p.popup).length;
  const parts = [popupPart(perm, popupTypes), discordPart(view)];
  if (view.digest && view.webhook.state === "set") parts.push("digest daily");
  return { text: parts.join(" · "), configured: perm === "granted" || view.webhook.state === "set" };
}
