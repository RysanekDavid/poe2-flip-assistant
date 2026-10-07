/* Craft planner cost sanity: the owner's refused prod plan (three top-tier flat attack prefixes on a
 * Breach Ring) self-fractures a flat instead of slamming or whittling; a long step is flagged with cheaper target sets costed by the same model;
 * golden plans stay unflagged (the slam chain's partial hits by hand: craftPlannerRepairCases.ts). Imported by
 * testCraftPlanner.ts. */
import assert from "node:assert/strict";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { MAX_ALTERNATIVES } from "../../core/tools/planner/alternatives";
import { EXALT_TIERS, mat } from "../../core/tools/planner/methodKit";
import { buildCtx, planCraft, PlanTimeoutError, type PlanBudget } from "../../core/tools/planner/plan";
import { IMPRACTICAL_CLICKS } from "../../core/tools/planner/sanity";
import { buildChain, slamScope } from "../../core/tools/planner/slamChain";
import { canonical, junk, targetAffix } from "../../core/tools/planner/state";
import type { PlanState } from "../../core/tools/planner/types";
import { planResponseSchema, type PlanRequest, type PlanResponse } from "../../lib/tools/craftPlannerContract";
import { BREACH_RING, FLAT_FAMILIES, FOUR_FLAT_DUSK, FRACTURE_PLUS3_AMULET, FRACTURED_T1RES_RING, OWNER_FLAT_RING, fixturePrices, pricesWithoutCatalysts, target } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const planWith = (cat: CraftCatalog, req: PlanRequest, prices: Map<string, number>): PlanResponse =>
  planResponseSchema.parse(planCraft(req, { cat, prices, exaltPerDivine: 250, league: "Test", now: NOW }));

const near = (a: number, b: number, tol: number): boolean => Math.abs(a - b) <= tol;

/** Every alternative is cheaper, and planning its targets reproduces its totals exactly (same model, no shortcut). */
function assertAlternatives(cat: CraftCatalog, p: PlanResponse, prices: Map<string, number>, req: PlanRequest, firstRealistic: boolean): void {
  assert.ok(p.alternatives.length >= 1 && p.alternatives.length <= MAX_ALTERNATIVES, `1..${MAX_ALTERNATIVES} alternatives, got ${p.alternatives.length}`);
  assert.equal(p.alternatives[0]!.impractical, !firstRealistic, firstRealistic ? "the first alternative is realistic" : "no cheaper target set is realistic");
  for (const alt of p.alternatives) {
    assert.ok(alt.totals.div && p.totals.div && alt.totals.div.point < p.totals.div.point, "an alternative is cheaper");
    const again = planWith(cat, { ...req, targets: alt.targets }, prices);
    assert.deepEqual(again.totals.div, alt.totals.div, "the chip's cost is what planning its targets gives");
    assert.equal(again.steps.some((s) => s.impractical), alt.impractical);
    for (const c of alt.changes) {
      assert.equal(req.targets[c.target]!.minModId, c.from.modId, "a change starts from the request's own tier");
      if (c.kind === "relax") assert.ok(c.to.k < c.from.k && c.to.level < c.from.level, "a relax lowers the minimum tier");
    }
  }
}

/**
 * The owner's ring before the whittle loop (PR #123 prod bill): 13,201 Greater Exalted Orbs +
 * Sinistral Exaltations + Annulments in one prefix slam chain, 5,834.53 div at these test prices.
 */
const OWNER_BEFORE_DIV = 5834.53;

/** PR #124: the second and third flat whittled, the third ~2,013 Chaos (flagged), 3,321.38 div. */
const OWNER_WHITTLE_DIV = 3321.38;

/**
 * P1 desecrated the third flat (~22 Lights) but still whittled the second (1,128.54 div). Since PR-A
 * the planner fractures a landed flat itself (magic loop, Regal, blocker, 1-in-3 — Alohaa's route,
 * KB §2), Chaos-loops the next one and desecrates the last: ~295 div, nothing whittled, no step past
 * the limit. The same flats as a pool ("any 3 of the 4 attack flats") are cheaper again; a bought
 * base carrying one of them fractured now only saves the self-fracture's work (its 65 div ask is
 * more than that). Four top flats on a Dusk Ring (no magic route on an allowance base) used to start
 * from a bought anchored base and whittle twice past Whittling's own limit of 50 (~103, ~645). G1:
 * Alchemy + Annulments give the Normal base a one-throwaway rare, so a flat is Chaos-rolled and
 * self-fractured (SaVeQ's route). One whittle step stays past the limit (~98 Whittles, the third T9
 * flat on a ring with two flats already landed) — the documented bound; cheaper target sets are now realistic.
 */
function testOwnerCase(cat: CraftCatalog): void {
  const prices = pricesWithoutCatalysts();
  const p = planWith(cat, OWNER_FLAT_RING, prices);
  const route = p.steps.map((s) => s.method);
  assert.ok(!route.includes("slam-prefix-exalt-greater"), `the 13,201-slam chain is gone: ${route.join(", ")}`);
  assert.ok(route.includes("fracture") && !route.includes("whittle-loop"), `a landed flat is self-fractured, nothing whittled: ${route.join(", ")}`);
  const desecrate = p.steps.find((s) => s.method.startsWith("desecrate-"));
  assert.ok(desecrate && desecrate.instructions[0]!.pick.some((x) => /Physical|Lightning|Cold/.test(x)), `a flat prefix is desecrated: ${route.join(", ")}`);
  assert.ok(near(p.totals.div!.point, 295.4, 0.05), `≈295 div (P1 whittled to 1,128.54), got ${p.totals.div!.point}`);
  assert.ok(p.totals.div!.point * 2.9 < OWNER_WHITTLE_DIV && p.totals.div!.point * 5 < OWNER_BEFORE_DIV, "well under the whittle-only and the slam plans");
  // P1's two whittle loops (~103 and ~72 Whittles, past Whittling's own limit of 50 — KB §4) are gone
  assert.deepEqual(p.steps.filter((s) => s.impractical).map((s) => s.method), [], "no step is past the limit any more");
  const lights = desecrate.materials.find((m) => m.id === mat("omenLight").id)!.qty.point;
  assert.ok(lights > 15 && lights < 30, `one top-tier flat family: ~22 Omens of Light, got ${lights}`);
  const pool = planWith(cat, { ...OWNER_FLAT_RING, targets: OWNER_FLAT_RING.targets.slice(3), groups: [{ side: "prefix", need: 3, candidates: FLAT_FAMILIES.map(([family, id]) => ({ family, minModId: `${id}9` })) }] }, prices);
  assert.ok(pool.totals.div!.point < p.totals.div!.point * 0.6, `any 3 of the 4 flats: ${pool.totals.div!.point} div`);
  const bought = planWith(cat, { ...OWNER_FLAT_RING, start: { kind: "bought", carried: null, askDiv: 65 } }, prices);
  assert.ok(bought.totals.div!.point < p.totals.div!.point, `the bought fractured flat skips the self-fracture: ${bought.totals.div!.point} div of work after it`);
  testDuskFourFlat(cat, prices);
}

/** G1 on the four top flats: Alchemy start, a self-fractured flat, one whittle step left past the limit (see above). */
function testDuskFourFlat(cat: CraftCatalog, prices: Map<string, number>): void {
  const dusk = planWith(cat, FOUR_FLAT_DUSK, prices);
  const route = dusk.steps.map((s) => s.method);
  assert.deepEqual(route.slice(0, 2), ["acquire-normal", "alchemy-strip"], `a Normal base, then Alchemy: ${route.join(", ")}`);
  assert.ok(route.includes("fracture") && !route.some((m) => m.startsWith("acquire-anchored")), `a flat is self-fractured, no anchored base: ${route.join(", ")}`);
  const flagged = dusk.steps.filter((s) => s.impractical);
  const whittles = flagged[0]?.impractical?.clicks.point ?? 0;
  assert.ok(flagged.length === 1 && flagged[0]!.method === "whittle-loop" && flagged[0]!.impractical!.materialId === mat("omenWhittling").id, `one whittle step past the limit: ${flagged.map((s) => s.method).join(", ")}`);
  assert.ok(whittles > 50 && whittles < 110, `the documented bound: ~98 Whittles (was ~103 and ~645), got ${whittles}`);
  assert.ok(dusk.totals.div!.point < 800, `four top flats: ${dusk.totals.div!.point} div`);
  // pinned; no slam chain on this route, so G5b's unsteered repair left it as it was
  assert.ok(near(dusk.totals.div!.point, 724.1008, 5e-4), `four top flats pinned: ${dusk.totals.div!.point} div`);
  // a cheaper target set no longer whittles past 50: the first chip is realistic
  assertAlternatives(cat, dusk, prices, FOUR_FLAT_DUSK, true);
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

/**
 * Time budgets (the planner runs on the web server's only thread). A fake clock that ticks 1 ms per
 * read keeps this deterministic: past the cheaper-target budget the plan still comes back, flagged
 * as possibly incomplete; past the main budget the request fails loudly with a typed error.
 */
function testTimeBudgets(cat: CraftCatalog): void {
  const ticking = (): PlanBudget["now"] => {
    let t = 0;
    return () => t++;
  };
  const deps = (budget: PlanBudget) => ({ cat, prices: pricesWithoutCatalysts(), exaltPerDivine: 250, league: "Test", now: NOW, budget });
  const quick = planResponseSchema.parse(planCraft(FOUR_FLAT_DUSK, deps({ searchMs: Infinity, alternativesMs: 0, now: ticking() })));
  assert.equal(quick.alternativesTruncated, true, "out of time for cheaper targets → said so");
  assert.deepEqual(quick.alternatives, [], "nothing was planned in a zero budget");
  assert.ok(quick.steps.some((s) => s.impractical), "the plan itself is still returned");
  assert.throws(() => planCraft(FOUR_FLAT_DUSK, deps({ searchMs: 25, alternativesMs: Infinity, now: ticking() })), (e: unknown) => e instanceof PlanTimeoutError && !/\bms\b|states/.test(e.message), "past the main budget: a typed error in plain words");
  const unlimited = planWith(cat, FOUR_FLAT_DUSK, pricesWithoutCatalysts());
  assert.equal(unlimited.alternativesTruncated, false, "no budget → every candidate planned");
}

/**
 * Market reality (owner, 2026-10-04): rings with three near-top "to Attacks" flats and all-res sell
 * routinely. Every flat carries the "attack" tag, so one Reaver Catalyst biases all three at once;
 * planning each flat under its own element catalyst made the prod-like ring ~1,941 div.
 */
function testMarketReality(cat: CraftCatalog): void {
  const allRes = target("AllResistances", "suffix", "AllResistances5");
  const ring = (tier: number): PlanRequest => ({
    itemClass: "Rings",
    base: "Breach Ring",
    ilvl: 82,
    includeUnverified: false,
    quality: null,
    targets: [target("ColdDamage", "prefix", `AddedColdDamage${tier}`), target("LightningDamage", "prefix", `AddedLightningDamage${tier}`), target("PhysicalDamage", "prefix", `AddedPhysicalDamage${tier}`), allRes],
  });
  const t8 = planWith(cat, ring(8), fixturePrices());
  const t8Route = t8.steps.map((s) => s.method);
  // PR-A: one flat is self-fractured, so at most one is left to slam and no step plans the Reaver
  // aim any more — the aim itself is checked on the two-flats-missing slam below
  assert.ok(t8Route.includes("fracture") && !t8Route.includes("whittle-loop"), `a flat is self-fractured, nothing whittled: ${t8Route.join(", ")}`);
  assert.ok(t8.totals.div!.point < 400, `three T8 flats + all-res costs low hundreds, got ${t8.totals.div!.point}`);
  assertReaverAim(cat, ring(8));
  // P1: the third T9 flat comes from a desecration reveal (the creators' last prefix), not a 1-in-250 slam
  const t9 = planWith(cat, ring(9), fixturePrices());
  const route = t9.steps.map((s) => s.method).join(", ");
  assert.ok(/desecrate-/.test(route) && t9.totals.div!.point < 1000, `three T9 flats: the last one desecrated, under 1,000 div (1,600 with the slam), got ${t9.totals.div!.point}: ${route}`);
  // PR-A: the second flat is self-fractured instead of whittled (P1's ~103 Whittles), so nothing is past a limit
  assert.deepEqual(t9.steps.filter((s) => s.impractical).map((s) => s.method), [], "no step past the limit, so no cheaper-target chips");
}

/** All three attack flats missing on one prefix slam (the pre-PR-A route): one Reaver Catalyst biases them all, so it is the aim. */
function assertReaverAim(cat: CraftCatalog, req: PlanRequest): void {
  const { ctx } = buildCtx(req, { cat, prices: fixturePrices(), exaltPerDivine: null, league: "Test", now: NOW });
  const state: PlanState = canonical({ rarity: "Rare", affixes: [junk("suffix", "fractured"), targetAffix("suffix", 3, "explicit"), junk("suffix")], quality: 0, catalyst: null });
  const scope = slamScope(state, ctx, "prefix");
  assert.ok(scope && scope.missing0 === 7, "three flats missing on the prefix slam");
  const chain = buildChain(state, ctx, scope, { tier: EXALT_TIERS[2]!, catalysing: true }, 1);
  assert.equal(chain.first.catalyst?.mat.id, "reaver-catalyst", "the prefix slams aim with the Reaver Catalyst");
}

export function runSanityCases(cat: CraftCatalog): void {
  testMarketReality(cat);
  testTimeBudgets(cat);
  testOwnerCase(cat);
  testGoldensUnflagged(cat);
}
