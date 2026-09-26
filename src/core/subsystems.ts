import { config } from "../config/env";
import type { HeartbeatRow } from "../db/heartbeatQueries";
import type { HeartbeatStatus, HeartbeatView } from "../lib/systemHealthContract";

/** Every background loop the poller records a heartbeat for. */
export const SUBSYSTEM_NAMES = [
  "ninja-sweep",
  "cx-rates",
  "cx-history",
  "prune",
  "hunts",
  "autosnipe",
  "craft-margin",
  "craft-sweep",
  "balance",
  "unique-values",
  "patch-notes",
  "league-watch",
  "scan-drain",
] as const;
export type SubsystemName = (typeof SUBSYSTEM_NAMES)[number];

export interface SubsystemSpec {
  label: string;
  hint: string;
  /** One heartbeat row per polled league instead of one global row. */
  perLeague: boolean;
  /** Expected seconds between runs; null = on demand only, never stale. */
  expectedSec: number | null;
  enabled: boolean;
}

/** The slice of config the registry reads — injectable so tests can flip loops on and off. */
export type SubsystemConfig = Pick<
  typeof config,
  "pollIntervalMin" | "hunt" | "autoSnipe" | "craftMargin" | "balanceIntervalMin" | "patchNotes"
>;

/** Mirrors the league watcher's fixed 6h check; kept here so the registry has no poller import. */
const LEAGUE_WATCH_SEC = 6 * 60 * 60;
const SCAN_DRAIN_SEC = 20;

/**
 * One hunt costs ~40s of the shared trade2 search pace (see config.hunt), and the heartbeat is
 * written once per LAP, so a lap over N active hunts takes ~N×40s however small scanSec is.
 */
export const HUNT_LAP_SEC_PER_HUNT = 40;

/** Expected seconds between hunt heartbeats: the configured tick, or the lap time if longer. */
export function huntExpectedSec(scanSec: number, activeHunts: number): number {
  return Math.max(scanSec, Math.max(0, activeHunts) * HUNT_LAP_SEC_PER_HUNT);
}

/** Live facts the cadences depend on, read when the payload is built. */
export interface SubsystemLoad {
  activeHunts: number;
}

/** Cadences come from the same config the poller schedules with, so they cannot drift apart. */
export function subsystemSpecs(
  cfg: SubsystemConfig = config,
  load: SubsystemLoad = { activeHunts: 0 },
): Record<SubsystemName, SubsystemSpec> {
  const cycle = cfg.pollIntervalMin * 60;
  const balance = cfg.balanceIntervalMin > 0 ? cfg.balanceIntervalMin * 60 : null;
  return {
    "ninja-sweep": { label: "poe.ninja sweep", hint: "Fetch + store every ninja category for a polled league, then evaluate watchlist alerts.", perLeague: true, expectedSec: cycle, enabled: true },
    "cx-rates": { label: "Exchange rates", hint: "GGG currency-exchange digest → Div/Ex/Chaos rates (only fetched when stored rates are stale).", perLeague: false, expectedSec: cycle, enabled: true },
    "cx-history": { label: "Exchange history", hint: "Backfill missing hours of GGG exchange history for Top Flips.", perLeague: false, expectedSec: cycle, enabled: true },
    prune: { label: "Retention prune", hint: "Age out old snapshots, observations, craft EV history and exchange hours.", perLeague: false, expectedSec: cycle, enabled: true },
    hunts: { label: "Hunt scans", hint: "Per-user saved trade2 searches (poll-diff). A lap takes ~40s per active hunt.", perLeague: false, expectedSec: huntExpectedSec(cfg.hunt.scanSec, load.activeHunts), enabled: cfg.hunt.enabled },
    autosnipe: { label: "Auto-snipe", hint: "Autonomous rare-snipe scan under the owner's POESESSID.", perLeague: false, expectedSec: cfg.autoSnipe.intervalMin * 60, enabled: cfg.autoSnipe.enabled },
    "craft-margin": { label: "Craft margin tick", hint: "Refresh the stalest craft recipe's EV from trade2.", perLeague: false, expectedSec: cfg.craftMargin.intervalMin * 60, enabled: cfg.craftMargin.enabled },
    "craft-sweep": { label: "Craft refresh-all", hint: "Owner-requested sweep of every recipe (on demand).", perLeague: false, expectedSec: null, enabled: cfg.craftMargin.enabled },
    balance: { label: "Balance auto-read", hint: "Per-user net-worth snapshot from public stash listings.", perLeague: false, expectedSec: balance, enabled: balance != null },
    "unique-values": { label: "Unique prices", hint: "Daily poe2scout unique-price cache used to value showcase gear.", perLeague: false, expectedSec: balance, enabled: balance != null },
    "patch-notes": { label: "Patch notes", hint: "Official PoE2 patch-notes watcher feeding Coach patch reviews.", perLeague: false, expectedSec: cfg.patchNotes.intervalMin * 60, enabled: cfg.patchNotes.enabled },
    "league-watch": { label: "League watcher", hint: "poe.ninja proposes, poe2scout confirms a new challenge league.", perLeague: false, expectedSec: LEAGUE_WATCH_SEC, enabled: true },
    "scan-drain": { label: "Manual scan queue", hint: "Runs hunt/auto-snipe scans the web queued, on the poller's trade2 limiter.", perLeague: false, expectedSec: SCAN_DRAIN_SEC, enabled: true },
  };
}

/**
 * Generous on purpose: busy trade2 laps legitimately stretch a loop well past its nominal cadence,
 * and a false red teaches the owner to ignore the panel. Three missed runs, and never under 15m.
 */
export function staleAfterSec(expectedSec: number): number {
  return Math.max(expectedSec * 3, expectedSec + 15 * 60);
}

const isSubsystem = (name: string): name is SubsystemName => (SUBSYSTEM_NAMES as readonly string[]).includes(name);

function ageSec(iso: string | null, nowMs: number): number | null {
  if (iso == null) return null;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? (nowMs - at) / 1000 : null;
}

/** Status of one row. `spec` is null for a name the registry no longer knows (renamed loop). */
export function deriveHeartbeatStatus(
  row: Pick<HeartbeatRow, "league" | "last_ok_at" | "last_error_at">,
  spec: SubsystemSpec | null,
  polledLeagues: readonly string[],
  nowMs: number,
): HeartbeatStatus {
  if (spec != null && !spec.enabled) return "disabled";
  if (spec?.perLeague && !polledLeagues.some((l) => l.toLowerCase() === row.league.toLowerCase())) return "idle";
  const okAge = ageSec(row.last_ok_at, nowMs);
  const errAge = ageSec(row.last_error_at, nowMs);
  if (errAge != null && (okAge == null || errAge < okAge)) return "failing";
  if (okAge == null) return "never";
  if (spec?.expectedSec != null && okAge > staleAfterSec(spec.expectedSec)) return "stale";
  return "ok";
}

function emptyRow(name: string, league: string): HeartbeatRow {
  return { name, league, last_ok_at: null, last_error_at: null, last_error: null, duration_ms: null, runs: 0 };
}

/**
 * Stored rows plus a synthetic "never" row for every enabled SCHEDULED loop that has not reported
 * yet. On-demand loops (expectedSec null, e.g. craft refresh-all) not having run is normal, so
 * they only appear once they have a real row.
 */
function withMissingRows(
  rows: readonly HeartbeatRow[],
  specs: Record<SubsystemName, SubsystemSpec>,
  polledLeagues: readonly string[],
): HeartbeatRow[] {
  const key = (name: string, league: string): string => `${name}|${league.toLowerCase()}`;
  const have = new Set(rows.map((r) => key(r.name, r.league)));
  const missing: HeartbeatRow[] = [];
  for (const name of SUBSYSTEM_NAMES) {
    const spec = specs[name];
    if (!spec.enabled || spec.expectedSec == null) continue;
    for (const league of spec.perLeague ? polledLeagues : [""]) {
      if (!have.has(key(name, league))) missing.push(emptyRow(name, league));
    }
  }
  return [...rows, ...missing];
}

const ORDER = new Map<string, number>(SUBSYSTEM_NAMES.map((n, i) => [n, i]));

/** The panel's rows: registry order, then league; unknown names last. */
export function buildHeartbeatViews(
  rows: readonly HeartbeatRow[],
  specs: Record<SubsystemName, SubsystemSpec>,
  polledLeagues: readonly string[],
  nowMs: number,
): HeartbeatView[] {
  return withMissingRows(rows, specs, polledLeagues)
    .map((row): HeartbeatView => {
      const spec = isSubsystem(row.name) ? specs[row.name] : null;
      return {
        name: row.name,
        label: spec?.label ?? row.name,
        hint: spec?.hint ?? "No longer registered — a renamed or removed loop.",
        league: row.league,
        status: deriveHeartbeatStatus(row, spec, polledLeagues, nowMs),
        lastOkAt: row.last_ok_at,
        lastErrorAt: row.last_error_at,
        lastError: row.last_error,
        durationMs: row.duration_ms,
        runs: row.runs,
        expectedSec: spec?.expectedSec ?? null,
        staleAfterSec: spec?.expectedSec != null ? staleAfterSec(spec.expectedSec) : null,
      };
    })
    .sort((a, b) => (ORDER.get(a.name) ?? 99) - (ORDER.get(b.name) ?? 99) || a.league.localeCompare(b.league));
}
