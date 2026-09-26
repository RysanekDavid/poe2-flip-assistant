/* Scheduled balance read takes the web read's path (resolveRates + recordTradeBalance) — test:system. */
import assert from "node:assert/strict";
import type { AccountCurrency } from "../api/accountScan";
import type { TradeCred } from "../api/tradeClient";
import type { recordTradeBalance } from "../core/balanceRead";
import { getDb } from "../db/database";
import { listHeartbeats } from "../db/heartbeatQueries";
import type { BalanceSnapshot } from "../db/queries";
import type { UserPublic } from "../db/userQueries";
import { balanceProblem, snapshotBalancesAll, type BalanceLoopDeps } from "../scheduler/balanceLoop";

const RATES = { exaltPerDivine: 400, chaosPerDivine: 20 };

function scan(): AccountCurrency {
  return { divine: 3, exalted: 10, chaos: 5, otherDiv: 1, gearAtAskDiv: 0.5, unpriced: 0, listingsSeen: 100, total: 140, truncated: true, tabs: [] };
}

function snapshot(league: string): BalanceSnapshot {
  return {
    id: 1, divine: 3, exalted: 10, chaos: 5, exalt_per_div: 400, chaos_per_div: 20, other_div: 1, net_worth_div: 4.3,
    source: "trade", note: null, fetched_at: "2026-09-26 12:00:00", league, listed_seen: 100, listed_total: 140, gear_at_ask_div: 0.5,
  };
}

const users: UserPublic[] = [
  { id: 1, name: "owner", role: "owner" },
  { id: 2, name: "member", role: "member" },
  { id: 3, name: "nocred", role: "member" },
];
const cred = (account: string): TradeCred => ({ poesessid: "x".repeat(32), contact: "", account });

function deps(calls: unknown[][], overrides: Partial<BalanceLoopDeps>): BalanceLoopDeps {
  const record: typeof recordTradeBalance = async (...args) => {
    calls.push(args);
    if (args[0] === 2) throw new Error("trade2 401");
    return { snapshot: snapshot(args[1]), scan: scan() };
  };
  return {
    league: () => "Rise",
    users: () => users,
    credFor: (u) => (u.id === 3 ? null : cred(`${u.name}#1`)),
    rates: (league) => (league === "Rise" ? { rates: RATES, source: "cx", fetchedAt: null } : null),
    record,
    refreshUniques: async () => 7,
    ...overrides,
  };
}

export async function testBalanceLoop(): Promise<void> {
  getDb().exec("DELETE FROM subsystem_heartbeat");
  const calls: unknown[][] = [];
  const result = await snapshotBalancesAll(deps(calls, {}));
  assert.deepEqual(calls.map((c) => [c[0], c[1], c[2], c[3]]), [
    [1, "Rise", "owner#1", RATES],
    [2, "Rise", "member#1", RATES],
  ], "default league + resolveRates rates, via recordTradeBalance");
  assert.equal(result.read, 1);
  assert.equal(result.skipped, 1, "users without cred are skipped, not failures");
  assert.deepEqual(result.failed, ["member: trade2 401"]);
  assert.equal(balanceProblem(result), "1 of 2 read(s) failed — member: trade2 401");

  await assert.rejects(snapshotBalancesAll(deps([], { rates: () => null })), /no exchange rates available for Rise/, "no rates → loud failure");

  const uniquesDown = await snapshotBalancesAll(deps([], { refreshUniques: async () => Promise.reject(new Error("scout 502")) }));
  assert.equal(uniquesDown.read, 1, "a unique-price outage does not block the currency read");
  const hb = listHeartbeats().find((h) => h.name === "unique-values");
  assert.equal(hb?.last_error, "scout 502", "…but it is recorded on its own heartbeat");
  console.log("PASS  balance auto-read: web path (resolveRates + recordTradeBalance), uniques failure recorded");
}
