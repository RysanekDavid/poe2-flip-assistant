/* Craft planner lazy-edge cases (PR-A perf fix): the slam-fill / whittle-loop edges are offered at an
 * admissible bound and built only when it comes up. Pinned here: the lazy search returns exactly the
 * eager search's plan, totals and `expanded` on the golden and owner requests; every bound sits at or
 * under its edge's cost; the owner ring and two six-single Breach Rings keep their state counts and
 * finish inside the server's budget. Also the fracture review fixes (miss text, crafted keeper).
 * Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import { loadCraftMining } from "../../core/research/craftMining/load";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { edgesFrom, movesFrom } from "../../core/tools/planner/methods";
import { buildCtx, planCraft, SERVER_PLAN_BUDGET } from "../../core/tools/planner/plan";
import { rankCost } from "../../core/tools/planner/rank";
import { revealPriorsFrom } from "../../core/tools/planner/revealPriors";
import { searchPlan, type EdgeMode } from "../../core/tools/planner/search";
import { canonical, junk, targetAffix } from "../../core/tools/planner/state";
import type { LazyEdge, Move, PlanAffix, PlanCtx, PlanState } from "../../core/tools/planner/types";
import { unrollPlan } from "../../core/tools/planner/unroll";
import type { PlanRequest } from "../../lib/tools/craftPlannerContract";
import { BREACH_RING, FOUR_FLAT_DUSK, FRACTURE_PLUS3_AMULET, FRACTURED_T1RES_RING, OWNER_FLAT_RING, OWNER_POOL_RING, fixturePrices, pricesWithoutCatalysts, target } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const reveal = revealPriorsFrom(loadCraftMining().priors);
const deps = (cat: CraftCatalog, prices: Map<string, number>) => ({ cat, prices, exaltPerDivine: 250, league: "Test", now: NOW, reveal });
const breach = (targets: PlanRequest["targets"], includeUnverified: boolean): PlanRequest => ({ itemClass: "Rings", base: "Breach Ring", ilvl: 82, targets, includeUnverified, quality: null });

/** The review's two six-single Breach Rings that timed out (503) under the server budget. */
export const SIX_T9_MIX = breach(
  [
    target("PhysicalDamage", "prefix", "AddedPhysicalDamage9"),
    target("LightningDamage", "prefix", "AddedLightningDamage9"),
    target("ColdDamage", "prefix", "AddedColdDamage9"),
    target("IncreasedCastSpeed", "suffix", "CastSpeedJewellery5"),
    target("ItemFoundRarityIncrease", "suffix", "ItemFoundRarityIncrease3"),
    target("FireResistance", "suffix", "FireResist7"),
  ],
  true,
);
export const SIX_T8_MIX = breach(
  [
    target("PhysicalDamage", "prefix", "AddedPhysicalDamage8"),
    target("LightningDamage", "prefix", "AddedLightningDamage8"),
    target("ColdDamage", "prefix", "AddedColdDamage8"),
    target("IncreasedCastSpeed", "suffix", "CastSpeedJewellery5"),
    target("FireResistance", "suffix", "FireResist7"),
    target("ColdResistance", "suffix", "ColdResist7"),
  ],
  true,
);

interface Case {
  name: string;
  req: PlanRequest;
  prices: () => Map<string, number>;
}

const EQUIVALENCE: readonly Case[] = [
  { name: "Breach mana stacker golden", req: BREACH_RING, prices: fixturePrices },
  { name: "fractured-flat res ring golden", req: FRACTURED_T1RES_RING, prices: fixturePrices },
  { name: "fractured +3 amulet golden", req: FRACTURE_PLUS3_AMULET, prices: fixturePrices },
  { name: "owner flat ring", req: OWNER_FLAT_RING, prices: pricesWithoutCatalysts },
  { name: "owner T1 pool ring", req: OWNER_POOL_RING({ kind: "clean" }, null, 9), prices: fixturePrices },
  { name: "four-flat Dusk Ring", req: FOUR_FLAT_DUSK, prices: pricesWithoutCatalysts },
];

function planned(cat: CraftCatalog, c: Case, mode: EdgeMode) {
  const { ctx } = buildCtx(c.req, deps(cat, c.prices()));
  const found = searchPlan(ctx, undefined, null, mode);
  return { ctx, found, out: unrollPlan(found.moves, ctx, 250) };
}

/** Branch and bound must not change the answer: same steps, same totals, same states expanded. */
function testLazyEqualsEager(cat: CraftCatalog): void {
  for (const c of EQUIVALENCE) {
    const lazy = planned(cat, c, "lazy");
    const eager = planned(cat, c, "eager");
    assert.deepEqual(lazy.found.moves.map((m) => m.methodId), eager.found.moves.map((m) => m.methodId), `${c.name}: same route`);
    assert.deepEqual(lazy.out.totals, eager.out.totals, `${c.name}: identical totals`);
    assert.deepEqual(lazy.out.steps, eager.out.steps, `${c.name}: identical steps`);
    assert.equal(lazy.found.expanded, eager.found.expanded, `${c.name}: same states expanded`);
    assertBoundsAdmissible(lazy.ctx, statesAlong(lazy.found.moves), c.name);
  }
}

/** Every item the plan passes through (where the search expanded and offered lazy edges). */
const statesAlong = (moves: readonly Move[]): PlanState[] => moves.map((m) => m.next);

/** At each state: every lazy edge's bound (and its refined bound) ≤ the built Move's rank cost. */
function assertBoundsAdmissible(ctx: PlanCtx, states: readonly PlanState[], name: string): void {
  let checked = 0;
  for (const state of states) {
    for (const e of edgesFrom(state, ctx)) {
      if (!e.lazy) continue;
      const chain: LazyEdge[] = [e.lazy];
      for (let r = e.lazy.refine?.() ?? null; r; r = r.refine?.() ?? null) chain.push(r);
      const move = chain[chain.length - 1]!.build();
      if (!move) continue;
      const cost = rankCost(move, ctx);
      for (const edge of chain) assert.ok(edge.bound <= cost + 1e-9, `${name}: ${move.methodId} bound ${edge.bound} above its cost ${cost}`);
      checked += 1;
    }
  }
  assert.ok(checked > 0 || name.includes("amulet"), `${name}: some lazy edge was checked`);
}

/** Pins `expanded` (the lazy search expands exactly the eager one's states) and the server budget. */
const PINS: ReadonlyArray<Case & { expanded: number }> = [
  { name: "owner flat ring", req: OWNER_FLAT_RING, prices: pricesWithoutCatalysts, expanded: 1628 },
  { name: "six singles T9 flats + cast/rarity/fire", req: SIX_T9_MIX, prices: fixturePrices, expanded: 2378 },
  { name: "six singles T8 flats + cast + fire/cold", req: SIX_T8_MIX, prices: fixturePrices, expanded: 1428 },
];

function testBudgetPins(cat: CraftCatalog): void {
  for (const c of PINS) {
    // the server's own limits: a PlanTimeoutError (503) here fails the test loudly
    const p = planCraft(c.req, { ...deps(cat, c.prices()), budget: SERVER_PLAN_BUDGET });
    assert.equal(p.expanded, c.expanded, `${c.name}: expanded pinned`);
    assert.ok(p.steps.length > 0 && p.totals.div != null, `${c.name}: a priced plan`);
  }
}

const rare = (affixes: PlanAffix[]): PlanState => canonical({ rarity: "Rare", affixes, quality: 0, catalyst: null });
const blockerP: PlanAffix = { ...junk("prefix", "desecrated"), unrevealed: true };

/** A crafted keeper (the alloy) is lockable like an explicit one: the blocker comes, then the fracture. */
function testCraftedKeeper(cat: CraftCatalog): void {
  const req: PlanRequest = { itemClass: "Rings", base: "Ruby Ring", ilvl: 82, targets: [target("PhysicalDamage", "prefix", "AddedPhysicalDamage7"), target("IncreasedAttackSpeedNoCastSpeed", "suffix", "AlloyAttackSpeedRing1")], includeUnverified: true, quality: null };
  const { ctx } = buildCtx(req, deps(cat, fixturePrices()));
  const alloy = targetAffix("suffix", 1, "crafted");
  const three = rare([alloy, junk("prefix"), junk("suffix")]);
  assert.ok(movesFrom(three, ctx).some((m) => /^blocker-/.test(m.move.methodId)), "3 mods holding the crafted alloy, the flat missing: the blocker makes the 4th");
  const fr = movesFrom(rare([alloy, junk("suffix"), junk("prefix"), blockerP]), ctx).filter((m) => m.move.methodId === "fracture");
  assert.equal(fr.length, 1, "the alloy is the one fracture aim");
  assert.equal(fr[0]!.move.odds.point, 1 / 3, "4 mods, the blocker can't be picked → 1/3");
}

/** P keeps counting another wanted mod as a miss; the text says so and tells the player to keep that item. */
function testFractureMissText(cat: CraftCatalog): void {
  const { ctx } = buildCtx(OWNER_POOL_RING({ kind: "clean" }, null, 9), deps(cat, fixturePrices()));
  const flat0 = targetAffix("prefix", 0, "explicit", 0);
  const flat1 = targetAffix("prefix", 1, "explicit", 1);
  const lone = movesFrom(rare([flat0, junk("suffix"), junk("suffix"), blockerP]), ctx).find((m) => m.move.methodId === "fracture")!.move;
  assert.match(lone.steps[0]!.onFail ?? "", /^A throwaway fractured → .*start over on a new base/);
  assert.doesNotMatch(lone.steps[0]!.onFail ?? "", /Another wanted mod/, "no other wanted mod: one miss case");
  assert.doesNotMatch(lone.odds.formula, /count/, "no other wanted mod: nothing to explain");
  const two = movesFrom(rare([flat0, flat1, junk("suffix"), junk("suffix")]), ctx).filter((m) => m.move.methodId === "fracture");
  assert.ok(two.length > 0, "two landed flats: each may be fractured");
  for (const { move } of two) {
    assert.equal(move.odds.point, 1 / 4, "P unchanged: 1 in 4 mods");
    assert.match(move.steps[0]!.onFail ?? "", /A throwaway fractured → .*new base.* Another wanted mod fractured → keep the item/);
    assert.match(move.odds.formula, /The 1 other wanted mod on the item counts as a miss here.*safe side/);
  }
}

export function runLazyCases(cat: CraftCatalog): void {
  testLazyEqualsEager(cat);
  testBudgetPins(cat);
  testCraftedKeeper(cat);
  testFractureMissText(cat);
}
