/* craft:eval benchmark kinds and the compare pick (run by testCraftEval.ts): what the ratio is taken
 * against per benchmark, how excluded entries leave the pass count but stay in the --check gate, and
 * which start a compare entry scores with and without the creator's base price. */
import assert from "node:assert/strict";
import type { PlanResponse } from "../../lib/tools/craftPlannerContract";
import type { GoldenCreator } from "../../core/research/craftMining/goldenSchema";
import { benchmarkDiv, checkAgainstBaseline, summarize, summaryLine } from "../../core/research/craftMining/goldenScore";
import { pickCompared } from "./craftEvalRun";
import { entry } from "./craftEvalScoreCases";

const b = (point: number, low = point, high = point) => ({ point, low, high });
const EXCLUDED = { kind: "excluded", reason: "banned move" } as const;

const creator = (statedTotalDiv: GoldenCreator["statedTotalDiv"]): GoldenCreator => ({ tags: ["chaos-loop"], materials: [], baseDiv: b(10), statedTotalDiv, steps: ["x"] });

function testBenchmarkDiv(): void {
  const materials = b(40, 30, 60);
  assert.deepEqual(benchmarkDiv({ id: "m", benchmark: "materials", creator: creator(b(200)) }, materials), materials, "materials: the material sum, the stated total ignored");
  assert.deepEqual(benchmarkDiv({ id: "s", benchmark: "statedTotal", creator: creator(b(200, 150, 300)) }, materials), b(200, 150, 300), "statedTotal: the creator's own total");
  assert.deepEqual(benchmarkDiv({ id: "s", benchmark: "statedTotal", creator: creator(b(200)) }, null), b(200), "statedTotal needs no priced materials");
  assert.deepEqual(benchmarkDiv({ id: "x", benchmark: "excluded", creator: creator(b(200)) }, materials), materials, "excluded: keeps the material ratio for drift");
  assert.throws(() => benchmarkDiv({ id: "bad", benchmark: "statedTotal", creator: creator(null) }, materials), /bad: benchmark "statedTotal" without creator.statedTotalDiv/);
}

function testSummary(): void {
  const entries = [entry("a", 1), entry("b", 3), entry("c", 1, null, EXCLUDED), entry("d", 9, null, EXCLUDED), entry("e", 1.5, null, { kind: "statedTotal", reason: "lucky run" })];
  const s = summarize(entries);
  assert.deepEqual(s, { entries: 5, counted: 3, excluded: 2, passed: 2, errored: 0 }, "an excluded entry in the band is not a pass");
  assert.equal(summaryLine(s), "2/3 counted pass (2 excluded), 0 errored");
}

function testCheckCoversExcluded(): void {
  const base = [entry("x", 1.2, null, EXCLUDED), entry("y", 3, null, EXCLUDED)];
  const drift = checkAgainstBaseline(base, [entry("x", 2.5, null, EXCLUDED), entry("y", 3, null, EXCLUDED)], null);
  assert.deepEqual(drift.regressions.map((r) => r.split(":")[0]), ["x", "x"], drift.regressions.join("\n"));
  const moved = checkAgainstBaseline([entry("z", 3)], [entry("z", 1, null, { kind: "statedTotal", reason: "minimum counts" })], null);
  assert.equal(moved.regressions.length, 1);
  assert.match(moved.regressions[0]!, /z: benchmark materials → statedTotal, ratios not comparable/);
}

type Compared = Pick<PlanResponse, "totals" | "start">;
const clean = (div: number | null): Compared => ({ totals: { div: div == null ? null : b(div), exalt: null, basis: "estimate" }, start: { kind: "clean" } });
const bought = (div: number | null, buys = 1): Compared => ({
  totals: { div: div == null ? null : b(div), exalt: null, basis: "estimate" },
  start: { kind: "bought", rarity: "Rare", carried: [], askDiv: null, buys: b(buys) },
});

function testPickCompared(): void {
  assert.deepEqual(pickCompared(clean(239), bought(107), null), { pick: "bought", rule: "materials-only" }, "no base price: the cheaper material total wins");
  assert.deepEqual(pickCompared(clean(100), bought(107), null), { pick: "clean", rule: "materials-only" });
  assert.deepEqual(pickCompared(clean(100), bought(null), null), { pick: "clean", rule: "materials-only" }, "an unpriced total cannot win");
  assert.deepEqual(pickCompared(clean(null), bought(107), null), { pick: "bought", rule: "materials-only" });
  assert.deepEqual(pickCompared(clean(239), bought(107), b(200)), { pick: "clean", rule: "with-base" }, "with a base price: 107 + 200 > 239, the UI rule");
  assert.deepEqual(pickCompared(clean(239), bought(107), b(50)), { pick: "bought", rule: "with-base" }, "107 + 50 < 239");
  assert.deepEqual(pickCompared(clean(239), bought(107, 2), b(70)), { pick: "clean", rule: "with-base" }, "restarts buy more bases: 107 + 2 × 70 > 239");
}

export function runBenchmarkCases(ok: (name: string, fn: () => void) => void): void {
  ok("benchmark: materials / statedTotal / excluded pick the ratio's denominator; statedTotal without a total throws", testBenchmarkDiv);
  ok("benchmark: excluded entries leave the pass count ('N/M counted (K excluded)')", testSummary);
  ok("--check: excluded entries' ratios are still gated; a benchmark change needs a baseline refresh", testCheckCoversExcluded);
  ok("compare: without a creator base price the cheaper material total is scored; with one, the UI rule", testPickCompared);
}
