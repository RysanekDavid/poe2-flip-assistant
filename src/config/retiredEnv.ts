/**
 * Env keys of removed features. A leftover key is ignored by the config, which would silently drop
 * an operator's intent (e.g. a tuned request floor) — so each boot names it instead.
 */
const RENAMED: Record<string, string> = {
  HUNT_MIN_REQUEST_MS: "TRADE_MIN_REQUEST_MS",
};

/** One warning per retired key present in `env` (pure — the caller decides where it goes). */
export function retiredEnvWarnings(env: Readonly<Record<string, string | undefined>>): string[] {
  return Object.keys(env)
    .filter((k) => k.startsWith("HUNT_") && env[k] != null)
    .sort()
    .map((k) => {
      const renamed = RENAMED[k];
      return renamed
        ? `[config] ${k} was renamed to ${renamed} — value ignored; set ${renamed} instead`
        : `[config] ${k} is set but the Hunt feature was removed — key ignored; delete it`;
    });
}
