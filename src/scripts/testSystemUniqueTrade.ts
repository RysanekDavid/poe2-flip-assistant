/* The unique-trade-values heartbeat: its registry entry (global row, 10-min cadence, config switch),
 * the "never" row before its first tick, a skipped tick recorded red with a clear note, a clean
 * tick green, and a stopped run red. Imported by testSystem.ts (npm run test:system). */
import assert from "node:assert/strict";
import { newMeter } from "../api/tradeMeter";
import { withHeartbeat } from "../core/heartbeat";
import { buildHeartbeatViews, subsystemSpecs, UNIQUE_TRADE_TICK_MIN, type SubsystemConfig } from "../core/subsystems";
import { tickUniqueTrade, uniqueTradeOutcomeProblem, type UniqueTradeOutcome } from "../core/uniqueTrade/live";
import type { UniqueTradeReport } from "../core/uniqueTrade/run";
import type { HeartbeatOutcome } from "../db/heartbeatQueries";

const report = (over: Partial<UniqueTradeReport> = {}): UniqueTradeReport => ({
  league: "Rise", candidates: 4, slots: 1, searches: 1, priced: ["Sadist's Mercy"], tooFew: [], errors: [], fatal: null, deferred: null, meter: newMeter(), ...over,
});

function testRegistry(cfg: SubsystemConfig): void {
  const spec = subsystemSpecs(cfg)["unique-trade-values"];
  assert.equal(spec.perLeague, false, "one global row: trade2 searches only the default league");
  assert.equal(spec.expectedSec, UNIQUE_TRADE_TICK_MIN * 60);
  assert.equal(UNIQUE_TRADE_TICK_MIN, 10);
  assert.equal(spec.enabled, cfg.uniqueTradeValues.enabled);
  assert.match(spec.hint, new RegExp(`≤${cfg.uniqueTradeValues.maxSearchesPerHour} searches/h`), "the hint states the budget share");
  const off = subsystemSpecs({ ...cfg, uniqueTradeValues: { ...cfg.uniqueTradeValues, enabled: false } })["unique-trade-values"];
  assert.equal(off.enabled, false, "UNIQUE_TRADE_VALUES_ENABLED=false disables the row");
  const now = Date.parse("2026-09-30T12:00:00.000Z");
  const views = buildHeartbeatViews([], subsystemSpecs(cfg), ["Rise"], now).filter((v) => v.name === "unique-trade-values");
  assert.deepEqual(views.map((v) => [v.league, v.status]), [["", "never"]], "listed as 'never' until its first tick");
}

async function testRecorded(): Promise<void> {
  const seen: HeartbeatOutcome[] = [];
  const record = (o: HeartbeatOutcome): void => void seen.push(o);
  const beat = (o: UniqueTradeOutcome): Promise<UniqueTradeOutcome> => withHeartbeat("unique-trade-values", "", () => o, { record, problem: uniqueTradeOutcomeProblem });

  await beat({ kind: "skipped", reason: "owner has no POESESSID stored — no trade2 searches until one is saved in Settings" });
  assert.equal(seen[0]?.error, "skipped — owner has no POESESSID stored — no trade2 searches until one is saved in Settings", "a skip is red with its reason");
  await beat({ kind: "ran", report: report() });
  assert.equal(seen[1]?.error, null, "a tick that priced is green");
  await beat({ kind: "ran", report: report({ searches: 0, priced: [], slots: 0 }) });
  assert.equal(seen[2]?.error, null, "a spent hourly cap is pacing, not a failure");
  await beat({ kind: "ran", report: report({ priced: [], fatal: "The Auspex: trade2 403 on POST /search" }) });
  assert.equal(seen[3]?.error, "stopped — The Auspex: trade2 403 on POST /search");
  assert.ok(seen.every((o) => o.name === "unique-trade-values" && o.league === ""));

  // the real tick, without an owner cookie: skipped before any trade2, rates or DB work
  const skipped = await tickUniqueTrade({ id: 1, cred: null });
  assert.equal(skipped.kind, "skipped", "no credential: skipped, never a request");
}

export async function testUniqueTradeHeartbeat(cfg: SubsystemConfig): Promise<void> {
  testRegistry(cfg);
  await testRecorded();
  console.log("PASS  unique-trade-values heartbeat: registry entry, never row, skip red with note, clean/cap green, stopped red");
}
