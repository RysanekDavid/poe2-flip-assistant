/* craft:eval scoring cases (run by testCraftEval.ts): creator and planner cost, ratio and pass
 * band, Jaccard, the top cost driver, and the --check gate on synthetic scoreboards. */
import assert from "node:assert/strict";
import {
  checkAgainstBaseline,
  creatorCost,
  jaccard,
  passes,
  plannerCost,
  ratioOf,
  scoreboardSchema,
  summarize,
  topDriver,
  type ScoreEntry,
} from "../../core/research/craftMining/goldenScore";

const b = (point: number, low = point, high = point) => ({ point, low, high });

/** A scoreboard row with only the fields the gate reads set meaningfully. */
export function entry(id: string, ratio: number | null, error: ScoreEntry["error"] = null, benchmark: ScoreEntry["benchmark"] = { kind: "materials", reason: null }): ScoreEntry {
  return {
    id,
    archetype: "ring-attack-flat",
    start: ratio == null ? null : "clean",
    benchmark,
    creatorDiv: b(100),
    statedDiv: null,
    plannerDiv: ratio == null ? null : b(100 * ratio),
    compared: null,
    ratio,
    pass: passes(ratio),
    tags: { planner: [], creator: ["chaos-loop"], jaccard: 0 },
    topDriver: null,
    impractical: false,
    marketDiv: null,
    error,
  };
}

function testCosts(): void {
  const prices = new Map([["chaos", 0.1], ["omen-of-light", 4]]);
  const c = creatorCost({ materials: [{ id: "chaos", uses: b(400, 200, 600) }, { id: "omen-of-light", uses: b(10, 5, 15) }], baseDiv: b(65, 60, 70) }, prices);
  assert.deepEqual(c, { div: { point: 40 + 40 + 65, low: 20 + 20 + 60, high: 60 + 60 + 70 }, unpriced: [] });
  const missing = creatorCost({ materials: [{ id: "chaos", uses: b(1) }, { id: "annul", uses: b(1) }], baseDiv: null }, prices);
  assert.deepEqual(missing, { div: null, unpriced: ["annul"] });
  assert.deepEqual(plannerCost(b(100, 80, 120), { kind: "clean" }, b(65, 60, 70)), b(100, 80, 120), "a clean start buys no base");
  assert.deepEqual(plannerCost(b(100, 80, 120), { kind: "bought", buys: b(1.5, 1, 3) }, b(60, 50, 70)), b(190, 130, 330), "bought bases at the creator's price, restarts included");
  assert.deepEqual(plannerCost(b(100), { kind: "bought", buys: b(1) }, null), b(100), "no creator base price: materials only");
}

function testRatio(): void {
  assert.equal(ratioOf(b(200), b(100)), 2);
  assert.equal(ratioOf(null, b(100)), null);
  assert.equal(ratioOf(b(1), b(0)), null);
  for (const [r, want] of [[0.5, true], [2, true], [1, true], [0.49, false], [2.01, false], [null, false]] as const) assert.equal(passes(r), want, String(r));
  assert.equal(jaccard(["a", "b"], ["b", "c"]), 1 / 3);
  assert.equal(jaccard([], []), 1);
  assert.equal(jaccard(["a"], []), 0);
  const driver = topDriver([{ id: "chaos", label: "Chaos Orb", totalDiv: b(30) }, { id: "omen-of-whittling", label: "Omen of Whittling", totalDiv: b(70) }, { id: "x", label: "x", totalDiv: null }]);
  assert.deepEqual(driver, { id: "omen-of-whittling", label: "Omen of Whittling", div: 70, share: 0.7 });
  assert.equal(topDriver([]), null);
}

function testCheck(): void {
  const base = [entry("a", 1.5), entry("b", 7.6), entry("c", 0.5), entry("d", 3), entry("e", 1.2)];
  const same = checkAgainstBaseline(base, base, null);
  assert.deepEqual(same.regressions, []);
  const moved = checkAgainstBaseline(base, [entry("a", 1.7), entry("b", 8.5), entry("c", 0.45), entry("d", 1.2), entry("e", null, { kind: "timeout", message: "slow" })], null);
  const ids = moved.regressions.map((r) => r.split(":")[0]);
  assert.deepEqual(ids, ["a", "b", "c", "c", "e", "e"], moved.regressions.join("\n"));
  assert.match(moved.regressions.find((r) => r.startsWith("c"))!, /pass → fail/);
  const small = checkAgainstBaseline(base, [entry("a", 1.6), entry("b", 8), entry("c", 0.5), entry("d", 2.9), entry("e", 1.0)], null);
  assert.deepEqual(small.regressions, [], "within 10% of the baseline's distance, or closer to 1, is fine");
  assert.equal(checkAgainstBaseline([entry("u", 0.8)], [entry("u", 1.3)], null).regressions.length, 0, "|ln 1.3| ≤ |ln 0.8| + ln 1.1");
  assert.equal(checkAgainstBaseline([entry("u", 0.8)], [entry("u", 1.4)], null).regressions.length, 1, "|ln 1.4| > |ln 0.8| + ln 1.1: crossing 1 still counts as moving away");
  const lost = checkAgainstBaseline(base, base.slice(1), null);
  assert.match(lost.regressions[0]!, /^a: in the baseline but not in this run/);
  const only = checkAgainstBaseline(base, [entry("b", 7.6), entry("new", 1)], new Set(["b"]));
  assert.deepEqual(only.regressions, [], "--only checks just the chosen entry");
  assert.deepEqual(only.notes, ["new: new, not in the baseline"]);
}

function testScoreboardShape(): void {
  const entries = [entry("a", 1), entry("b", null, { kind: "rejected", message: "no" })];
  const board = {
    schema_version: 2,
    generatedAt: "2026-10-07T00:00:00.000Z",
    prices: { league: "L", fetchedAt: "2026-10-07T00:00:00.000Z", source: "test" },
    budget: { clock: "cpu", searchMs: 10000, alternativesMs: 3000 },
    summary: summarize(entries),
    entries,
  };
  assert.deepEqual(board.summary, { entries: 2, counted: 2, excluded: 0, passed: 1, errored: 1 });
  assert.ok(scoreboardSchema.safeParse(board).success);
}

export function runScoreCases(ok: (name: string, fn: () => void) => void): void {
  ok("scoring: creator cost (uses × price + base), planner cost (+ bought bases at the same ask)", testCosts);
  ok("scoring: ratio, the 0.5–2 pass band, Jaccard, top cost driver", testRatio);
  ok("--check: flags >10% further from 1, pass → fail, lost ratio, lost entry; --only and new entries", testCheck);
  ok("scoreboard: summary counts and schema", testScoreboardShape);
}
