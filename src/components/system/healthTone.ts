import type { HeartbeatStatus, SystemHealth } from "../../lib/systemHealthContract";

/**
 * Tone rules for the owner System section. Red is reserved for "something is broken or about to
 * break" (a failing/stale loop, Coach down, trade2 restricted, disk nearly full) so it stays
 * meaningful; amber is "worth a look"; everything healthy stays neutral.
 */
export type Tone = "ok" | "warn" | "bad" | "muted";

export const TONE_TEXT: Record<Tone, string> = {
  ok: "text-neutral-200",
  warn: "text-warn",
  bad: "text-bad",
  muted: "text-neutral-500",
};

export const TONE_DOT: Record<Tone, string> = {
  ok: "bg-good/70",
  warn: "bg-warn",
  bad: "bg-bad",
  muted: "bg-neutral-600",
};

export const STATUS_TONE: Record<HeartbeatStatus, Tone> = {
  ok: "ok",
  failing: "bad",
  stale: "bad",
  never: "warn",
  idle: "muted",
  disabled: "muted",
};

const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

export function formatBytes(bytes: number): string {
  if (bytes >= GIB) return `${(bytes / GIB).toFixed(1)} GB`;
  return `${(bytes / MIB).toFixed(bytes >= 100 * MIB ? 0 : 1)} MB`;
}

/** "42s" / "7m" / "3h" / "2d" since an ISO timestamp; "—" when absent or unparseable. */
export function ageOf(iso: string | null, nowMs: number): string {
  if (iso == null) return "—";
  const ms = nowMs - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return formatSeconds(Math.max(0, ms / 1000));
}

export function formatSeconds(sec: number): string {
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86_400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86_400)}d`;
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  return ms < 1000 ? `${ms}ms` : formatSeconds(ms / 1000);
}

/** A freelist is only worth mentioning once it is both proportionally and absolutely large. */
export function dbTone(db: SystemHealth["db"]): Tone {
  const freeBytes = db.freelistCount * db.pageSize;
  return db.pageCount > 0 && db.freelistCount / db.pageCount > 0.5 && freeBytes > 50 * MIB ? "warn" : "ok";
}

/** Red under 1 GB; amber when the monthly VACUUM would refuse for lack of 2× headroom. */
export function diskTone(health: Pick<SystemHealth, "db" | "disk">): Tone {
  const free = health.disk.freeBytes;
  if (free == null) return "bad";
  if (free < GIB) return "bad";
  return free < 2 * (health.db.fileBytes + health.db.walBytes) ? "warn" : "ok";
}

export function coachTone(coach: SystemHealth["coach"]): Tone {
  if (!coach.reachable || !coach.marketReady) return "bad";
  return coach.status === "degraded" || coach.marketFresh === false ? "warn" : "ok";
}

export function tradeTone(gov: SystemHealth["trade2"][number], nowMs: number): Tone {
  if (gov.blockedUntil != null && Date.parse(gov.blockedUntil) > nowMs) return "bad";
  return gov.windows.some((w) => w.limit > 0 && w.used / w.limit >= 0.8) ? "warn" : "ok";
}
