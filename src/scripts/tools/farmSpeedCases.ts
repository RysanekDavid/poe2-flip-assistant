/* Farm Div/hour by the viewer's own pace: bound propagation (≥/≤/?), nulls never 0, PUT/DELETE
 * validation, per-user rows (isolation, replace, cascade) and the unpersonalised loadFarmBoard.
 * Imported by testBossEv.ts. */
import assert from "node:assert/strict";
import type Database from "better-sqlite3";
import { buildFarmBoard, isBossRow, isMechanicRow, type MechanicInput } from "../../core/farm/farmBoard";
import { isCuratedBossId, loadFarmBoard } from "../../core/farm/farmLoad";
import { applySpeeds, compareDivPerHour, divPerHour, mechanicDivPerHour, orderBosses, parseSpeedDraft } from "../../core/farm/farmSpeed";
import type { Tier } from "../../core/tools/bossEv/schema";
import { deleteFarmSpeed, listFarmSpeeds, saveFarmSpeed } from "../../db/farmSpeedQueries";
import { farmResponseSchema, MAX_DIV_PER_RUN, MAX_MINUTES_PER_RUN, speedDeleteSchema, speedErrorText, speedPutSchema, type BossRow, type SpeedEntry } from "../../lib/farmContract";
import { rank, view, type Inputs } from "./farmBoardCases";
import { insertUser } from "./toolsTestKit";

const close = (actual: number | null | undefined, expected: number, what: string): void =>
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-9, `${what}: expected ${expected}, got ${actual}`);

function testDivPerHourMath(): void {
  assert.deepEqual(divPerHour(2, "exact", 10), { divPerHour: 12, bound: "exact" }, "net 2/kill at 10 min → 12 div/h");
  assert.deepEqual(divPerHour(-1, "lower", 30), { divPerHour: -2, bound: "lower" }, "a lower bound per kill stays a lower bound per hour");
  assert.deepEqual(divPerHour(3, "upper", 6), { divPerHour: 30, bound: "upper" });
  assert.deepEqual(divPerHour(5, "unknown", 6), { divPerHour: null, bound: "unknown" }, "unknown net → no number, the '?' survives");
  for (const bad of [null, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(divPerHour(2, "exact", bad), { divPerHour: null, bound: null }, `no pace (${String(bad)}) → null, never 0`);
  }
  assert.equal(mechanicDivPerHour(2.5, 5), 30, "2.5 div/map at 5 min/map → 30 div/h");
  assert.equal(mechanicDivPerHour(0, 5), 0, "a dry map the viewer typed in is a real 0");
  assert.equal(mechanicDivPerHour(null, 5), null, "minutes alone → null");
  assert.equal(mechanicDivPerHour(2, null), null, "Div/map alone → null");
  assert.equal(mechanicDivPerHour(-1, 5), null);
  assert.deepEqual(parseSpeedDraft(" 7,5 ", 1440, false), { ok: true, value: 7.5 }, "comma decimal");
  assert.deepEqual(parseSpeedDraft("", 1440, false), { ok: true, value: null }, "empty clears");
  assert.deepEqual([parseSpeedDraft("0", 1440, false).ok, parseSpeedDraft("0", 10, true).ok], [false, true], "0 min invalid, 0 div valid");
  assert.equal(parseSpeedDraft("abc", 1440, false).ok, false);
  assert.equal(parseSpeedDraft("1441", 1440, false).ok, false);
}

const entry = (kind: SpeedEntry["kind"], key: string, minutesPerRun: number, divPerRun: number | null = null): SpeedEntry => ({
  kind, key, minutesPerRun, divPerRun, updatedAt: 1,
});

function syntheticBoard(tier: Tier, inputs: Inputs) {
  const missing = inputs();
  (missing.ninja as Map<string, unknown>).delete("a");
  const bosses = [view("rich", { ...tier, entry: [{ itemId: "a", qty: 0.5 }] }, inputs()), view("poor", tier, inputs()), view("partial", tier, missing)];
  const mechanics: MechanicInput[] = [rank("Abyss", 40, "d"), rank("Breach", 5, "e"), rank("Ritual", 1, "f")].map((r) => ({ ...r, icon: null }));
  const rows = buildFarmBoard(mechanics, bosses, 400);
  return { details: bosses, board: { mechanics: rows.filter(isMechanicRow), bosses: rows.filter(isBossRow) } };
}

function testApplySpeeds(tier: Tier, inputs: Inputs): void {
  const { details, board } = syntheticBoard(tier, inputs);
  for (const r of [...board.mechanics, ...board.bosses]) assert.equal(r.divPerHour, null, "the shared board carries no pace");
  const speeds = [entry("boss", "rich", 6), entry("boss", "partial", 6), entry("mechanic", "Abyss", 5, 2.5), entry("mechanic", "Breach", 4), entry("boss", "gone", 3)];
  const mine = applySpeeds(board, speeds);
  const [rich, poor, partial] = ["rich", "poor", "partial"].map((id) => mine.bosses.find((b) => b.id === id));
  assert.ok(rich && poor && partial);
  close(rich.divPerHour, rich.netDiv * 10, "boss Div/h = net × 60 / minutes");
  assert.deepEqual([rich.yourMinutes, rich.divPerHourBound], [6, rich.netBound], "bound follows netBound");
  assert.deepEqual([poor.yourMinutes, poor.divPerHour, poor.divPerHourBound], [null, null, null], "no pace → null");
  assert.deepEqual([partial.netBound, partial.divPerHour, partial.divPerHourBound], ["unknown", null, "unknown"]);
  const [abyss, breach, ritual] = mine.mechanics;
  assert.deepEqual([abyss?.divPerHour, abyss?.divPerHourBound, abyss?.yourDivPerRun], [30, "exact", 2.5]);
  assert.deepEqual([breach?.yourMinutes, breach?.divPerHour, breach?.divPerHourBound], [4, null, null], "minutes without Div/map → no Div/h");
  assert.deepEqual([ritual?.yourMinutes, ritual?.divPerHour], [null, null]);
  assert.deepEqual(mine.bosses.map((b) => b.id), board.bosses.map((b) => b.id), "personalising never reorders the board");
  for (const dir of ["asc", "desc"] as const) {
    const sorted = [...mine.bosses].sort((a, b) => compareDivPerHour(a, b, dir)).map((b) => b.id);
    assert.equal(sorted[0], "rich", `${dir}: rows with a Div/h lead; unknown and unpaced trail`);
  }
  testOrdering(mine.bosses);
  farmResponseSchema.parse({
    computedLeague: "L", ...mine, details, rates: null, pricesFetchedAt: null, scoutAgeHours: null, dataAsOf: "2026-09-29",
    patch: "0.5.5", patchWarning: null,
  });
}

/** The boss table's order: board / Div/h sort, and frozen while a pace input has focus. */
function testOrdering(bosses: BossRow[]): void {
  const ids = (rows: BossRow[]): string[] => rows.map((b) => b.id);
  const board = ids(bosses);
  assert.deepEqual(ids(orderBosses(bosses, { key: "board" }, null)), board, "board order = the server's");
  const byDivH = ids(orderBosses(bosses, { key: "divh", dir: "desc" }, null));
  assert.equal(byDivH[0], "rich");
  // a save lands while an input is focused: the reload would re-sort — the frozen order must win
  const frozen = ["poor", "partial", "rich"];
  const faster = bosses.map((b) => (b.id === "poor" ? { ...b, yourMinutes: 1, divPerHour: 999, divPerHourBound: b.netBound } : b));
  assert.deepEqual(ids(orderBosses(faster, { key: "divh", dir: "desc" }, frozen)), frozen, "rows never move under a focused input");
  assert.equal(ids(orderBosses(faster, { key: "divh", dir: "desc" }, null))[0], "rich", "the sort applies again once focus leaves");
  assert.deepEqual(ids(orderBosses(bosses, { key: "board" }, ["partial"])), ["partial", ...board.filter((id) => id !== "partial")], "rows not on screen when frozen go last, in their order");
  assert.notEqual(orderBosses(bosses, { key: "board" }, null), bosses, "never sorts the caller's array in place");
}

function testPutValidation(): void {
  const ok = (body: unknown): boolean => speedPutSchema.safeParse(body).success;
  assert.ok(ok({ kind: "boss", key: "xesha", minutesPerRun: 4 }));
  assert.ok(ok({ kind: "mechanic", key: "Abyss", minutesPerRun: 5, divPerRun: 0 }), "a dry map (0 div) is allowed");
  assert.ok(ok({ kind: "mechanic", key: "Abyss", minutesPerRun: 5, divPerRun: null }));
  assert.equal(ok({ kind: "boss", key: "xesha", minutesPerRun: 0 }), false, "0 minutes");
  assert.equal(ok({ kind: "boss", key: "xesha", minutesPerRun: -2 }), false, "negative minutes");
  assert.equal(ok({ kind: "boss", key: "xesha", minutesPerRun: MAX_MINUTES_PER_RUN + 1 }), false, "past a day");
  assert.equal(ok({ kind: "boss", key: "xesha", minutesPerRun: "5" }), false, "string minutes");
  assert.equal(ok({ kind: "boss", key: "xesha", minutesPerRun: 4, divPerRun: 1 }), false, "a boss takes no Div/run");
  assert.equal(ok({ kind: "mechanic", key: "Abyss", minutesPerRun: 4, divPerRun: -1 }), false, "negative Div/map");
  assert.equal(ok({ kind: "mechanic", key: "Abyss", minutesPerRun: 4, divPerRun: MAX_DIV_PER_RUN + 1 }), false, "Div/map typo cap");
  assert.equal(ok({ kind: "mechanic", key: "Abyss", minutesPerRun: 4, divPerRun: Number.POSITIVE_INFINITY }), false, "non-finite Div/map");
  assert.equal(ok({ kind: "boss", key: "xesha", minutesPerRun: Number.NaN }), false, "NaN minutes");
  assert.equal(ok({ kind: "mechanic", key: "  ", minutesPerRun: 4 }), false, "blank key");
  assert.equal(ok({ kind: "map", key: "Abyss", minutesPerRun: 4 }), false, "unknown kind");
  assert.equal(ok({ kind: "boss", key: "xesha", minutesPerRun: 4, userId: 2 }), false, "strict: no smuggled user id");
  assert.equal(ok(null), false);
  const bad = speedPutSchema.safeParse({ kind: "boss", key: "xesha", minutesPerRun: 4, divPerRun: 1 });
  assert.ok(!bad.success && speedErrorText(bad.error).startsWith("divPerRun: "), "error names the field");
  assert.ok(speedDeleteSchema.safeParse({ kind: "boss", key: "xesha" }).success);
  assert.equal(speedDeleteSchema.safeParse({ kind: "boss" }).success, false);
}

function testSpeedRows(db: Database.Database, nowMs: number): number {
  const [alice, bob] = [insertUser(db, "farm-alice"), insertUser(db, "farm-bob")];
  const saved = saveFarmSpeed(alice, { kind: "mechanic", key: "Abyss", minutesPerRun: 5, divPerRun: 2 }, nowMs);
  assert.deepEqual(saved, { ...entry("mechanic", "Abyss", 5, 2), updatedAt: nowMs });
  saveFarmSpeed(alice, { kind: "boss", key: "xesha", minutesPerRun: 4 }, nowMs);
  assert.equal(listFarmSpeeds(bob).length, 0, "another user's paces never leak");
  assert.equal(deleteFarmSpeed(bob, "boss", "xesha"), false, "bob cannot delete alice's pace");
  saveFarmSpeed(bob, { kind: "boss", key: "xesha", minutesPerRun: 9 }, nowMs);
  assert.deepEqual(
    listFarmSpeeds(alice).map((s) => [s.kind, s.key, s.minutesPerRun]),
    [["boss", "xesha", 4], ["mechanic", "Abyss", 5]],
    "bob's save leaves alice's row alone",
  );
  const replaced = saveFarmSpeed(alice, { kind: "mechanic", key: "Abyss", minutesPerRun: 6 }, nowMs + 1);
  assert.deepEqual([replaced.minutesPerRun, replaced.divPerRun, replaced.updatedAt], [6, null, nowMs + 1], "PUT is a full replacement");
  assert.throws(() => db.prepare("INSERT INTO farm_user_speed VALUES (?, 'boss', 'k', 5, 1, 0)").run(alice), /CHECK/, "DB rejects a boss Div/run too");
  assert.equal(deleteFarmSpeed(alice, "boss", "xesha"), true);
  assert.equal(listFarmSpeeds(alice).length, 1);
  db.prepare("DELETE FROM users WHERE id = ?").run(bob);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM farm_user_speed WHERE user_id = ?").get(bob) as { n: number }).n, 0, "cascade");
  return alice;
}

/** Needs the fresh test DB (testBossEv's testDbPricing): per-user rows, then the shared loader. */
export function runFarmSpeedDbCases(db: Database.Database, nowMs: number): void {
  const alice = testSpeedRows(db, nowMs);
  const board = loadFarmBoard("L", nowMs);
  assert.equal(board.computedLeague, "L");
  assert.ok(board.bosses.length > 0 && board.bosses.every((b) => b.divPerHour === null), "loadFarmBoard is unpersonalised");
  const mine = farmResponseSchema.parse(applySpeeds(board, listFarmSpeeds(alice)));
  assert.equal(mine.mechanics.length, board.mechanics.length);
  const firstBoss = board.bosses[0];
  assert.ok(firstBoss && isCuratedBossId(firstBoss.id) && !isCuratedBossId("not-a-boss"), "PUT only accepts curated boss ids");
}

export function runFarmSpeedCases(tier: Tier, inputs: Inputs): void {
  testDivPerHourMath();
  testApplySpeeds(tier, inputs);
  testPutValidation();
}
