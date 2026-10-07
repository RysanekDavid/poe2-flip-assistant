/* Craft planner PR-A cases: fracture the wanted mod. The Fracturing Orb may lock a landed natural
 * target (not only one the player flagged fractured) while another is still missing, behind an
 * unrevealed desecrated blocker at 1-in-3 (Alohaa, KB §2); the Chaos loop runs on any all-throwaway
 * rare; the owner's T1 pool ring no longer whittles. Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import { loadCraftMining } from "../../core/research/craftMining/load";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { movesFrom } from "../../core/tools/planner/methods";
import { buildCtx, planCraft } from "../../core/tools/planner/plan";
import { revealPriorsFrom } from "../../core/tools/planner/revealPriors";
import { canonical, junk, modOf, targetAffix } from "../../core/tools/planner/state";
import type { Move, PlanAffix, PlanCtx, PlanState } from "../../core/tools/planner/types";
import { planResponseSchema, type PlanRequest, type PlanResponse } from "../../lib/tools/craftPlannerContract";
import { FRACTURED_T1RES_RING, OWNER_POOL_RING, fixturePrices, target } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const deps = (cat: CraftCatalog) => ({ cat, prices: fixturePrices(), exaltPerDivine: 250, league: "Test", now: NOW, reveal: revealPriorsFrom(loadCraftMining().priors) });
const ctxOf = (cat: CraftCatalog, req: PlanRequest): PlanCtx => buildCtx(req, deps(cat)).ctx;
const rare = (affixes: PlanAffix[]): PlanState => canonical({ rarity: "Rare", affixes, quality: 0, catalyst: null });
const movesOf = (state: PlanState, ctx: PlanCtx, methodId: string | RegExp): Move[] =>
  movesFrom(state, ctx)
    .map((m) => m.move)
    .filter((m) => (typeof methodId === "string" ? m.methodId === methodId : methodId.test(m.methodId)));
const blockerP: PlanAffix = { ...junk("prefix", "desecrated"), unrevealed: true };
/** The owner's ring as a pool with top-tier (T1 of 9) flats: three prefix slots, two suffix slots. */
const T9_POOL = OWNER_POOL_RING({ kind: "clean" }, null, 9);

/** {flat 1 P, junk S, junk S, unrevealed desecrated P}, nothing flagged fractured: one fracture, 1-in-3. */
function testSelfFractureOdds(cat: CraftCatalog): void {
  const ctx = ctxOf(cat, T9_POOL);
  const flat = targetAffix("prefix", 0, "explicit", 0);
  const fr = movesOf(rare([flat, junk("suffix"), junk("suffix"), blockerP]), ctx, "fracture");
  assert.equal(fr.length, 1, "exactly one fracture move: the landed flat");
  assert.equal(fr[0]!.odds.point, 1 / 3, "4 mods, 1 desecrated → 1/3");
  assert.equal(fr[0]!.restartP, 1 / 3, "a miss restarts on a new base");
  const check = fr[0]!.steps[0]!.check ?? "";
  assert.ok(check.startsWith(modOf(ctx, flat).text.split("\n").join(" / ")) && !check.includes("any of"), `a pool slot names the landed candidate: ${check}`);
  assert.ok(fr[0]!.next.affixes.some((a) => a.kind === "fractured" && a.target === 0 && a.alt === 0), "the flat ends up fractured");
}

/** Fracturing the last target protects nothing; a target the player wants fractured keeps the one fracture. */
function testFracturePrune(cat: CraftCatalog): void {
  const single = ctxOf(cat, { itemClass: "Rings", base: "Ruby Ring", ilvl: 82, targets: [target("IncreasedMana", "prefix", "IncreasedMana12")], includeUnverified: false, quality: null });
  const mana = targetAffix("prefix", 0, "explicit");
  assert.deepEqual(movesOf(rare([mana, junk("suffix"), junk("suffix"), blockerP]), single, "fracture"), [], "the last target is never fractured");
  assert.deepEqual(movesOf(rare([mana, junk("suffix"), junk("suffix")]), single, /^blocker-/), [], "no blocker when no fracture would follow");
  const flagged = ctxOf(cat, FRACTURED_T1RES_RING);
  const fire = targetAffix("prefix", 1, "explicit");
  assert.deepEqual(movesOf(rare([fire, junk("suffix"), junk("suffix"), blockerP]), flagged, "fracture"), [], "the cold flat must be the fractured one: the fire flat never takes the fracture");
}

/** The blocker comes as the 4th mod of an unfractured item that holds a landed target. */
function testSelfFractureBlocker(cat: CraftCatalog): void {
  const ctx = ctxOf(cat, T9_POOL);
  const flat = targetAffix("prefix", 0, "explicit", 0);
  assert.ok(movesOf(rare([flat, junk("suffix"), junk("suffix")]), ctx, /^blocker-/).length > 0, "3 mods with a landed flat: the blocker makes the 4th");
  assert.deepEqual(movesOf(rare([flat, junk("suffix")]), ctx, /^blocker-/), [], "2 mods: the orb needs 4, a blocker alone won't do");
  assert.deepEqual(movesOf(rare([junk("prefix"), junk("suffix"), junk("suffix")]), ctx, /^blocker-/), [], "nothing worth fracturing yet");
}

/** Rare {junk any, junk any} Chaos-loops like the anchored rare: one throwaway stays and blocks one family. */
function testChaosLoopOnThrowaways(cat: CraftCatalog): void {
  const ctx = ctxOf(cat, T9_POOL);
  const flatLoop = (s: PlanState) => movesOf(s, ctx, "chaos-loop").find((m) => m.next.affixes.some((a) => a.target === 0));
  const anchored = flatLoop(rare([junk("suffix", "fractured"), junk("any")]));
  const two = flatLoop(rare([junk("any"), junk("any")]));
  assert.ok(anchored && two, "both rares Chaos-loop for the first flat");
  assert.ok(Math.abs(anchored.odds.point! - 0.0148148) < 1e-6, `anchored loop ≈ 1/67.5, got ${anchored.odds.point}`);
  assert.equal(two.odds.point, anchored.odds.point, "same odds as the anchored loop");
  assert.equal(two.next.affixes.filter((a) => a.target == null).length, 1, "one throwaway stays");
  assert.match(two.steps[0]!.why, /Every loose mod is a throwaway/);
  assert.deepEqual(movesOf(rare([junk("prefix"), junk("suffix")]), ctx, "chaos-loop"), [], "throwaways on both sides: which side frees up is random, so no loop is planned");
}

const methods = (p: PlanResponse): string[] => p.steps.map((s) => s.method);

/** The owner's T1 pool ring from a clean base (fixture prices): was 255.36 div with ~34 Whittles. */
function testOwnerPoolT9(cat: CraftCatalog): void {
  const p = planResponseSchema.parse(planCraft(T9_POOL, deps(cat)));
  const seq = methods(p);
  const fracture = p.steps.find((s) => s.method === "fracture");
  assert.ok(fracture, `the route fractures a wanted mod: ${seq.join(", ")}`);
  const locked = fracture.after.affixes.find((a) => a.kind === "fractured");
  assert.ok(locked?.target != null && p.targets[locked.target]!.group != null, "the fractured mod fills a pool slot");
  assert.ok(!(fracture.instructions[0]!.check ?? "").includes("any of"), "its check names the landed flat");
  assert.ok(!seq.includes("whittle-loop"), `no whittle loop: ${seq.join(", ")}`);
  const total = p.totals.div!.point;
  assert.ok(total >= 100 && total <= 160, `T1 flats + resistances from a clean base: ${total} div (was 255.36)`);
  assert.ok(p.expanded < 600, `searched ${p.expanded} item states (CPU budget)`);
}

export function runFractureCases(cat: CraftCatalog): void {
  testSelfFractureOdds(cat);
  testFracturePrune(cat);
  testSelfFractureBlocker(cat);
  testChaosLoopOnThrowaways(cat);
  testOwnerPoolT9(cat);
}
