import type { Channel, NotifyType } from "../core/notify/prefs";

/** Human names for alert types — the stored codes (CRAFT_MARGIN, SNIPE) never reach the UI. */
export const ALERT_TYPE_LABEL: Record<NotifyType, string> = {
  SNIPE: "Snipe",
  CRAFT_MARGIN: "Craft margin",
  SPREAD: "Exchange spread",
  LEAGUE: "League",
  PATCH: "Patch notes",
  TREND: "Trend",
  SPIKE: "Spike",
};

// Types the engine no longer fires but old rows still carry.
const LEGACY_TYPE_LABEL: Record<string, string> = {
  VOLUME: "Volume",
  TREND_REVERSAL: "Trend reversal",
};

function isLabelled(type: string): type is NotifyType {
  return Object.hasOwn(ALERT_TYPE_LABEL, type);
}

/** Label for any stored type; an unknown code is shown as-is so a new type is visible, not hidden. */
export function alertTypeLabel(type: string): string {
  if (isLabelled(type)) return ALERT_TYPE_LABEL[type];
  return LEGACY_TYPE_LABEL[type] ?? type;
}

/** Delivery channels as the routing grid and ticker name them. */
export const CHANNEL_LABEL: Record<Channel, string> = {
  ticker: "Feed",
  sound: "Sound",
  popup: "Popup",
  discord: "Discord",
};
