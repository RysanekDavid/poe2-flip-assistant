/* Craft planner state cases: the projection into the rules engine (legal and blocked moves on the
 * golden intermediate states), method gating on hand-built states, the Breach quality path, the
 * Time-Lost desecration gate and the DB-backed load path. Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { evaluateRules } from "../../core/tools/craftmoves/rules";
import { planForLeague, plannerCatalog, plannerPool } from "../../core/tools/planner/load";
import { movesFrom } from "../../core/tools/planner/methods";
import { buildCtx } from "../../core/tools/planner/plan";
import { canonical, junk, projectToItemState, targetAffix } from "../../core/tools/planner/state";
import type { PlanCtx, PlanState } from "../../core/tools/planner/types";
import { planResponseSchema, plannerCatalogSchema, plannerPoolSchema, type PlanRequest } from "../../lib/tools/craftPlannerContract";
import { BREACH_RING, FRACTURE_PLUS3_AMULET, FRACTURED_T1RES_RING, fixturePrices, target } from "./plannerFixtures";
import { freshToolsDb } from "./toolsTestKit";
import { NOW, plan } from "./testCraftPlannerGolden";

const ctxOf = (cat: CraftCatalog, req: PlanRequest): PlanCtx => buildCtx(req, { cat, prices: fixturePrices(), exaltPerDivine: null, league: "Test", now: NOW }).ctx;
const rare = (affixes: PlanState["affixes"]): PlanState => canonical({ rarity: "Rare", affixes, quality: 0, catalyst: null });
const legalIds = (ctx: PlanCtx, s: PlanState): string[] => evaluateRules(projectToItemState(ctx, s)).moves.map((m) => m.id);
const blockedIds = (ctx: PlanCtx, s: PlanState): string[] => evaluateRules(projectToItemState(ctx, s)).blocked.map((m) => m.id);

/** After the Chaos loop: fractured suffix + T1 mana. The steered essence must wait for a throwaway suffix. */
function testBreachProjection(cat: CraftCatalog): void {
  const ctx = ctxOf(cat, BREACH_RING);
  const afterChaos = rare([junk("suffix", "fractured"), targetAffix("prefix", 0, "explicit")]);
  assert.ok(legalIds(ctx, afterChaos).includes("omen-dextral-exaltation"), "a suffix slot is open");
  assert.ok(blockedIds(ctx, afterChaos).includes("omen-dextral-crystallisation"), "the only suffix is fractured: Dextral Crystallisation is blocked");
  const ids = movesFrom(afterChaos, ctx).map((m) => m.move.methodId);
  assert.ok(ids.includes("plant-junk-suffix"), "the throwaway suffix is offered");
  assert.ok(!ids.some((id) => id.startsWith("essence-perfect")), "no essence move would risk the T1 mana");
  const withThrowaway = rare([...afterChaos.affixes, junk("suffix")]);
  assert.ok(movesFrom(withThrowaway, ctx).some((m) => m.move.methodId === "essence-perfect:perfect-essence-of-the-mind:suffix"), "then the Dextral Crystallisation eats it");
  const proj = projectToItemState(ctx, withThrowaway);
  assert.deepEqual([proj.prefixes, proj.suffixes, proj.openPrefixes, proj.openSuffixes, proj.maxQuality], [1, 2, 2, 1, 40], "projection counts + Breach Ring cap");
}

function testGating(cat: CraftCatalog): void {
  const ctx = ctxOf(cat, BREACH_RING);
  const rareState = rare([junk("suffix", "fractured"), junk("any")]);
  const augs = movesFrom(rareState, ctx).filter((m) => m.move.ruleIds.some((r) => r.startsWith("aug") || r.startsWith("transmute")));
  assert.deepEqual(augs, [], "Augmentation/Transmutation never on a rare");
  const amulet = ctxOf(cat, FRACTURE_PLUS3_AMULET);
  const three = rare([targetAffix("suffix", 0, "explicit"), targetAffix("suffix", 1, "crafted"), junk("prefix")]);
  assert.ok(!movesFrom(three, amulet).some((m) => m.move.methodId === "fracture"), "no fracture below 4 mods");
  const magicWithRarity: PlanState = canonical({ rarity: "Magic", affixes: [targetAffix("suffix", 1, "explicit")], quality: 0, catalyst: null });
  assert.ok(!movesFrom(magicWithRarity, amulet).some((m) => m.move.methodId.startsWith("essence-greater")), "a Greater essence is never planned onto its own family");
  for (const plan of [BREACH_RING, FRACTURE_PLUS3_AMULET]) {
    const c = ctxOf(cat, plan);
    const all = movesFrom(canonical({ rarity: "Normal", affixes: [], quality: 0, catalyst: null }), c);
    assert.ok(all.every((m) => m.move.steps.every((s) => !/\b\d+\s*(×|x)\b|\btimes\b/i.test(s.do))), "instructions never carry click counts");
  }
}

/** Owner rule (T12): Breach Ring 20 + 20 implicit + 20 Essence of the Breach = 60%, strip the essence mod, keep the quality. */
function testBreachQuality(cat: CraftCatalog): void {
  const req: PlanRequest = { itemClass: "Rings", base: "Breach Ring", ilvl: 82, targets: [target("IncreasedMana", "prefix", "IncreasedMana12")], includeUnverified: false, quality: { catalyst: "neural-catalyst", pct: 60 } };
  const p = plan(cat, req);
  const q = p.steps.find((s) => s.method.startsWith("breach-quality"));
  assert.ok(q, `the 60% path is planned: ${p.steps.map((s) => s.method).join(", ")}`);
  assert.ok(q.instructions.some((i) => /quality to 60%/.test(i.do)), "written as a target: quality to 60%");
  assert.equal(q.grade, "ss", "creator-demonstrated, badged");
  assert.ok(q.unverified, "with the badge text");
  const at40 = plan(cat, { ...req, quality: { catalyst: "neural-catalyst", pct: 40 } });
  assert.ok(at40.steps.some((s) => s.method === "catalyse-finish") && !at40.steps.some((s) => s.method.startsWith("breach-quality")), "40% on a Breach Ring is plain catalysts");
}

/** Review regressions: Catalysing consumes the quality; a slam chain never rebuilds special junk. */
function testSlamTransitions(cat: CraftCatalog): void {
  const req: PlanRequest = { itemClass: "Rings", base: "Breach Ring", ilvl: 82, targets: [target("FireResistance", "suffix", "FireResist7"), target("ColdResistance", "suffix", "ColdResist7")], includeUnverified: false, quality: { catalyst: "neural-catalyst", pct: 60 } };
  const ctx = ctxOf(cat, req);
  const full: PlanState = canonical({ rarity: "Rare", affixes: [junk("prefix", "fractured"), junk("prefix"), junk("prefix"), junk("suffix")], quality: 60, catalyst: "neural-catalyst" });
  const slams = movesFrom(full, ctx).filter((m) => m.move.methodId.endsWith("-catalysing"));
  assert.ok(slams.length > 0, "a catalysed slam is offered");
  for (const m of slams) assert.deepEqual([m.move.next.quality, m.move.next.catalyst], [0, null], "Catalysing Exaltation consumes all quality");
  const p = plan(cat, req);
  const methods = p.steps.map((s) => s.method);
  const lastOf = (pred: (m: string) => boolean): number => methods.reduce((at, m, i) => (pred(m) ? i : at), -1);
  const last = lastOf((m) => m.endsWith("-catalysing"));
  const quality = lastOf((m) => m.startsWith("breach-quality") || m === "catalyse-finish");
  assert.ok(quality > last, `the quality goal is reached after the last catalysed slam: ${methods.join(", ")}`);
  const t1 = ctxOf(cat, FRACTURED_T1RES_RING);
  const blocked = canonical({ rarity: "Rare", affixes: [targetAffix("prefix", 0, "fractured"), junk("prefix"), junk("prefix"), { ...junk("suffix", "desecrated"), unrevealed: true }], quality: 0, catalyst: null });
  assert.ok(!movesFrom(blocked, t1).some((m) => m.move.methodId.startsWith("slam-suffix")), "no slam chain over a side holding the desecrated blocker");
}

function testTimeLostDesecration(cat: CraftCatalog): void {
  const combo = Object.values(cat.classes.Jewels!).find((c) => c.bases.includes("Time-Lost Sapphire"))!;
  const [family, tiers] = Object.entries(combo.desecrated).find(([, t]) => cat.mods[Object.keys(t)[0]!]!.side === "suffix")!;
  const req: PlanRequest = { itemClass: "Jewels", base: "Time-Lost Sapphire", ilvl: 82, targets: [target(family, "suffix", Object.keys(tiers)[0]!)], includeUnverified: false, quality: null };
  assert.throws(() => plan(cat, req), /include unverified methods/, "Time-Lost desecration is unverified → refused by default");
  const withFlag = plan(cat, { ...req, includeUnverified: true });
  const d = withFlag.steps.find((s) => s.method.startsWith("desecrate"));
  assert.equal(d?.grade, "uv", "admitted with the unverified grade");
}

function testLoadPaths(cat: CraftCatalog): void {
  freshToolsDb();
  const p = planResponseSchema.parse(planForLeague(BREACH_RING, "Test League", NOW));
  assert.equal(p.totals.div, null, "no snapshots → totals null, never 0");
  assert.ok(p.unpriced.length > 0 && p.bill.every((m) => m.unitDiv == null));
  const catalog = plannerCatalogSchema.parse(plannerCatalog(cat));
  const rings = catalog.classes.find((c) => c.itemClass === "Rings")!;
  assert.deepEqual(rings.bases.find((b) => b.name === "Dusk Ring")?.caps, { p: 4, s: 2 });
  assert.equal(rings.bases.find((b) => b.name === "Refined Breach Ring")?.qualityCap, 45);
  const pool = plannerPoolSchema.parse(plannerPool("Rings", "Breach Ring", cat));
  assert.ok(pool.families.some((f) => f.source === "essence" && f.tiers[0]!.modId === "EssenceIncreasedManaPercent1"));
  assert.ok(pool.families.some((f) => f.source === "desecrated" && f.faction === "amanamu"));
  assert.ok(pool.families.find((f) => f.family === "FireResistance")!.essences.some((e) => e.id === "greater-essence-of-insulation"));
}

export function runPlannerStateCases(cat: CraftCatalog): void {
  testBreachProjection(cat);
  testGating(cat);
  testBreachQuality(cat);
  testSlamTransitions(cat);
  testTimeLostDesecration(cat);
  testLoadPaths(cat);
}
