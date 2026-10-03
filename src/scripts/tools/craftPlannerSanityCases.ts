/* Craft planner cost sanity: the owner's refused prod plan (three top-tier flat attack prefixes on a
 * Breach Ring) is flagged impractical and offers cheaper target sets costed by the same model; the
 * slam chain keeps partial hits (checked by hand); golden plans stay unflagged. Imported by
 * testCraftPlanner.ts. */
import assert from "node:assert/strict";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { MAX_ALTERNATIVES } from "../../core/tools/planner/alternatives";
import { solveChain } from "../../core/tools/planner/expectation";
import { EXALT_TIERS, mat } from "../../core/tools/planner/methodKit";
import { buildCtx, planCraft } from "../../core/tools/planner/plan";
import { IMPRACTICAL_CLICKS } from "../../core/tools/planner/sanity";
import { buildChain, slamScope } from "../../core/tools/planner/slamChain";
import { junk } from "../../core/tools/planner/state";
import type { PlanState } from "../../core/tools/planner/types";
import { planResponseSchema, type PlanRequest, type PlanResponse } from "../../lib/tools/craftPlannerContract";
import { BREACH_RING, FRACTURE_PLUS3_AMULET, FRACTURED_T1RES_RING, OWNER_FLAT_RING, fixturePrices, pricesWithoutCatalysts, target } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const planWith = (cat: CraftCatalog, req: PlanRequest, prices: Map<string, number>): PlanResponse =>
  planResponseSchema.parse(planCraft(req, { cat, prices, exaltPerDivine: 250, league: "Test", now: NOW }));

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/** Every alternative is cheaper, and planning its targets reproduces its totals exactly (same model, no shortcut). */
function assertAlternatives(cat: CraftCatalog, p: PlanResponse, prices: Map<string, number>): void {
  assert.ok(p.alternatives.length >= 1 && p.alternatives.length <= MAX_ALTERNATIVES, `1..${MAX_ALTERNATIVES} alternatives, got ${p.alternatives.length}`);
  assert.equal(p.alternatives[0]!.impractical, false, "the first alternative is realistic");
  for (const alt of p.alternatives) {
    assert.ok(alt.totals.div && p.totals.div && alt.totals.div.point < p.totals.div.point, "an alternative is cheaper");
    const again = planWith(cat, { ...OWNER_FLAT_RING, targets: alt.targets }, prices);
    assert.deepEqual(again.totals.div, alt.totals.div, "the chip's cost is what planning its targets gives");
    assert.equal(again.steps.some((s) => s.impractical), alt.impractical);
    for (const c of alt.changes) {
      assert.equal(OWNER_FLAT_RING.targets[c.target]!.minModId, c.from.modId, "a change starts from the request's own tier");
      if (c.kind === "relax") assert.ok(c.to.k < c.from.k && c.to.level < c.from.level, "a relax lowers the minimum tier");
    }
  }
}

/** Before: 13,201 Greater Exalted Orbs (the prod bill to the unit). After: flagged, with a realistic alternative ~9× cheaper. */
function testOwnerCase(cat: CraftCatalog): void {
  const prices = pricesWithoutCatalysts();
  const p = planWith(cat, OWNER_FLAT_RING, prices);
  const slam = p.steps.find((s) => s.method === "slam-prefix-exalt-greater");
  assert.ok(slam, `the prod route: ${p.steps.map((s) => s.method).join(", ")}`);
  const greater = slam.materials.find((m) => m.id === mat("greaterExalted").id)!;
  assert.ok(near(greater.qty.point, 13_200.8, 1), `13,201 Greater Exalted Orbs as in prod, got ${greater.qty.point}`);
  assert.ok(slam.impractical, "the 13,201-slam step is flagged");
  assert.equal(slam.impractical.materialId, greater.id);
  assert.ok(near(slam.impractical.perClick!, 1 / 65, 1e-12), "per slam: 1/13 families × 1/5 tiers at the Greater floor");
  assert.equal(slam.impractical.undoRisk, true, "the Annulment can take a landed prefix");
  assert.equal(p.steps.filter((s) => s.impractical).length, 1, "only the prefix chain is past the limit");
  assertAlternatives(cat, p, prices);
  const best = p.alternatives[0]!;
  assert.deepEqual(best.changes.map((c) => [c.kind, c.target, c.kind === "relax" ? c.to.k : null]), [["relax", 0, 7], ["relax", 1, 7], ["relax", 2, 7]], "all three flat prefixes to tier 7 of 9");
  assert.ok(best.totals.div!.point * 5 < p.totals.div!.point, `≥ 5× cheaper: ${best.totals.div!.point} vs ${p.totals.div!.point}`);
  assert.ok(p.alternatives.some((a) => a.changes.length === 1 && a.changes[0]!.kind === "drop"), "dropping one prefix is offered");
  // with live catalyst prices the planner catalyses instead — and 16k catalysts are flagged too
  const cat2 = planWith(cat, OWNER_FLAT_RING, fixturePrices());
  const flagged = cat2.steps.filter((s) => s.impractical);
  assert.ok(flagged.length === 1 && flagged[0]!.impractical!.materialId.endsWith("-catalyst"), "the catalyst count is past the limit");
  assertAlternatives(cat, cat2, fixturePrices());
}

/**
 * Two prefixes from slams, no steer: the chain must keep a partial hit (one lands, the other is
 * slammed for) — by hand, E[S0] = (1 + pa/(1−ca) + pb/(1−cb)) / (pa + pb − pa·ca/(1−ca) − pb·cb/(1−cb)),
 * with ca = (1 − qb)/2 the chance a miss's Annulment takes the landed A, cb likewise.
 */
function testPartialHitsByHand(cat: CraftCatalog): void {
  const req: PlanRequest = { itemClass: "Rings", base: "Ruby Ring", ilvl: 82, targets: [target("PhysicalDamage", "prefix", "AddedPhysicalDamage9"), target("ColdDamage", "prefix", "AddedColdDamage9")], includeUnverified: false, quality: null };
  const { ctx } = buildCtx(req, { cat, prices: fixturePrices(), exaltPerDivine: null, league: "Test", now: NOW });
  // a fractured throwaway prefix leaves exactly two open prefixes and is immune to the Annulment
  const state: PlanState = { rarity: "Rare", affixes: [junk("prefix", "fractured"), junk("suffix"), junk("suffix"), junk("suffix")], quality: 0, catalyst: null };
  const scope = slamScope(state, ctx, "prefix");
  assert.ok(scope && scope.missing0 === 3 && scope.j0 === 0 && !scope.steerExalt, "both prefixes missing, suffixes full");
  const chain = buildChain(state, ctx, scope, { tier: EXALT_TIERS[0]!, catalysing: false }, 1);
  const edge = (from: string, to: string) => chain.nodes.find((n) => n.id === from)!.edges.find((e) => e.to === to)?.p ?? 0;
  const [pa, pb, qa, qb] = [edge("3:0", "2:0"), edge("3:0", "1:0"), edge("1:0", "0:0"), edge("2:0", "0:0")];
  assert.ok(pa > 0 && pb > 0 && qa > pa && qb > pb, "a landed prefix blocks its family: the second slam has better odds");
  const ca = (1 - qb) / 2;
  const cb = (1 - qa) / 2;
  const slams = (1 + pa / (1 - ca) + pb / (1 - cb)) / (pa + pb - (pa * ca) / (1 - ca) - (pb * cb) / (1 - cb));
  const exalt = mat("exalted").id;
  const annul = mat("annul").id;
  const solved = solveChain(chain.nodes, "3:0", [exalt, annul]);
  assert.ok(near(solved[exalt]!, slams, 1e-6), `chain = hand formula: ${solved[exalt]} vs ${slams}`);
  assert.ok(near(solved[annul]!, slams - 2, 1e-6), "an Annulment only after a miss: annuls = slams − 2 hits");
  assert.ok(solved[exalt]! < 1 / (pa * qb), "partial hits are kept: far below needing both on one go");
  assert.equal(chain.undoes, true, "the second prefix's misses can take the first");
  // one target, one open prefix next to a loose throwaway: a miss's Annulment can only take junk
  const one = buildCtx({ ...req, targets: [req.targets[0]!] }, { cat, prices: fixturePrices(), exaltPerDivine: null, league: "Test", now: NOW }).ctx;
  const lone: PlanState = { ...state, affixes: [...state.affixes, junk("prefix")] };
  const loneScope = slamScope(lone, one, "prefix");
  assert.ok(loneScope && loneScope.j0 === 1);
  assert.equal(buildChain(lone, one, loneScope, { tier: EXALT_TIERS[0]!, catalysing: false }, 1).undoes, false, "nothing landed to lose");
}

function testGoldensUnflagged(cat: CraftCatalog): void {
  for (const req of [BREACH_RING, FRACTURED_T1RES_RING, FRACTURE_PLUS3_AMULET]) {
    const p = planWith(cat, req, fixturePrices());
    for (const s of p.steps) {
      assert.equal(s.impractical, null, `${s.method} stays under ${IMPRACTICAL_CLICKS} clicks`);
    }
    assert.deepEqual(p.alternatives, [], "a realistic plan offers no alternatives");
  }
}

export function runSanityCases(cat: CraftCatalog): void {
  testOwnerCase(cat);
  testPartialHitsByHand(cat);
  testGoldensUnflagged(cat);
}
