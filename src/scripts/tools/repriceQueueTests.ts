/* Reprice queue (part of test:tools:liquidate): enqueue is one transaction, the 6h cooldown, the
 * run phases (queued / running / lost / done / failed), a new cookie lifting a finished run's
 * cooldown, and the poller loop surviving a user deleted mid-run. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type Database from "better-sqlite3";
import type { RepriceUserResult } from "../../core/wealth/repriceRun";
import {
  enqueueReprice, finishRepriceRun, getRepriceRun, liftRepriceCooldown, markRepriceStarted, repriceNextAt, repricePhase,
  repriceState, REPRICE_COOLDOWN_MS, REPRICE_STALE_MS,
} from "../../db/repriceRunQueries";
import { consumeScanRequests, isScanPending } from "../../db/scanRequestQueries";
import { repriceUsers } from "../../scheduler/tradeScans";
import { insertUser } from "./toolsTestKit";

function testCooldownAndPhases(db: Database.Database): void {
  const u = insertUser(db, "repricer");
  const t0 = Date.parse("2026-09-29T12:00:00Z");
  assert.equal(repriceState(u, t0).nextAt, null, "never checked → may check now");
  enqueueReprice(u, new Date(t0));
  assert.ok(isScanPending("reprice", u), "stamp and queue land together");
  assert.equal(repriceState(u, t0 + 60_000).phase, "queued");
  assert.equal(repriceState(u, t0 + 60_000).nextAt?.getTime(), t0 + REPRICE_COOLDOWN_MS, "6h cooldown from the request");
  assert.deepEqual(consumeScanRequests("reprice"), [u], "the web only enqueues; the poller drains");
  assert.equal(repriceState(u, t0 + 60_000).phase, "lost", "taken from the queue but never started → lost");
  assert.equal(repriceState(u, t0 + 60_000).nextAt, null, "a lost run does not hold the cooldown");
  markRepriceStarted([u], new Date(t0 + 60_000));
  assert.equal(repriceState(u, t0 + 120_000).phase, "running");
  assert.ok(repriceState(u, t0 + 120_000).nextAt != null, "a running check holds it");
  assert.equal(repricePhase(getRepriceRun(u), false, t0 + 60_000 + REPRICE_STALE_MS + 1), "lost", "unfinished for 30 min → died with the poller");

  finishRepriceRun(u, { checked: 0, searches: 0, error: "trade2 search budget is busy" });
  assert.equal(repriceState(u, t0 + 60_000).phase, "failed");
  assert.equal(repriceNextAt(getRepriceRun(u), false, t0 + 60_000), null, "failed before any search → free");
  enqueueReprice(u, new Date(t0));
  consumeScanRequests("reprice");
  finishRepriceRun(u, { checked: 1, searches: 3, error: "trade2 403" });
  assert.ok(repriceNextAt(getRepriceRun(u), false, t0 + 60_000) != null, "a run that spent searches holds it even when it failed");
  assert.equal(repriceNextAt(getRepriceRun(u), false, t0 + REPRICE_COOLDOWN_MS + 1), null, "free again after 6h");
  liftRepriceCooldown(u);
  assert.equal(repriceNextAt(getRepriceRun(u), false, t0 + 60_000), null, "a newly saved cookie lifts a finished run's cooldown");
  assert.equal(getRepriceRun(u)?.error, "trade2 403", "…and keeps the last outcome visible");

  enqueueReprice(u, new Date(t0));
  liftRepriceCooldown(u);
  assert.ok(repriceState(u, t0 + 60_000).nextAt != null, "a queued check keeps its stamp (it will use the new cookie)");
  consumeScanRequests("reprice");
  assert.throws(() => finishRepriceRun(999_999, { checked: 0, searches: 0, error: null }), /no reprice run/);
}

async function testLoopSurvivesDeletedUser(db: Database.Database): Promise<void> {
  const gone = insertUser(db, "deleted-mid-run");
  const kept = insertUser(db, "still-here");
  const t0 = new Date();
  enqueueReprice(gone, t0);
  enqueueReprice(kept, t0);
  consumeScanRequests("reprice");
  db.prepare("DELETE FROM users WHERE id = ?").run(gone); // cascades its reprice_runs row
  const ran: number[] = [];
  const run = async (userId: number): Promise<RepriceUserResult> => {
    ran.push(userId);
    if (userId === gone) throw new Error("user vanished");
    finishRepriceRun(userId, { checked: 2, searches: 2, error: null });
    return { userId, candidates: 2, checked: 2, searches: 2, fetches: 2, error: null };
  };
  const results = await repriceUsers([gone, kept], () => null, run);
  assert.deepEqual(ran, [gone, kept], "a failing user never stops the rest");
  assert.deepEqual(results.map((r) => [r.userId, r.error]), [[gone, "user vanished"], [kept, null]]);
  assert.equal(repriceState(kept, Date.now()).phase, "done");
}

export async function runRepriceQueueTests(db: Database.Database): Promise<void> {
  testCooldownAndPhases(db);
  // the settings route is request-bound (cookies), so its wiring is pinned by source
  assert.match(readFileSync("src/app/api/settings/poe/route.ts", "utf8"), /liftRepriceCooldown\(user\.id\)/, "saving a cookie lifts the cooldown");
  await testLoopSurvivesDeletedUser(db);
}
