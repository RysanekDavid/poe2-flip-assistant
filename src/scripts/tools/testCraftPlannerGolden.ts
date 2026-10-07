/* Craft planner golden plans: the planner, given ONLY a curated recipe's targets, must rebuild that
 * recipe's macro sequence, materials and retry structure. Owner rule (2026-10-02): the planner
 * never buys a base that already carries a target, so the two recipes that START from a bought
 * fractured target (ring_fractured_t1res, amulet_fracture_plus3) are rebuilt with the planner's own
 * fracture (blocker + 1-in-3) in front — the rest must match. Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import { RECIPES } from "../../core/craftRecipes";
import { flattenGuide, resolveRetry } from "../../core/craftRetry";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { planCraft } from "../../core/tools/planner/plan";
import { planResponseSchema, type PlanRequest, type PlanResponse } from "../../lib/tools/craftPlannerContract";
import { BREACH_RING, FRACTURE_PLUS3_AMULET, FRACTURED_T1RES_RING, fixturePrices } from "./plannerFixtures";

export const NOW = new Date("2026-10-02T00:00:00Z");

export function plan(cat: CraftCatalog, req: PlanRequest): PlanResponse {
  return planResponseSchema.parse(planCraft(req, { cat, prices: fixturePrices(), exaltPerDivine: 250, league: "Test", now: NOW }));
}

const methods = (p: PlanResponse): string[] => p.steps.map((s) => s.method);
const guideMats = (p: PlanResponse): Set<string> => new Set(p.guide.phases.flatMap((ph) => ph.steps.flatMap((s) => (s.mats ?? []).map((m) => m.id))));
const curatedMats = (key: string): string[] => {
  const r = RECIPES.find((x) => x.key === key);
  assert.ok(r, `curated recipe ${key} exists`);
  return r.materials.map((m) => m.material.id);
};

function assertInOrder(seq: readonly string[], want: readonly (string | RegExp)[], label: string): void {
  let at = 0;
  for (const w of want) {
    const i = seq.findIndex((m, k) => k >= at && (typeof w === "string" ? m === w : w.test(m)));
    assert.ok(i >= 0, `${label}: expected ${String(w)} after step ${at} in [${seq.join(", ")}]`);
    at = i + 1;
  }
}

/** Every retryFrom in the generated guide resolves backwards (the session wizard's own resolver). */
function assertRetries(p: PlanResponse): void {
  const flat = flattenGuide(p.guide);
  flat.forEach((_, i) => {
    const r = resolveRetry(p.guide, i);
    if (r) assert.ok(r.ok, `retry at step ${i} must resolve: ${r.ok ? "" : r.reason}`);
  });
}

function stepOf(p: PlanResponse, method: RegExp) {
  const s = p.steps.find((x) => method.test(x.method));
  assert.ok(s, `plan has a ${String(method)} step: ${methods(p).join(", ")}`);
  return s;
}

/**
 * ring_breach_mana_stacker. The curated recipe buys a junk-fractured anchor; since PR-A the planner
 * fractures a wanted resistance itself (magic loop, Regal, one more mod, 1-in-4 — no blocker: the
 * Amanamu prefix needs the item's one desecrated slot), which the model prices at about half the
 * anchored route. The rest of the curated macro order stays.
 */
function testBreachRing(cat: CraftCatalog): void {
  const p = plan(cat, BREACH_RING);
  const seq = methods(p);
  assertInOrder(seq, ["acquire-normal", /^magic-loop/, "fracture", "strip-junk", "chaos-loop", "essence-perfect:perfect-essence-of-the-mind:suffix", "desecrate-liege", /^slam-suffix-exalt-perfect-catalysing$/], "ring_breach_mana_stacker");
  const fracture = stepOf(p, /^fracture$/);
  assert.equal(fracture.odds.point, 1 / 4, "4 mods, no blocker → 1-in-4");
  assert.match(fracture.instructions[0]!.check ?? "", /Cold Resistance is FRACTURED/);
  const essence = stepOf(p, /^essence-perfect:perfect-essence-of-the-mind:suffix$/);
  assert.match(essence.odds.formula, /only removable suffix \(a throwaway\)/, "the Dextral Crystallisation takes the sacrificial suffix");
  assert.equal(seq.filter((m) => m.startsWith("chaos-loop")).length, 1, "the Chaos loop runs once, for the T1 mana");
  const mats = guideMats(p);
  for (const id of curatedMats("ring_breach_mana_stacker")) assert.ok(mats.has(id), `Breach plan uses curated material ${id}`);
  const chaos = stepOf(p, /^chaos-loop$/);
  assert.equal(chaos.odds.basis, "estimate");
  // 31 − Cold Res group (the fractured resistance) − 1 throwaway suffix that stays on the item = 29 families
  assert.ok(Math.abs(chaos.odds.point! - 1 / 29 / 12) < 1e-9, `chaos odds = 1/29 families × 1/12 tiers, got ${chaos.odds.point}`);
  assert.match(chaos.instructions[0]!.do, /^Chaos Orb until \+\(165-179\) to maximum Mana\.$/, "steps are targets, not click counts");
  const slam = stepOf(p, /^slam-suffix/);
  // the fractured Cold Resistance and a throwaway suffix sit beside the slam: 29 families, Fire Res +
  // All Res ×7.5 at 40%, then 2 of the 3 tiers at or above the Perfect floor 50 reach level 71
  assert.ok(Math.abs(slam.odds.point! - (7.5 / 29) * (2 / 3)) < 1e-9, `catalysed slam = 7.5/29 × 2/3, got ${slam.odds.point}`);
  assert.match(slam.instructions[0]!.do, /quality to 40%/, "catalyst step names the quality target (Breach Ring cap 40%)");
  const desecrate = stepOf(p, /^desecrate/);
  assert.equal(desecrate.odds.basis, "estimate");
  assert.deepEqual(desecrate.instructions.at(-1)!.retryTo, { phase: desecrate.phase, step: 1 }, "a dead reveal → Light strip → back to the bone");
  assert.deepEqual(slam.instructions.at(-1)!.retryTo, { phase: slam.phase, step: 1 }, "a missed slam → steered Annul → slam again");
  assert.deepEqual(fracture.instructions[0]!.retryTo, { phase: p.steps[0]!.phase, step: 1 }, "a missed fracture restarts on a new base");
  for (const s of p.steps.filter((x) => /^(acquire|plant|essence)/.test(x.method))) assert.equal(s.odds.basis, "exact", `${s.method} is count-based`);
  assert.equal(p.totals.basis, "estimate");
  assert.ok(p.totals.div && p.totals.div.low <= p.totals.div.point && p.totals.div.point <= p.totals.div.high);
  assertRetries(p);
}

function testFracturedResRing(cat: CraftCatalog): void {
  const p = plan(cat, FRACTURED_T1RES_RING);
  assertInOrder(methods(p), ["acquire-normal", /^magic-loop/, /^blocker-/, "fracture", "strip-junk", "chaos-loop", /^slam-suffix-.*-catalysing$/], "ring_fractured_t1res");
  const fracture = stepOf(p, /^fracture$/);
  assert.equal(fracture.odds.basis, "exact");
  assert.equal(fracture.odds.point, 1 / 3, "4 mods, 1 desecrated blocker → 1/3");
  assert.equal(fracture.restartP, 1 / 3);
  assert.deepEqual(fracture.instructions[0]!.retryTo, { phase: p.steps[0]!.phase, step: 1 }, "a missed fracture restarts on a new base");
  const mats = guideMats(p);
  for (const id of ["chaos", "exalted", "perfect-exalted-orb", "omen-of-catalysing-exaltation", "eshs-catalyst", "xophs-catalyst", "preserved-collarbone", "annul", "fracturing-orb"]) {
    assert.ok(mats.has(id), `fractured-res plan uses ${id}`);
  }
  const shared = curatedMats("ring_fractured_t1res").filter((id) => mats.has(id));
  assert.ok(shared.length >= 7, `most curated materials reappear (${shared.join(", ")})`);
  // the magic loop's quantities are paid once per fracture attempt: ×3 before the 1-in-3
  const loop = stepOf(p, /^magic-loop/);
  const transmute = loop.materials.find((m) => /transmutation/.test(m.id));
  assert.equal(transmute?.qty.point, 3, "pre-fracture work is bought 3 times on average");
  assertRetries(p);
}

function testFracturePlus3(cat: CraftCatalog): void {
  const p = plan(cat, FRACTURE_PLUS3_AMULET);
  assertInOrder(methods(p), ["acquire-normal", /^magic-loop/, "essence-greater:greater-essence-of-opulence", /^blocker-/, "fracture"], "amulet_fracture_plus3");
  assert.equal(methods(p).at(-1), "fracture", "the fracture is the last step: the +3 and the rarity are then both done");
  const fracture = stepOf(p, /^fracture$/);
  assert.equal(fracture.odds.point, 1 / 3, "+3, rarity, a throwaway and the blocker → 1-in-3 (KB §2)");
  const mats = guideMats(p);
  for (const id of ["greater-essence-of-opulence", "preserved-collarbone", "fracturing-orb"]) assert.ok(mats.has(id), `amulet plan uses ${id}`);
  const essence = stepOf(p, /^essence-greater/);
  assert.equal(essence.odds.basis, "exact");
  assertRetries(p);
}

export function runGoldenCases(cat: CraftCatalog): void {
  testBreachRing(cat);
  testFracturedResRing(cat);
  testFracturePlus3(cat);
}
