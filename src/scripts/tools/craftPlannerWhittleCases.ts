/* Craft planner whittle loop: the absorbing chain checked by hand on tiny synthetic mod pools (a tie
 * with a kept mod, no tie, a kept mod that is the unique lowest level), the guard that never plans a
 * Whittle that could take a mod the loop can't win back, and an older server's response (no
 * impractical / alternatives fields) still parsing on the client. Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import type { CatalogCombo, CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { mat } from "../../core/tools/planner/methodKit";
import { whittleLoop } from "../../core/tools/planner/methodsWhittle";
import { buildCtx, planCraft } from "../../core/tools/planner/plan";
import { canonical, junk, targetAffix } from "../../core/tools/planner/state";
import type { Move, PlanCtx, PlanState } from "../../core/tools/planner/types";
import { planResponseSchema, type PlanRequest } from "../../lib/tools/craftPlannerContract";
import { BREACH_RING, OWNER_FLAT_RING, fixturePrices, target } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const near = (a: number, b: number, tol = 1e-9): boolean => Math.abs(a - b) <= tol;
const rare = (affixes: PlanState["affixes"]): PlanState => canonical({ rarity: "Rare", affixes, quality: 0, catalyst: null });
const ctxOf = (cat: CraftCatalog, req: PlanRequest): PlanCtx => buildCtx(req, { cat, prices: fixturePrices(), exaltPerDivine: null, league: "Test", now: NOW }).ctx;
const usesOf = (m: Move, key: "omenWhittling" | "chaos"): number => m.uses.find((u) => u.mat.id === mat(key).id)?.qty.point ?? 0;

/**
 * A Ruby Ring cut down to a pool small enough to solve by hand: two prefixes allowed, no suffix mod
 * can roll, and three prefix families. A (kept) and B (wanted) are physical and cold flat damage.
 */
function tinyCtx(cat: CraftCatalog, physMin: string, prefix: CatalogCombo["prefix"]): PlanCtx {
  const req: PlanRequest = { itemClass: "Rings", base: "Ruby Ring", ilvl: 82, targets: [target("PhysicalDamage", "prefix", physMin), target("ColdDamage", "prefix", "AddedColdDamage9")], includeUnverified: false, quality: null };
  const ctx = ctxOf(cat, req);
  return { ...ctx, combo: { bases: ["Ruby Ring"], prefix, suffix: {}, desecrated: {} }, base: { ...ctx.base, allowance: { p: -1, s: 0 } } };
}

const KEPT_A = rare([targetAffix("prefix", 0, "explicit"), junk("prefix")]);

function onlyMove(state: PlanState, ctx: PlanCtx): Move {
  const moves = whittleLoop(state, ctx);
  assert.equal(moves.length, 1, `one whittle loop (for B), got ${moves.map((m) => m.title).join(" | ")}`);
  return moves[0]!;
}

/**
 * Pool after the throwaway goes: cold T9 (B, level 75; physical is blocked by A) or fire at level 1
 * or 75, each family ½, each tier ¼. A fire-75 throwaway TIES with A: the next Whittle takes either.
 *   low (throwaway < 75):  a = 1 + a/4 + b/4
 *   tie (throwaway = 75):  b = 1 + ½(a/4 + b/4) + ½·b    (A gone → the add is A or B, ½ each — the
 *                          lost A is won straight back, or B lands and A is missing with the same tie)
 * → a = 2.5, b = 3.5; the throwaway on the item is low or tie ½ each → 3 attempts (2 without the tie).
 */
function testTieByHand(cat: CraftCatalog): void {
  const tie = tinyCtx(cat, "AddedPhysicalDamage9", { PhysicalDamage: { AddedPhysicalDamage9: 75 }, ColdDamage: { AddedColdDamage9: 75 }, FireDamage: { AddedFireDamage1: 1, AddedFireDamage9: 75 } });
  const m = onlyMove(KEPT_A, tie);
  assert.ok(near(m.odds.point!, 1 / 2), `first add lands B ½, got ${m.odds.point}`);
  assert.ok(near(usesOf(m, "omenWhittling"), 3), `3 Whittles by hand, got ${usesOf(m, "omenWhittling")}`);
  assert.ok(near(usesOf(m, "chaos"), 3), "one Chaos per Whittle");
  assert.equal(m.undoRisk, true, "a tied throwaway can take A");
  assert.equal(m.grade, "ss", "the even split between tied mods is our assumption");
  assert.match(m.unverified ?? "", /equally likely/);
  assert.match(m.steps[0]!.why, /take a kept mod/);
  assert.ok(m.next.affixes.filter((a) => a.target != null).length === 2 && m.next.affixes.every((a) => a.target != null), "ends with A and B, no throwaway");
  // the new mod is always low-level junk: the next Whittle always takes it → plain geometric 1/p
  const low = tinyCtx(cat, "AddedPhysicalDamage9", { PhysicalDamage: { AddedPhysicalDamage9: 75 }, ColdDamage: { AddedColdDamage9: 75 }, FireDamage: { AddedFireDamage1: 1 } });
  const safe = onlyMove(KEPT_A, low);
  assert.ok(near(usesOf(safe, "omenWhittling"), 2), `no tie → 1/p = 2, got ${usesOf(safe, "omenWhittling")}`);
  assert.equal(safe.undoRisk, false);
  assert.equal(safe.unverified, null);
}

/**
 * A is the UNIQUE lowest-level mod (level 1; every throwaway is fire at 75): every Whittle with a
 * throwaway on the item takes A. The loop is only offered with that risk costed:
 *   X (B missing):           x = 1 + x/2 + y/2      (A goes; the add is A or B, ½ each)
 *   Y (A missing, B landed): y = 1 + ½(y/2) + ½(x/2 + y/2)   (tie B / throwaway at 75)
 * → x = 8 attempts, four times the riskless 1/p = 2.
 */
function testUniqueLowestModelled(cat: CraftCatalog): void {
  const ctx = tinyCtx(cat, "AddedPhysicalDamage1", { PhysicalDamage: { AddedPhysicalDamage1: 1 }, ColdDamage: { AddedColdDamage9: 75 }, FireDamage: { AddedFireDamage9: 75 } });
  const m = onlyMove(KEPT_A, ctx);
  assert.equal(m.undoRisk, true, "the kept mod is whittled first");
  assert.ok(near(usesOf(m, "omenWhittling"), 8), `8 Whittles by hand, got ${usesOf(m, "omenWhittling")}`);
  assert.ok(usesOf(m, "omenWhittling") > 1 / m.odds.point!, "never priced as if the kept mod were safe");
}

/** An essence-written prefix (level 72) under a throwaway that can roll level 75: the loop can't win it back → never planned. */
function testFixedModGuard(cat: CraftCatalog): void {
  const ctx = ctxOf(cat, BREACH_RING);
  assert.equal(ctx.targets[1]!.source, "essence");
  const state = rare([junk("suffix", "fractured"), targetAffix("prefix", 1, "crafted"), junk("prefix")]);
  assert.deepEqual(whittleLoop(state, ctx), [], "no Whittle may take the essence mod");
  // the same item with the essence mod fractured: nothing it can't win back is removable → offered
  const fractured = rare([junk("suffix", "fractured"), targetAffix("prefix", 1, "fractured"), targetAffix("prefix", 0, "explicit"), junk("suffix")]);
  assert.ok(whittleLoop(fractured, ctx).length > 0, "a fractured write is immune, the loop runs");
}

/** A client that loads the page before a deploy finishes may get a response without the new fields. */
function testOlderServerResponse(cat: CraftCatalog): void {
  const fresh = planCraft(OWNER_FLAT_RING, { cat, prices: fixturePrices(), exaltPerDivine: 250, league: "Test", now: NOW });
  const old = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown> & { steps: Array<Record<string, unknown>> };
  delete old.alternatives;
  for (const s of old.steps) delete s.impractical;
  const parsed = planResponseSchema.parse(old);
  assert.deepEqual(parsed.alternatives, [], "alternatives default to none");
  assert.ok(parsed.steps.every((s) => s.impractical === null), "impractical defaults to null");
}

export function runWhittleCases(cat: CraftCatalog): void {
  testTieByHand(cat);
  testUniqueLowestModelled(cat);
  testFixedModGuard(cat);
  testOlderServerResponse(cat);
}
