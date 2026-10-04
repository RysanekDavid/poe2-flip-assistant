/* Craft planner route memo and cheaper-target completeness: a plan whose cheaper-target search was
 * cut short is not cached, a timed-out request is refused again for the negative TTL without
 * re-running, and a candidate whose search hit the state cap marks the list incomplete instead of
 * passing for "no plan". Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { suggestAlternatives } from "../../core/tools/planner/alternatives";
import { buildCtx, planCraft, PlanTimeoutError } from "../../core/tools/planner/plan";
import { createPlanCache } from "../../core/tools/planner/planCache";
import { SearchCappedError, searchPlan } from "../../core/tools/planner/search";
import { unrollPlan } from "../../core/tools/planner/unroll";
import type { PlanResponse } from "../../lib/tools/craftPlannerContract";
import { OWNER_FLAT_RING, pricesWithoutCatalysts } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

function counted(plan: PlanResponse): { compute: () => PlanResponse; calls: () => number } {
  let n = 0;
  return {
    compute: () => {
      n += 1;
      return plan;
    },
    calls: () => n,
  };
}

function testPlanCache(cat: CraftCatalog): void {
  const plan = planCraft(OWNER_FLAT_RING, { cat, prices: pricesWithoutCatalysts(), exaltPerDivine: 250, league: "Test", now: NOW });
  const cache = createPlanCache({ planTtlMs: 600_000, timeoutTtlMs: 45_000, maxEntries: 4 });
  const whole = counted(plan);
  cache.get("whole", whole.compute, 0);
  cache.get("whole", whole.compute, 1_000);
  assert.equal(whole.calls(), 1, "a complete plan is served from the memo");
  const cut = counted({ ...plan, alternativesTruncated: true });
  cache.get("cut", cut.compute, 0);
  cache.get("cut", cut.compute, 1_000);
  assert.equal(cut.calls(), 2, "a plan with a cut-short cheaper-target search is never stored");
  let runs = 0;
  const slow = () => {
    runs += 1;
    throw new PlanTimeoutError(3_100);
  };
  assert.throws(() => cache.get("slow", slow, 0), PlanTimeoutError);
  assert.throws(() => cache.get("slow", slow, 44_000), PlanTimeoutError, "refused again inside the 45 s window");
  assert.equal(runs, 1, "without re-running the heavy search");
  assert.throws(() => cache.get("slow", slow, 46_000), PlanTimeoutError);
  assert.equal(runs, 2, "after the window the request is tried again");
}

/** A candidate whose search gave up at the state cap: the list is marked incomplete, the rest still planned. */
function testCappedCandidate(cat: CraftCatalog): void {
  const { ctx } = buildCtx(OWNER_FLAT_RING, { cat, prices: pricesWithoutCatalysts(), exaltPerDivine: 250, league: "Test", now: NOW });
  const base = { ctx, out: unrollPlan(searchPlan(ctx).moves, ctx, 250) };
  let calls = 0;
  const capped = suggestAlternatives(OWNER_FLAT_RING, base, () => {
    calls += 1;
    throw new SearchCappedError(5000);
  });
  assert.equal(capped.truncated, true, "a capped candidate is not \"no plan\"");
  assert.deepEqual(capped.alternatives, []);
  assert.ok(calls > 1, `the other candidates are still tried (${calls})`);
  const none = suggestAlternatives(OWNER_FLAT_RING, base, () => null);
  assert.equal(none.truncated, false, "candidates without a plan leave the list complete");
}

export function runCacheCases(cat: CraftCatalog): void {
  testPlanCache(cat);
  testCappedCandidate(cat);
}
