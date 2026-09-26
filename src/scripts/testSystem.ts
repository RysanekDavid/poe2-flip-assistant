/* Subsystem heartbeats, stale derivation, the owner System Health route and the honest poe.ninja
 * User-Agent — against a TEMP DB with every network call faked.
 * Run: npm run test:system (src/scripts/runWithTestEnv.ts sets DB_PATH + AUTH_SECRET). */
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { config } from "../config/env";
import { getDb } from "../db/database";
import { listHeartbeats, recordHeartbeat, type HeartbeatOutcome } from "../db/heartbeatQueries";
import { MAX_HEARTBEAT_ERROR_CHARS, sanitizeHeartbeatError, withHeartbeat } from "../core/heartbeat";
import { buildHeartbeatViews, deriveHeartbeatStatus, staleAfterSec, subsystemSpecs, type SubsystemConfig } from "../core/subsystems";
import { testHealthRoute, testCoachSummary, testGovernorState } from "./testSystemHealth";
import { testNinjaUserAgent } from "./testSystemNinja";
import { testBalanceLoop } from "./testSystemBalance";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

const POESESSID = "0123456789abcdef0123456789abcdef";

function testSanitize(): void {
  const leaky = `trade2 401 POESESSID=${POESESSID}; cookie: POESESSID=${POESESSID} Bearer pk_abc123 raw ${POESESSID}`;
  const clean = sanitizeHeartbeatError(new Error(leaky));
  assert.ok(!clean.includes(POESESSID), `POESESSID must be scrubbed: ${clean}`);
  assert.ok(!clean.includes("pk_abc123"), "agent api key must be scrubbed");
  assert.match(clean, /POESESSID=\[redacted\]/);

  const long = sanitizeHeartbeatError(new Error(`boom ${"x".repeat(1_000)}\n\tmore`));
  assert.equal(long.length, MAX_HEARTBEAT_ERROR_CHARS, "truncated to the cap");
  assert.ok(long.endsWith("…"), "truncation is marked");
  assert.equal(sanitizeHeartbeatError("a\n  b\tc"), "a b c", "whitespace collapsed");
  assert.equal(sanitizeHeartbeatError(""), "unknown error", "never stores an empty message");
  console.log("PASS  heartbeat error sanitizer (secrets, truncation, whitespace)");
}

function fakeClock(start: number, stepMs: number): () => number {
  let t = start;
  return () => {
    const now = t;
    t += stepMs;
    return now;
  };
}

async function testWithHeartbeat(): Promise<void> {
  const seen: HeartbeatOutcome[] = [];
  const record = (o: HeartbeatOutcome): void => void seen.push(o);
  const now = fakeClock(Date.UTC(2026, 8, 26, 12), 250);

  assert.equal(await withHeartbeat("prune", "", () => 42, { record, now }), 42, "returns fn's value");
  assert.deepEqual(seen[0], { name: "prune", league: "", at: "2026-09-26T12:00:00.250Z", durationMs: 250, error: null });

  const failure = new Error(`trade2 said no POESESSID=${POESESSID}`);
  await assert.rejects(withHeartbeat("hunts", "", async () => Promise.reject(failure), { record, now }), (e) => e === failure);
  assert.ok(seen[1]?.error?.includes("[redacted]") && !seen[1].error.includes(POESESSID), "error recorded, scrubbed");

  const result = await withHeartbeat("patch-notes", "", () => ({ ok: false }), { record, now, problem: (r) => (r.ok ? null : "sync incomplete") });
  assert.deepEqual(result, { ok: false }, "a reported problem still returns the result");
  assert.equal(seen[2]?.error, "sync incomplete");

  const broken = (): void => {
    throw new Error("SQLITE_BUSY");
  };
  assert.equal(await withHeartbeat("scan-drain", "", () => "ran", { record: broken, now }), "ran", "a failed write never fails the loop");
  console.log("PASS  withHeartbeat ok / error rethrown / problem / write failure");
}

function testHeartbeatTable(): void {
  const db = getDb();
  db.exec("DELETE FROM subsystem_heartbeat");
  const row = (at: string, error: string | null): HeartbeatOutcome => ({ name: "ninja-sweep", league: "Rise", at, durationMs: 1200, error });
  recordHeartbeat(row("2026-09-26T10:00:00.000Z", null), db);
  recordHeartbeat(row("2026-09-26T10:05:00.000Z", "poe.ninja 503"), db);
  let [hb] = listHeartbeats(db);
  assert.equal(hb?.runs, 2);
  assert.equal(hb?.last_ok_at, "2026-09-26T10:00:00.000Z", "a failure keeps the last success");
  assert.equal(hb?.last_error, "poe.ninja 503");

  recordHeartbeat(row("2026-09-26T10:10:00.000Z", null), db);
  [hb] = listHeartbeats(db);
  assert.equal(hb?.last_ok_at, "2026-09-26T10:10:00.000Z");
  assert.equal(hb?.last_error, "poe.ninja 503", "a recovery keeps the last error readable");
  assert.equal(hb?.runs, 3);
  console.log("PASS  subsystem_heartbeat upsert keeps last ok + last error, counts runs");
}

const CFG: SubsystemConfig = {
  pollIntervalMin: 5,
  hunt: { ...config.hunt, enabled: true, scanSec: 60 },
  autoSnipe: { ...config.autoSnipe, enabled: false },
  craftMargin: { ...config.craftMargin, enabled: true, intervalMin: 10 },
  balanceIntervalMin: 0,
  patchNotes: { ...config.patchNotes, enabled: true, intervalMin: 30 },
};

function testStaleDerivation(): void {
  const specs = subsystemSpecs(CFG);
  const now = Date.parse("2026-09-26T12:00:00.000Z");
  const ago = (sec: number): string => new Date(now - sec * 1000).toISOString();
  const status = (name: keyof typeof specs, league: string, okSec: number | null, errSec: number | null) =>
    deriveHeartbeatStatus({ league, last_ok_at: okSec == null ? null : ago(okSec), last_error_at: errSec == null ? null : ago(errSec) }, specs[name], ["Rise"], now);

  assert.equal(staleAfterSec(300), 1200, "5-min loop: 15-min floor wins over 3×");
  assert.equal(staleAfterSec(6 * 3600), 18 * 3600, "6h loop: three missed runs");
  assert.equal(status("ninja-sweep", "Rise", 60, null), "ok");
  assert.equal(status("ninja-sweep", "Rise", 1_300, null), "stale", "past 20 minutes without success");
  assert.equal(status("ninja-sweep", "Rise", 600, 30), "failing", "error newer than success");
  assert.equal(status("ninja-sweep", "Rise", 30, 600), "ok", "recovered");
  assert.equal(status("ninja-sweep", "Old League", 99_999, null), "idle", "league nobody polls");
  assert.equal(status("autosnipe", "", 99_999, 5), "disabled", "config off wins");
  assert.equal(status("hunts", "", null, null), "never");
  assert.equal(status("craft-sweep", "", 999_999, null), "ok", "on-demand loops never go stale");
  assert.equal(specs.balance.enabled, false, "BALANCE_INTERVAL_MIN=0 disables balance");

  const views = buildHeartbeatViews([], specs, ["Rise", "Standard"], now);
  const names = views.map((v) => `${v.name}|${v.league}`);
  assert.ok(names.includes("ninja-sweep|Rise") && names.includes("ninja-sweep|Standard"), "per-league loops listed per polled league");
  assert.ok(!names.some((n) => n.startsWith("autosnipe|") || n.startsWith("balance|")), "disabled loops are not synthesized");
  assert.ok(views.every((v) => v.status === "never"), "synthesized rows read 'never'");
  assert.equal(names[0], "ninja-sweep|Rise", "registry order, then league");
  console.log("PASS  stale / failing / idle / disabled / never derivation + synthesized rows");
}

async function main(): Promise<void> {
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${config.dbPath}${suffix}`, { force: true });
  getDb();
  testSanitize();
  await testWithHeartbeat();
  testHeartbeatTable();
  testStaleDerivation();
  testGovernorState();
  await testCoachSummary();
  await testHealthRoute();
  await testBalanceLoop();
  await testNinjaUserAgent();
  console.log("ALL PASS — heartbeats, stale derivation, owner-only system health, balance loop, honest ninja UA");
  // ninjaLimiter's reservoir refresh keeps an interval alive; the suite is done.
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
