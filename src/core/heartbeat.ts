import { recordHeartbeat, type HeartbeatOutcome } from "../db/heartbeatQueries";
import type { SubsystemName } from "./subsystems";

/** Enough to identify a failure in a table cell; full context stays in journalctl. */
export const MAX_HEARTBEAT_ERROR_CHARS = 300;

/**
 * Error text reaches the owner panel verbatim, and trade2/axios errors can echo request headers.
 * A POESESSID is 32 hex characters; agent keys are pk_<hex>; the rest are header/assignment
 * shapes. Scrubbing is best-effort defence in depth — callers still must not put secrets in
 * error messages.
 */
const SECRET_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/POESESSID\s*[=:]\s*[^\s;,"']+/gi, "POESESSID=[redacted]"],
  [/\bBearer\s+[^\s,;"']+/gi, "Bearer [redacted]"],
  [/\b(cookie|authorization|password|secret|token)(\s*[=:]\s*)[^\s,;"']+/gi, "$1$2[redacted]"],
  [/\bpk_[A-Za-z0-9]+/g, "[redacted]"],
  [/\b[a-f0-9]{32,}\b/gi, "[redacted]"],
];

/** Message of anything thrown, with secrets scrubbed, whitespace collapsed and length capped. */
export function sanitizeHeartbeatError(error: unknown): string {
  let text = error instanceof Error ? error.message : String(error);
  for (const [pattern, replacement] of SECRET_PATTERNS) text = text.replace(pattern, replacement);
  text = text.replace(/\s+/g, " ").trim() || "unknown error";
  return text.length > MAX_HEARTBEAT_ERROR_CHARS ? `${text.slice(0, MAX_HEARTBEAT_ERROR_CHARS - 1)}…` : text;
}

export interface HeartbeatOptions<T> {
  /**
   * Several loops swallow their own failures and report them in the result instead (a patch
   * sync with errors, a craft tick that kept its previous report). Returning a message here
   * records that run as failed even though `fn` resolved.
   */
  problem?: (result: T) => string | null;
  /** Injectable for tests; defaults to the subsystem_heartbeat table. */
  record?: (outcome: HeartbeatOutcome) => void;
  now?: () => number;
}

/**
 * Run one iteration of a background loop and record its outcome. Errors are recorded and then
 * RETHROWN, so every caller keeps its existing logging and in-flight-guard cleanup.
 */
export async function withHeartbeat<T>(
  name: SubsystemName,
  league: string,
  fn: () => T | Promise<T>,
  options: HeartbeatOptions<T> = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  const record = options.record ?? recordHeartbeat;
  const started = now();
  const write = (error: string | null): void => {
    const at = now();
    // A failed heartbeat write must never cost the loop its run; log it loudly and move on.
    try {
      record({ name, league, at: new Date(at).toISOString(), durationMs: at - started, error });
    } catch (writeError: unknown) {
      console.error(`[heartbeat] could not record ${name}${league ? ` (${league})` : ""}:`, sanitizeHeartbeatError(writeError));
    }
  };
  let result: T;
  try {
    result = await fn();
  } catch (error: unknown) {
    write(sanitizeHeartbeatError(error));
    throw error;
  }
  const problem = options.problem?.(result) ?? null;
  write(problem == null ? null : sanitizeHeartbeatError(problem));
  return result;
}
