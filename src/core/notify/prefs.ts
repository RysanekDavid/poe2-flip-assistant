import { z } from "zod";

/**
 * Alert types a user can route. Hunt hits are not a separate type: a hunt fires its own mode
 * (SNIPE / CRAFT_BASE / RESELL), so muting "SNIPE" covers hunt snipes and autosnipe alike.
 * Pure module (no node imports) — the Settings UI and the ticker import it too.
 */
export const NOTIFY_TYPES = ["SNIPE", "CRAFT_MARGIN", "SPREAD", "CRAFT_BASE", "RESELL", "LEAGUE", "TREND", "SPIKE"] as const;
export type NotifyType = (typeof NOTIFY_TYPES)[number];

export interface ChannelPrefs {
  discord: boolean;
  ticker: boolean;
}

/**
 * Discord is the channel that reaches a fullscreen player, so it only carries what is worth
 * alt-tabbing for: actionable, time-sensitive finds. TREND/SPIKE fire every few polls on a busy
 * market and were most of the 672-alerts-in-11-days fatigue — ticker only by default.
 */
const DEFAULTS: Record<NotifyType, ChannelPrefs> = {
  SNIPE: { discord: true, ticker: true },
  CRAFT_MARGIN: { discord: true, ticker: true },
  SPREAD: { discord: true, ticker: true },
  CRAFT_BASE: { discord: true, ticker: true }, // the user's own hunt — they asked for it
  RESELL: { discord: true, ticker: true }, // the user's own hunt — they asked for it
  LEAGUE: { discord: true, ticker: true }, // rare and it invalidates every price on screen
  TREND: { discord: false, ticker: true },
  SPIKE: { discord: false, ticker: true },
};

/** Types outside NOTIFY_TYPES (legacy VOLUME / TREND_REVERSAL rows) stay off Discord. */
const UNKNOWN_TYPE_DEFAULT: ChannelPrefs = { discord: false, ticker: true };

export function isNotifyType(type: string): type is NotifyType {
  return (NOTIFY_TYPES as readonly string[]).includes(type);
}

export function defaultPrefs(type: string): ChannelPrefs {
  return isNotifyType(type) ? DEFAULTS[type] : UNKNOWN_TYPE_DEFAULT;
}

export const NotifyTypeSchema = z.enum(NOTIFY_TYPES);

export const PrefRowSchema = z.object({
  type: NotifyTypeSchema,
  discord: z.boolean(),
  ticker: z.boolean(),
});
export type PrefRow = z.infer<typeof PrefRowSchema>;

/** Full per-type table for a user: stored overrides on top of the defaults, in display order. */
export function resolvePrefs(stored: ReadonlyArray<{ type: string; discord: number; ticker: number }>): PrefRow[] {
  const byType = new Map(stored.map((s) => [s.type, s]));
  return NOTIFY_TYPES.map((type) => {
    const row = byType.get(type);
    const base = DEFAULTS[type];
    return {
      type,
      discord: row ? row.discord === 1 : base.discord,
      ticker: row ? row.ticker === 1 : base.ticker,
    };
  });
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
