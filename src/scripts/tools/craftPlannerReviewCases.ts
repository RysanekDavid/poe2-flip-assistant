/* Craft planner review fixes (PR #128): a dropped target shifts the bought base's carried refs, the
 * reveal formula states its faction routes, one slam's odds over singles + pools never exceed 1, the
 * planner's own bought pick never takes the only fracture another target needs, and the base price
 * never steers the search. Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { applyChanges } from "../../core/tools/planner/alternatives";
import { CATALYSTS } from "../../core/tools/planner/catalystTags";
import { EXALT_TIERS } from "../../core/tools/planner/methodKit";
import { startMoves } from "../../core/tools/planner/methodsStart";
import { addOdds } from "../../core/tools/planner/odds";
import { buildCtx, planCraft } from "../../core/tools/planner/plan";
import { revealOdds } from "../../core/tools/planner/reveal";
import { buildChain, slamScope } from "../../core/tools/planner/slamChain";
import { canonical, junk } from "../../core/tools/planner/state";
import type { PlanCtx, PlanState } from "../../core/tools/planner/types";
import type { PlanRequest, TargetChangeView } from "../../lib/tools/craftPlannerContract";
import { BREACH_RING, FRACTURE_PLUS3_AMULET, FRACTURED_T1RES_RING, OWNER_POOL_RING, fixturePrices, target } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const deps = (cat: CraftCatalog) => ({ cat, prices: fixturePrices(), exaltPerDivine: 250, league: "Test", now: NOW });
const ctxOf = (cat: CraftCatalog, req: PlanRequest): PlanCtx => buildCtx(req, deps(cat)).ctx;

const FROM = { modId: "x", text: "x", level: 1, k: 1, n: 1 };
const drop = (i: number): TargetChangeView => ({ kind: "drop", target: i, side: "prefix", family: "f", from: FROM });
const relax = (i: number, modId: string): TargetChangeView => ({ kind: "relax", target: i, side: "prefix", family: "f", from: FROM, to: { ...FROM, modId } });

/** Finding 1: a drop moves every carried ref past it down (pool slots too); dropping the carried mod itself is no candidate. */
function testDropRemapsCarried(): void {
  const req: PlanRequest = {
    ...OWNER_POOL_RING({ kind: "bought", carried: [{ ref: 2, fractured: false }, { ref: 4, fractured: false }], askDiv: null }),
    targets: [target("IncreasedMana", "prefix", "IncreasedMana12"), target("FireResistance", "suffix", "FireResist7"), target("ColdResistance", "suffix", "ColdResist7")],
  };
  const dropped = applyChanges(req, [drop(0)]);
  assert.ok(dropped, "dropping a mod the base doesn't carry is a candidate");
  assert.deepEqual(dropped.targets.map((t) => t.family), ["FireResistance", "ColdResistance"]);
  assert.deepEqual(dropped.start, { kind: "bought", carried: [{ ref: 1, fractured: false }, { ref: 3, fractured: false }], askDiv: null }, "the single and the pool slot both move down one");
  assert.deepEqual(dropped.groups, req.groups, "pools name families, not indices: unchanged");
  assert.equal(applyChanges(req, [drop(2)]), null, "dropping the carried mod leaves no such base");
  assert.deepEqual(applyChanges(req, [relax(0, "IncreasedMana11")])!.start, req.start, "a relax moves nothing");
  assert.equal(applyChanges({ ...req, start: undefined }, [drop(0)])!.start, undefined, "a clean request stays clean");
  const auto = applyChanges({ ...req, start: { kind: "bought", carried: null, askDiv: null } }, [drop(2)]);
  assert.deepEqual(auto?.start, { kind: "bought", carried: null, askDiv: null }, "the planner's own pick has no refs to move");
}

/**
 * Finding 3 (checked, model kept): at item level 65+ AT LEAST one reveal option is a faction mod
 * (poe2wiki; docs/kb/desecration-abyss.md), so the open draws still include faction families and a
 * wanted faction mod has two routes. The formula shows both and claims no blanket "equally likely".
 */
function testRevealFactionRoutes(cat: CraftCatalog): void {
  const ctx = ctxOf(cat, BREACH_RING);
  const t = ctx.targets[2]!;
  assert.equal(t.source, "desecrated");
  const state: PlanState = canonical({ rarity: "Rare", affixes: [junk("prefix"), junk("suffix"), junk("suffix")], quality: 0, catalyst: null });
  const odds = revealOdds(ctx, state, t, { factionOmen: false, bone: "preserved" })!;
  const p = Number(odds.once.inputs["wanted share of them"]);
  const pf = Number(/pf = ([0-9.]+)/.exec(odds.once.formula)?.[1]);
  assert.ok(p > 0 && pf > p, `the faction option favours its own families: p ${p}, pf ${pf}`);
  assert.ok(Math.abs(odds.first - (1 - (1 - p) ** 2 * (1 - pf))) < 1e-4, "two open draws plus the faction option");
  assert.match(odds.once.formula, /at least one option is a faction mod/);
  assert.doesNotMatch(odds.once.formula, /every family and every reachable tier equally/, "no claim that every family is equally likely");
  const ordinary = revealOdds(ctx, state, ctx.targets[3]!, { factionOmen: false, bone: "preserved" })!;
  assert.doesNotMatch(ordinary.once.formula, /pf = /, "an ordinary mod has no faction route");
}

/** Finding 4: one add aiming several singles and pool slots spends at most the whole roll; every slam node's edges sum to 1. */
function testSlamMassAtMostOne(cat: CraftCatalog): void {
  const req: PlanRequest = {
    ...OWNER_POOL_RING({ kind: "clean" }),
    groups: [{ side: "prefix", need: 2, candidates: OWNER_POOL_RING({ kind: "clean" }).groups![0]!.candidates }],
    targets: [target("IncreasedMana", "prefix", "IncreasedMana12"), target("FireResistance", "suffix", "FireResist7"), target("ColdResistance", "suffix", "ColdResist7")],
  };
  const ctx = ctxOf(cat, req);
  const all = ctx.targets.map((t) => t.idx);
  const empty: PlanState = { rarity: "Rare", affixes: [], quality: 0, catalyst: null };
  for (const catalyst of [null, ...CATALYSTS]) {
    for (const junkAfter of [0, 2, 4]) {
      const odds = addOdds(ctx, empty, { sides: ["prefix", "suffix"], floor: null, catalyst, quality: 40, junkAfter }, all);
      const sum = [...odds.p.values()].reduce((a, b) => a + b, 0);
      assert.ok(sum <= 1 + 1e-9, `one add, ${catalyst?.mat.id ?? "no catalyst"}, ${junkAfter} junk: slot odds sum to ${sum}`);
    }
  }
  const state: PlanState = { rarity: "Rare", affixes: [junk("suffix"), junk("suffix"), junk("suffix")], quality: 0, catalyst: null };
  const scope = slamScope(state, ctx, "prefix");
  assert.ok(scope && scope.chain.length === 3, "mana + two pool slots, all missing");
  for (const tier of EXALT_TIERS) {
    for (const catalysing of [false, true]) {
      for (const scale of [0.5, 1, 2]) {
        const chain = buildChain(state, ctx, scope, { tier, catalysing }, scale);
        for (const n of chain.nodes.filter((x) => !x.terminal)) {
          const total = n.edges.reduce((a, e) => a + e.p, 0);
          assert.ok(Math.abs(total - 1) < 1e-9 && n.edges.every((e) => e.p >= 0), `${tier.key}${catalysing ? " catalysing" : ""} ×${scale}: node ${n.id} sums to ${total}`);
        }
      }
    }
  }
}

/** Finding 5: with another target to be fractured, the planner never buys a different one fractured. */
function testAutoPickKeepsFracture(cat: CraftCatalog): void {
  for (const req of [FRACTURED_T1RES_RING, FRACTURE_PLUS3_AMULET]) {
    const ctx = ctxOf(cat, { ...req, start: { kind: "bought", carried: null, askDiv: null } });
    const want = ctx.targets.filter((t) => t.fractured).map((t) => t.idx);
    const refs = startMoves(ctx).flatMap((m) => m.bought?.carried.map((c) => c.ref) ?? []);
    assert.ok(refs.length > 0, `${req.base}: a bought start is offered`);
    assert.deepEqual([...new Set(refs)], want, `${req.base}: only the mod that must be fractured is bought fractured`);
  }
}

/** Finding 7: the base price only adds to the total — the same plan with or without it. */
function testAskNeverSteers(cat: CraftCatalog): void {
  const at = (askDiv: number | null) => planCraft(OWNER_POOL_RING({ kind: "bought", carried: null, askDiv }), deps(cat));
  const [none, dear] = [at(null), at(5000)];
  assert.deepEqual(dear.steps.map((s) => s.method), none.steps.map((s) => s.method));
  assert.deepEqual(dear.totals, none.totals);
}

export function runReviewCases(cat: CraftCatalog): void {
  testDropRemapsCarried();
  testRevealFactionRoutes(cat);
  testSlamMassAtMostOne(cat);
  testAutoPickKeepsFracture(cat);
  testAskNeverSteers(cat);
}
