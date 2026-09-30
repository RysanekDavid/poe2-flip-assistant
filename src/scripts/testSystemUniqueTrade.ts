/* The unique-trade-values heartbeat: its registry entry (global row, 10-min cadence, config switch),
 * the "never" row before its first tick, the no-cookie gate (silently off, one warning, re-arms),
 * real failures recorded red with a clear note (expired cookie, catalog misses, a stopped run),
 * and clean/capped ticks green. Imported by testSystem.ts (npm run test:system). */
import assert from "node:assert/strict";
import { newMeter } from "../api/tradeMeter";
import { config } from "../config/env";
import { withHeartbeat } from "../core/heartbeat";
import { buildHeartbeatViews, subsystemSpecs, UNIQUE_TRADE_TICK_MIN, type SubsystemConfig } from "../core/subsystems";
import { tickUniqueTrade, uniqueTradeOutcomeProblem, type UniqueTradeOutcome } from "../core/uniqueTrade/live";
import type { UniqueTradeReport } from "../core/uniqueTrade/run";
import { resetCredStatus, setCredStatus } from "../db/credStatusQueries";
import type { HeartbeatOutcome } from "../db/heartbeatQueries";
import { createCookieGate } from "../scheduler/uniqueTradeLoop";

const report = (over: Partial<UniqueTradeReport> = {}): UniqueTradeReport => ({
  league: "Rise", candidates: 4, slots: 1, searches: 1, priced: ["Sadist's Mercy"], tooFew: [], catalogMisses: [], errors: [], fatal: null, deferred: null, meter: newMeter(), ...over,
});

function testRegistry(cfg: SubsystemConfig): void {
  const spec = subsystemSpecs(cfg)["unique-trade-values"];
  assert.equal(spec.perLeague, false, "one global row: trade2 searches only the default league");
  assert.equal(spec.expectedSec, UNIQUE_TRADE_TICK_MIN * 60);
  assert.equal(UNIQUE_TRADE_TICK_MIN, 10);
  assert.equal(spec.enabled, cfg.uniqueTradeValues.enabled);
  assert.match(spec.hint, new RegExp(`≤${cfg.uniqueTradeValues.maxSearchesPerHour} searches/h`), "the hint states the budget share");
  assert.match(spec.hint, /Stays off \("never"\) until the owner saves a POESESSID/);
  const off = subsystemSpecs({ ...cfg, uniqueTradeValues: { ...cfg.uniqueTradeValues, enabled: false } })["unique-trade-values"];
  assert.equal(off.enabled, false, "UNIQUE_TRADE_VALUES_ENABLED=false disables the row");
  const now = Date.parse("2026-09-30T12:00:00.000Z");
  const views = buildHeartbeatViews([], subsystemSpecs(cfg), ["Rise"], now).filter((v) => v.name === "unique-trade-values");
  assert.deepEqual(views.map((v) => [v.league, v.status]), [["", "never"]], "listed as 'never' until its first tick");
}

function testCookieGate(): void {
  const warnings: string[] = [];
  const gate = createCookieGate((m) => void warnings.push(m));
  const none = { id: 1, cred: null };
  const some = { id: 1, cred: { poesessid: "x", source: "stored" as const } };
  assert.deepEqual([gate(none), gate(none), gate(none)], [false, false, false], "no owner cookie: the tick does not run (no heartbeat, no red)");
  assert.equal(warnings.length, 1, "one warning at boot, not one per tick");
  assert.match(warnings[0] ?? "", /owner POESESSID missing/);
  assert.equal(gate(some), true, "a saved cookie re-arms the job without a restart");
  assert.equal(gate(none), false);
  assert.equal(warnings.length, 2, "removing the cookie later warns once more");
}

async function withContact<T>(contact: string, run: () => Promise<T>): Promise<T> {
  // `config` is `as const` for app code; the suite swaps the contact and always restores it
  const writable = config as { dataSourceContact: string };
  const original = writable.dataSourceContact;
  writable.dataSourceContact = contact;
  try {
    return await run();
  } finally {
    writable.dataSourceContact = original;
  }
}

async function testRecorded(): Promise<void> {
  const seen: HeartbeatOutcome[] = [];
  const record = (o: HeartbeatOutcome): void => void seen.push(o);
  const beat = (o: UniqueTradeOutcome): Promise<UniqueTradeOutcome> => withHeartbeat("unique-trade-values", "", () => o, { record, problem: uniqueTradeOutcomeProblem });

  await beat({ kind: "skipped", reason: "DATA_SOURCE_CONTACT is not set — trade2 requests must name an operator contact" });
  assert.equal(seen[0]?.error, "skipped — DATA_SOURCE_CONTACT is not set — trade2 requests must name an operator contact", "a real skip is red with its reason");
  await beat({ kind: "ran", report: report() });
  assert.equal(seen[1]?.error, null, "a tick that priced is green");
  await beat({ kind: "ran", report: report({ searches: 0, priced: [], slots: 0 }) });
  assert.equal(seen[2]?.error, null, "a spent hourly cap is pacing, not a failure");
  await beat({ kind: "ran", report: report({ priced: [], fatal: "The Auspex: trade2 403 on POST /search" }) });
  assert.equal(seen[3]?.error, "stopped — The Auspex: trade2 403 on POST /search");
  await beat({ kind: "ran", report: report({ catalogMisses: ["Nobody"] }) });
  assert.equal(seen[4]?.error, "not in trade2's unique catalog (fix the curated name): Nobody", "catalog misses are red, named");
  assert.ok(seen.every((o) => o.name === "unique-trade-values" && o.league === ""));

  // the real tick: a stored cookie trade2 answered 403 is not tried again (skipped before rates or trade2)
  const stored = { id: 1, cred: { poesessid: "0123", source: "stored" as const } };
  setCredStatus(1, "expired", "trade2 403 on POST /search");
  try {
    const expired = await withContact("ops@example.test", () => tickUniqueTrade(stored));
    assert.ok(expired.kind === "skipped" && /expired \(trade2 answered 403\)/.test(expired.reason), "expired cookie: red skip, no request every 10 minutes");
  } finally {
    resetCredStatus(1);
  }
  const noContact = await withContact("", () => tickUniqueTrade(stored));
  assert.ok(noContact.kind === "skipped" && /DATA_SOURCE_CONTACT/.test(noContact.reason), "no operator contact: red skip, never a request");
}

export async function testUniqueTradeHeartbeat(cfg: SubsystemConfig): Promise<void> {
  testRegistry(cfg);
  testCookieGate();
  await testRecorded();
  console.log("PASS  unique-trade-values heartbeat: registry, never row, no-cookie gate (silent, one warning, re-arms), expired/contact/catalog/stopped red, clean/cap green");
}
