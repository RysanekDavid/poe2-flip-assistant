import type Database from "better-sqlite3";
import { DEFAULT_RULES, type RateStore, type TradeEndpoint } from "../api/tradeRateLimit";
import { config } from "../config/env";
import { getDb } from "../db/database";
import { listHeartbeats } from "../db/heartbeatQueries";
import { getHunts } from "../db/huntQueries";
import { freeDiskBytes, readDbStats } from "../db/maintenance";
import { dbRateStore } from "../db/tradeRateQueries";
import { buildIdentifier } from "../lib/buildInfo";
import { coachHealthSchema } from "../lib/coachContract";
import { coachEndpoint } from "../lib/coachServer";
import type { CoachSummary, SystemHealth, TradeGovernorView } from "../lib/systemHealthContract";
import { getPolledLeagues } from "./leagueUsers";
import { buildHeartbeatViews, subsystemSpecs, type SubsystemName, type SubsystemSpec } from "./subsystems";

/** A health panel that hangs on a dead Coach is worse than one that says it is dead. */
const COACH_TIMEOUT_MS = 5_000;

export interface SystemHealthDeps {
  db: Database.Database;
  dbPath: string;
  nowMs: number;
  build: string;
  specs: Record<SubsystemName, SubsystemSpec>;
  polledLeagues: string[];
  rateStore: RateStore;
  freeDisk: (path: string) => number;
  coach: () => Promise<CoachSummary>;
}

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Coach /health, condensed. Unreachable or off-contract is reported, never thrown. */
export async function fetchCoachSummary(fetchImpl: typeof fetch = fetch): Promise<CoachSummary> {
  try {
    const response = await fetchImpl(coachEndpoint(config.coach.apiUrl, "/health"), {
      cache: "no-store",
      signal: AbortSignal.timeout(COACH_TIMEOUT_MS),
    });
    if (!response.ok) return { reachable: false, error: `Coach /health answered HTTP ${response.status}` };
    const parsed = coachHealthSchema.safeParse(await response.json());
    if (!parsed.success) return { reachable: false, error: "Coach /health response does not match the contract" };
    const h = parsed.data;
    return {
      reachable: true,
      status: h.status,
      model: h.model,
      marketReady: h.market_ready,
      marketFresh: h.market_fresh ?? null,
      knowledgeReady: h.knowledge_ready,
      modelConfigured: h.model_configured,
      agentReady: h.agent_ready ?? null,
      patchMonitorReady: h.patch_monitor_ready,
      pendingPatchReviews: h.pending_patch_reviews,
    };
  } catch (error: unknown) {
    console.error("[system-health] Coach health check failed:", message(error));
    return { reachable: false, error: message(error) };
  }
}

/** The shared trade2 governor as both processes see it: restriction + use of every window. */
export function tradeGovernorState(store: RateStore, nowMs: number): TradeGovernorView[] {
  const kinds: TradeEndpoint[] = ["search", "fetch"];
  return kinds.map((kind) => {
    const policy = store.policy(kind);
    const rules = policy && policy.rules.length > 0 ? policy.rules : DEFAULT_RULES[kind];
    const blockedUntil = policy?.blockedUntil ?? 0;
    return {
      kind,
      blockedUntil: blockedUntil > nowMs ? new Date(blockedUntil).toISOString() : null,
      windows: rules.map((r) => ({
        periodSec: r.periodSec,
        limit: r.hits,
        used: store.hits(kind, nowMs - r.periodSec * 1000).length,
      })),
    };
  });
}

function diskState(deps: SystemHealthDeps): SystemHealth["disk"] {
  try {
    return { freeBytes: deps.freeDisk(deps.dbPath), error: null };
  } catch (error: unknown) {
    console.error("[system-health] free-disk probe failed:", message(error));
    return { freeBytes: null, error: message(error) };
  }
}

function liveDeps(): SystemHealthDeps {
  return {
    db: getDb(),
    dbPath: config.dbPath,
    nowMs: Date.now(),
    build: buildIdentifier(),
    // Hunt laps stretch with the number of active hunts, so the stale window must too.
    specs: subsystemSpecs(config, { activeHunts: getHunts(true).length }),
    polledLeagues: getPolledLeagues(),
    rateStore: dbRateStore(),
    freeDisk: freeDiskBytes,
    coach: () => fetchCoachSummary(),
  };
}

/** Everything the owner System section shows, in one payload. */
export async function buildSystemHealth(deps: SystemHealthDeps = liveDeps()): Promise<SystemHealth> {
  const coach = await deps.coach();
  return {
    generatedAt: new Date(deps.nowMs).toISOString(),
    build: deps.build,
    heartbeats: buildHeartbeatViews(listHeartbeats(deps.db), deps.specs, deps.polledLeagues, deps.nowMs),
    db: readDbStats(deps.db, deps.dbPath),
    disk: diskState(deps),
    coach,
    trade2: tradeGovernorState(deps.rateStore, deps.nowMs),
  };
}
