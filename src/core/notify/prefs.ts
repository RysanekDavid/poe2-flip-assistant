import { z } from "zod";

/**
 * Alert types a user can route. Pure module (no node imports) — the Alerts tab and the ticker
 * import it too.
 */
export const NOTIFY_TYPES = ["SNIPE", "CRAFT_MARGIN", "SPREAD", "LEAGUE", "PATCH", "TREND", "SPIKE"] as const;
export type NotifyType = (typeof NOTIFY_TYPES)[number];

/** Delivery channels per alert type. `sound` and `popup` are the browser chime and desktop popup. */
export const CHANNELS = ["ticker", "sound", "popup", "discord"] as const;
export type Channel = (typeof CHANNELS)[number];
export type ChannelPrefs = Record<Channel, boolean>;

/**
 * Discord is the channel that reaches a fullscreen player, so it only carries what is worth
 * alt-tabbing for: actionable, time-sensitive finds. TREND/SPIKE fire every few polls on a busy
 * market and were most of the 672-alerts-in-11-days fatigue — ticker only by default. Sound and
 * the desktop popup interrupt whatever the player is doing, so only a snipe (gone in minutes)
 * earns them by default.
 */
const DEFAULTS: Record<NotifyType, ChannelPrefs> = {
  SNIPE: { ticker: true, sound: true, popup: true, discord: true },
  CRAFT_MARGIN: { ticker: true, sound: false, popup: false, discord: true },
  SPREAD: { ticker: true, sound: false, popup: false, discord: true },
  LEAGUE: { ticker: true, sound: false, popup: false, discord: true }, // rare and it invalidates every price on screen
  PATCH: { ticker: true, sound: false, popup: false, discord: true }, // a few a week; balance/loot changes move prices
  TREND: { ticker: true, sound: false, popup: false, discord: false },
  SPIKE: { ticker: true, sound: false, popup: false, discord: false },
};

/** Types outside NOTIFY_TYPES (legacy VOLUME / TREND_REVERSAL rows): ticker only. */
const UNKNOWN_TYPE_DEFAULT: ChannelPrefs = { ticker: true, sound: false, popup: false, discord: false };

export function isNotifyType(type: string): type is NotifyType {
  return (NOTIFY_TYPES as readonly string[]).includes(type);
}

export function defaultPrefs(type: string): ChannelPrefs {
  return isNotifyType(type) ? DEFAULTS[type] : UNKNOWN_TYPE_DEFAULT;
}

export const NotifyTypeSchema = z.enum(NOTIFY_TYPES);

export const PrefRowSchema = z.object({
  type: NotifyTypeSchema,
  ticker: z.boolean(),
  sound: z.boolean(),
  popup: z.boolean(),
  discord: z.boolean(),
});
export type PrefRow = z.infer<typeof PrefRowSchema>;

/** A stored notify_prefs row. sound/popup are NULL on rows written before those columns existed. */
export interface StoredPref {
  type: string;
  ticker: number;
  sound: number | null;
  popup: number | null;
  discord: number;
}

const flag = (stored: number | null | undefined, fallback: boolean): boolean => (stored == null ? fallback : stored === 1);

/** Full per-type table for a user: stored overrides on top of the defaults, in display order. */
export function resolvePrefs(stored: readonly StoredPref[]): PrefRow[] {
  const byType = new Map(stored.map((s) => [s.type, s]));
  return NOTIFY_TYPES.map((type) => {
    const row = byType.get(type);
    const base = DEFAULTS[type];
    return {
      type,
      ticker: flag(row?.ticker, base.ticker),
      sound: flag(row?.sound, base.sound),
      popup: flag(row?.popup, base.popup),
      discord: flag(row?.discord, base.discord),
    };
  });
}

/** Types whose `channel` is on — what the browser needs to decide chime / popup / ticker. */
export function typesWith(prefs: readonly PrefRow[], channel: Channel, on: boolean): NotifyType[] {
  return prefs.filter((p) => p[channel] === on).map((p) => p.type);
}

/**
 * SQL expression for the default Discord routing of `typeExpr` — the enqueue trigger needs the
 * defaults inside SQLite. Generated from DEFAULTS so the two can never disagree; the type names
 * are compile-time constants, asserted to be plain identifiers before interpolation.
 */
export function defaultDiscordSql(typeExpr: string): string {
  const arms = NOTIFY_TYPES.map((t) => {
    if (!/^[A-Z_]+$/.test(t)) throw new Error(`notify type ${t} is not a plain identifier`);
    return `WHEN '${t}' THEN ${DEFAULTS[t].discord ? 1 : 0}`;
  });
  return `CASE ${typeExpr} ${arms.join(" ")} ELSE ${UNKNOWN_TYPE_DEFAULT.discord ? 1 : 0} END`;
}
