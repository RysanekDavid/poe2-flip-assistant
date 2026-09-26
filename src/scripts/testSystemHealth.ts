/* System Health payload pieces for test:system — governor view, Coach summary, owner gate. */
import assert from "node:assert/strict";
import type { RateRule, RateStore, TradeEndpoint } from "../api/tradeRateLimit";
import { config } from "../config/env";
import { getDb } from "../db/database";
import { recordHeartbeat } from "../db/heartbeatQueries";
import { buildSystemHealth, fetchCoachSummary, systemHealthResponse, tradeGovernorState } from "../core/systemHealth";
import { subsystemSpecs } from "../core/subsystems";
import { systemHealthSchema, type SystemHealth } from "../lib/systemHealthContract";

const NOW = Date.parse("2026-09-26T12:00:00.000Z");

/** In-memory RateStore: `policy` per kind + hit timestamps. */
function memoryStore(policies: Partial<Record<TradeEndpoint, { rules: RateRule[]; blockedUntil: number }>>, hits: number[]): RateStore {
  return {
    atomically: (fn) => fn(),
    hits: (_kind, sinceMs) => hits.filter((t) => t > sinceMs),
    addHits: () => undefined,
    policy: (kind) => policies[kind] ?? null,
    savePolicy: () => undefined,
    prune: () => undefined,
  };
}

export function testGovernorState(): void {
  const rules: RateRule[] = [
    { hits: 5, periodSec: 10, restrictSec: 60 },
    { hits: 30, periodSec: 300, restrictSec: 1800 },
  ];
  const store = memoryStore(
    { search: { rules, blockedUntil: NOW + 90_000 }, fetch: { rules: [], blockedUntil: NOW - 1 } },
    [NOW - 5_000, NOW - 60_000, NOW - 200_000, NOW - 400_000],
  );
  const [search, fetchKind] = tradeGovernorState(store, NOW);
  assert.equal(search?.blockedUntil, new Date(NOW + 90_000).toISOString(), "an active restriction is reported");
  assert.deepEqual(search?.windows, [
    { periodSec: 10, limit: 5, used: 1 },
    { periodSec: 300, limit: 30, used: 3 },
  ]);
  assert.equal(fetchKind?.blockedUntil, null, "an expired restriction is not");
  assert.ok((fetchKind?.windows.length ?? 0) > 0, "empty stored rules fall back to the default policy");
  console.log("PASS  trade2 governor view (restriction + per-window use)");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const COACH_OK = {
  status: "degraded",
  market_ready: true,
  market_fresh: false,
  knowledge_ready: true,
  item_data_ready: true,
  model_configured: true,
  web_search_ready: false,
  model: "test-model",
  patch_monitor_ready: true,
  game_data_patch: null,
  latest_official_patch: null,
  recommendations_ready: true,
  pending_patch_reviews: 2,
};

export async function testCoachSummary(): Promise<void> {
  const up = await fetchCoachSummary(async () => jsonResponse(COACH_OK));
  assert.deepEqual(up, {
    reachable: true,
    status: "degraded",
    model: "test-model",
    marketReady: true,
    marketFresh: false,
    knowledgeReady: true,
    modelConfigured: true,
    agentReady: null,
    patchMonitorReady: true,
    pendingPatchReviews: 2,
  });
  const down = await fetchCoachSummary(async () => jsonResponse({ error: "x" }, 503));
  assert.deepEqual(down, { reachable: false, error: "Coach /health answered HTTP 503" });
  const offContract = await fetchCoachSummary(async () => jsonResponse({ status: "ok" }));
  assert.equal(offContract.reachable, false, "an off-contract body is not 'reachable'");
  const refused = await fetchCoachSummary(async () => Promise.reject(new Error("ECONNREFUSED")));
  assert.deepEqual(refused, { reachable: false, error: "ECONNREFUSED" });
  console.log("PASS  Coach /health summary (ok, HTTP error, off-contract, unreachable)");
}

async function ownerPayload(): Promise<SystemHealth> {
  const db = getDb();
  db.exec("DELETE FROM subsystem_heartbeat");
  recordHeartbeat({ name: "hunts", league: "", at: new Date(NOW - 5_000).toISOString(), durationMs: 900, error: "every hunt failed — x: 401" }, db);
  return buildSystemHealth({
    db,
    dbPath: config.dbPath,
    nowMs: NOW,
    build: "abc123def456",
    specs: subsystemSpecs(),
    polledLeagues: ["Rise"],
    rateStore: memoryStore({}, []),
    freeDisk: () => 42 * 1024 ** 3,
    coach: async () => ({ reachable: false, error: "ECONNREFUSED" }),
  });
}

export async function testHealthRoute(): Promise<void> {
  let built = 0;
  const build = async (): Promise<SystemHealth> => {
    built++;
    return ownerPayload();
  };
  assert.equal((await systemHealthResponse(null, build)).status, 401, "anonymous → 401");
  const member = await systemHealthResponse({ role: "member" }, build);
  assert.equal(member.status, 403, "member → 403");
  assert.equal(built, 0, "nothing is computed for a non-owner");

  const owner = await systemHealthResponse({ role: "owner" }, build);
  assert.equal(owner.status, 200);
  assert.equal(owner.headers.get("cache-control"), "no-store");
  const body = systemHealthSchema.parse(await owner.json());
  assert.equal(body.build, "abc123def456");
  assert.equal(body.disk.freeBytes, 42 * 1024 ** 3);
  assert.ok(body.db.pageCount > 0 && body.db.pageSize > 0, "real PRAGMA page stats");
  assert.deepEqual(body.coach, { reachable: false, error: "ECONNREFUSED" });
  assert.equal(body.trade2.length, 2, "search + fetch");
  const hunts = body.heartbeats.find((h) => h.name === "hunts");
  assert.equal(hunts?.status, config.hunt.enabled ? "failing" : "disabled");
  assert.ok(body.heartbeats.some((h) => h.name === "ninja-sweep" && h.league === "Rise" && h.status === "never"));
  console.log("PASS  /api/system/health owner-only gate + payload shape");
}
