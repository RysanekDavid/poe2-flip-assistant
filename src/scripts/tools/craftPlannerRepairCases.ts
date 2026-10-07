/* Craft planner slam-chain miss repair (G5b): partial hits and the unsteered Annulment by hand, the
 * steered one only when the other side holds something an Annulment must not take (or when its omen
 * is the cheaper repair), the search bound admissible at the cheaper repair, and the step text.
 * Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { slamBound } from "../../core/tools/planner/edgeBounds";
import { solveChain } from "../../core/tools/planner/expectation";
import { EXALT_TIERS, mat } from "../../core/tools/planner/methodKit";
import { movesFrom } from "../../core/tools/planner/methods";
import { buildCtx } from "../../core/tools/planner/plan";
import { rankCost } from "../../core/tools/planner/rank";
import { buildChain, slamScope, type Chain } from "../../core/tools/planner/slamChain";
import { junk, targetAffix } from "../../core/tools/planner/state";
import type { PlanAffix, PlanCtx, PlanState } from "../../core/tools/planner/types";
import type { PlanRequest } from "../../lib/tools/craftPlannerContract";
import { fixturePrices, target } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const REQ: PlanRequest = {
  itemClass: "Rings",
  base: "Ruby Ring",
  ilvl: 82,
  targets: [target("PhysicalDamage", "prefix", "AddedPhysicalDamage9"), target("ColdDamage", "prefix", "AddedColdDamage9"), target("LightningResistance", "suffix", "LightningResist7")],
  includeUnverified: false,
  quality: null,
};
const ctxWith = (cat: CraftCatalog, prices = fixturePrices()): PlanCtx => buildCtx(REQ, { cat, prices, exaltPerDivine: null, league: "Test", now: NOW }).ctx;
// a fractured throwaway prefix leaves exactly two open prefixes and is immune to the Annulment
const withSuffixes = (suffixes: PlanAffix[]): PlanState => ({ rarity: "Rare", affixes: [junk("prefix", "fractured"), ...suffixes], quality: 0, catalyst: null });
const PLAIN = withSuffixes([junk("suffix"), junk("suffix"), junk("suffix")]);

const ids = {
  exalt: mat("exalted").id,
  annul: mat("annul").id,
  steer: mat("omenSinistralAnnulment").id,
  replantOmen: mat("omenDextralExaltation").id,
};

function prefixChain(ctx: PlanCtx, state: PlanState, suffixesFull = true): Chain {
  const scope = slamScope(state, ctx, "prefix");
  assert.ok(scope && scope.missing0 === 3 && scope.j0 === 0 && scope.steerExalt !== suffixesFull, "both prefixes missing");
  return buildChain(state, ctx, scope, { tier: EXALT_TIERS[0]!, catalysing: false }, 1);
}

/** The chain's own slam odds: S3 → a / b lands (pa, pb); with a landed, b lands (qb); with b landed, a lands (qa). */
function slamOdds(chain: Chain): { pa: number; pb: number; qa: number; qb: number } {
  const edge = (from: string, to: string) => chain.nodes.find((n) => n.id === from)!.edges.find((e) => e.to === to)?.p ?? 0;
  const odds = { pa: edge("3:0", "2:0"), pb: edge("3:0", "1:0"), qa: edge("1:0", "0:0"), qb: edge("2:0", "0:0") };
  assert.ok(odds.pa > 0 && odds.pb > 0 && odds.qa > odds.pa && odds.qb > odds.pb, "a landed prefix blocks its family: the second slam has better odds");
  return odds;
}

/**
 * By hand, in "finished repairs": every repair after a miss moves the chain like a steered one (the
 * miss with 1/t, each landed target with 1/t), so with la = (1 − qb)/2 the chance a slam with a
 * landed loses it, lb likewise, m = 1 − pa − pb and X = pa·la/(1 − la) + pb·lb/(1 − lb):
 *   E[units] = [slam·(1 + pa/(1 − la) + pb/(1 − lb)) + c2·(m + X) + c1·2X] / (pa + pb − X)
 * where slam = units per slam, c2 / c1 = units per finished repair with both / one target missing.
 */
function byHand(o: ReturnType<typeof slamOdds>, slam: number, c2: number, c1: number): number {
  const la = (1 - o.qb) / 2;
  const lb = (1 - o.qa) / 2;
  const x = (o.pa * la) / (1 - la) + (o.pb * lb) / (1 - lb);
  return (slam * (1 + o.pa / (1 - la) + o.pb / (1 - lb)) + c2 * (1 - o.pa - o.pb + x) + c1 * 2 * x) / (o.pa + o.pb - x);
}

/**
 * Two prefix targets, three plain suffix throwaways. Unsteered, an Annulment picks among N = t + 3
 * mods: with both missing t = 1 (the miss) → a finished repair is N/t = 4 Annulments and 3/1
 * re-plants, each an Exalt + Dextral Exaltation (one prefix slot is still open); with one landed
 * t = 2 → 5/2 Annulments and 3/2 bare Exalts (no prefix slot open). At the fixture prices that is
 * 1.152 and 0.156 div per repair against 2.06 for Sinistral Annulment + Annulment.
 */
function testUnsteeredByHand(cat: CraftCatalog): void {
  const chain = prefixChain(ctxWith(cat), PLAIN);
  const o = slamOdds(chain);
  const node = (id: string) => chain.nodes.find((n) => n.id === id)!;
  assert.deepEqual(node("3:1").edges, [{ to: "3:0", p: 1 / 4 }, { to: "3:1:replant", p: 3 / 4 }], "both missing: the miss 1 in 4, a suffix 3 in 4");
  assert.deepEqual(node("3:1:replant").cost, { [ids.exalt]: 1, [ids.replantOmen]: 1 }, "a prefix slot is open: the re-plant needs Dextral Exaltation");
  assert.deepEqual(node("2:1:replant").cost, { [ids.exalt]: 1 }, "no prefix slot open: a bare Exalt lands a suffix");
  assert.ok(chain.nodes.every((n) => !(ids.steer in n.cost)), "no Sinistral Annulment anywhere");
  const solved = solveChain(chain.nodes, "3:0", Object.values(ids));
  const slams = byHand(o, 1, 0, 0);
  assert.ok(near(solved[ids.exalt]!, slams + byHand(o, 0, 3, 3 / 2), 1e-9), `Exalts = slams + re-plants: ${solved[ids.exalt]}`);
  assert.ok(near(solved[ids.annul]!, byHand(o, 0, 4, 5 / 2), 1e-9), `Annulments by hand: ${solved[ids.annul]}`);
  assert.ok(near(solved[ids.replantOmen]!, byHand(o, 0, 3, 0), 1e-9), `Dextral Exaltations by hand: ${solved[ids.replantOmen]}`);
  assert.equal(solved[ids.steer], 0);
  assert.ok(slams < 1 / (o.pa * o.qb), "partial hits are kept: far below needing both on one go");
  assert.equal(chain.undoes, true, "the second prefix's misses can take the first");
  assert.deepEqual(chain.repairs.map((r) => [r.placed, r.repair]), [[0, { kind: "unsteered", replantOmen: true }], [1, { kind: "unsteered", replantOmen: false }]]);
}

/** A suffix the Annulment must not take (a landed target, a desecrated mod): steered, and Annulments = slams − 2 hits. */
function testSteeredOnlyForNonJunk(cat: CraftCatalog): void {
  const ctx = ctxWith(cat);
  for (const [name, keep] of [["a landed suffix target", targetAffix("suffix", 2, "explicit")], ["a desecrated suffix", junk("suffix", "desecrated")]] as const) {
    const chain = prefixChain(ctx, withSuffixes([keep, junk("suffix"), junk("suffix")]));
    assert.ok(chain.repairs.every((r) => r.repair.kind === "steered"), `${name}: steered`);
    assert.ok(chain.nodes.every((n) => !n.id.endsWith(":replant")), `${name}: no re-plant`);
    const solved = solveChain(chain.nodes, "3:0", Object.values(ids));
    const slams = byHand(slamOdds(chain), 1, 0, 0);
    assert.ok(near(solved[ids.exalt]!, slams, 1e-9), `${name}: slams by hand`);
    assert.ok(near(solved[ids.annul]!, slams - 2, 1e-9) && near(solved[ids.steer]!, slams - 2, 1e-9), `${name}: an Annulment (+ omen) per finished repair`);
  }
  // nothing removable on the other side: a plain Annulment can only take a prefix
  const bare = prefixChain(ctx, withSuffixes([]), false);
  assert.ok(bare.repairs.length > 0 && bare.repairs.every((r) => r.repair.kind === "plain"), "no suffix at all: plain Annulments");
  // the choice is by price: an omen cheaper than the re-plants wins even over plain throwaways
  const cheapOmen = fixturePrices();
  cheapOmen.set(ids.steer, 0.01);
  const steered = prefixChain(ctxWith(cat, cheapOmen), PLAIN);
  assert.deepEqual(steered.repairs.map((r) => r.repair.kind), ["steered", "steered"], "a 0.01-div omen beats 1.152 / 0.156 div of re-plants");
}

/**
 * The bound prices the cheaper repair: the old bound (steered at 2.06 a repair) sits above what the
 * unsteered chain costs, which the eager search would throw on; the new one sits under it.
 */
function testBoundAdmissible(cat: CraftCatalog): void {
  const ctx = ctxWith(cat);
  const scope = slamScope(PLAIN, ctx, "prefix")!;
  for (const tier of EXALT_TIERS) {
    const move = movesFrom(PLAIN, ctx).find((m) => m.move.methodId === `slam-prefix-${tier.rule}`)?.move;
    assert.ok(move, `a ${tier.label} slam move`);
    const cost = rankCost(move, ctx);
    const v = { tier, catalysing: false };
    assert.ok(slamBound(PLAIN, ctx, scope, v, new Map()) <= cost, `${tier.label}: bound under the cost`);
    assert.ok(slamBound(PLAIN, ctx, { ...scope, otherJunkOnly: false }, v, new Map()) > cost, `${tier.label}: a steered-priced bound would be above it`);
    const repair = move.steps.find((s) => s.retry === "self")!;
    assert.match(repair.do, /^A prefix you don't want → Orb of Annulment, then slam again\. If it takes one of the suffix throwaways instead: Omen of Dextral Exaltation \+ Exalted Orb → a new suffix throwaway \(no omen needed once every prefix slot is full\), then annul again\.$/);
    assert.deepEqual(repair.mats.map((m) => m.id), [ids.annul, ids.exalt, ids.replantOmen]);
    assert.ok(move.ruleIds.includes("annul") && move.ruleIds.includes("omen-dextral-exaltation") && !move.ruleIds.includes("omen-sinistral-annulment"), `legality checked per click: ${move.ruleIds.join(", ")}`);
  }
}

/**
 * Sinistral Annulment at 1 div: a repair with both prefixes missing costs 1.06 steered against 1.152
 * unsteered, one with a prefix landed 0.156 unsteered — so the chain steers only its first repairs,
 * says so, checks both Annulment clicks, and the bound (priced per level the same way) stays under.
 */
function testMixedRepair(cat: CraftCatalog): void {
  const prices = fixturePrices();
  prices.set(ids.steer, 1);
  const ctx = ctxWith(cat, prices);
  assert.deepEqual(prefixChain(ctx, PLAIN).repairs.map((r) => r.repair.kind), ["steered", "unsteered"]);
  const move = movesFrom(PLAIN, ctx).find((m) => m.move.methodId === "slam-prefix-exalt")!.move;
  const repair = move.steps.find((s) => s.retry === "self")!;
  assert.match(repair.do, /^A prefix you don't want → Omen of Sinistral Annulment \(while no good prefix is on the item\) \+ Orb of Annulment, then slam again\. If it takes one of the suffix throwaways instead: Exalted Orb → a new suffix throwaway \(only a suffix slot is open\), then annul again\.$/);
  assert.match(repair.why, /the omen pays for itself only while few good prefixes are on the item/);
  assert.ok(move.ruleIds.includes("annul") && move.ruleIds.includes("omen-sinistral-annulment") && !move.ruleIds.includes("omen-dextral-exaltation"));
  assert.ok(slamBound(PLAIN, ctx, slamScope(PLAIN, ctx, "prefix")!, { tier: EXALT_TIERS[0]!, catalysing: false }, new Map()) <= rankCost(move, ctx));
}

export function runRepairCases(cat: CraftCatalog): void {
  testUnsteeredByHand(cat);
  testSteeredOnlyForNonJunk(cat);
  testBoundAdmissible(cat);
  testMixedRepair(cat);
}
