/**
 * Env keys of removed features. A leftover key is ignored by the config, which would silently drop
 * an operator's intent (e.g. a tuned request floor) — so each boot names it instead.
 */
const RENAMED: Record<string, string> = {
  HUNT_MIN_REQUEST_MS: "TRADE_MIN_REQUEST_MS",
};

/** Whole features whose keys all share a prefix. */
const REMOVED_PREFIXES: Record<string, string> = {
  HUNT_: "the Hunt feature was removed",
};

const SNIPE_TARGETS_REMOVED = "snipe targets were removed — Trade › Opportunities";

/** Single keys whose feature is gone. */
const REMOVED_KEYS: Record<string, string> = {
  DESKTOP_NOTIFY: "server-side OS toasts were removed (popups are per-user browser notifications)",
  // SNIPE_MAX_TARGET_DIV stays: autosnipe candidates still use it
  SNIPE_MIN_LISTINGS: SNIPE_TARGETS_REMOVED,
  SNIPE_MAX_LISTINGS: SNIPE_TARGETS_REMOVED,
  SNIPE_MIN_TARGET_DIV: SNIPE_TARGETS_REMOVED,
  SNIPE_MIN_SAMPLE_LOGS: SNIPE_TARGETS_REMOVED,
};

function removalReason(key: string): string | null {
  const exact = REMOVED_KEYS[key];
  if (exact) return exact;
  const prefix = Object.keys(REMOVED_PREFIXES).find((p) => key.startsWith(p));
  return prefix ? (REMOVED_PREFIXES[prefix] ?? null) : null;
}

/** One warning per retired key present in `env` (pure — the caller decides where it goes). */
export function retiredEnvWarnings(env: Readonly<Record<string, string | undefined>>): string[] {
  return Object.keys(env)
    .filter((k) => env[k] != null && (RENAMED[k] != null || removalReason(k) != null))
    .sort()
    .map((k) => {
      const renamed = RENAMED[k];
      return renamed
        ? `[config] ${k} was renamed to ${renamed} — value ignored; set ${renamed} instead`
        : `[config] ${k} is set but ${removalReason(k)} — key ignored; delete it`;
    });
}
