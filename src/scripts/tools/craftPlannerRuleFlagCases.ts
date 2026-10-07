/* Craft planner rule flags verified against item text (2026-10-07): the Greater/Perfect Regal and
 * Chaos floors (poe2db) with the soft-floor valve, and Omen of Light (its item text) with the reveal
 * loop's Echoes and Light counts checked by hand. KB §1 / §4 pins. Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { ALL_RULES } from "../../core/tools/craftmoves/rules";
import { mat } from "../../core/tools/planner/methodKit";
import { DESECRATE_METHODS } from "../../core/tools/planner/methodsDesecrate";
import { eligibleTierLevels, tierShare } from "../../core/tools/planner/odds";
import { buildCtx } from "../../core/tools/planner/plan";
import { revealOdds } from "../../core/tools/planner/reveal";
import { canonical, junk } from "../../core/tools/planner/state";
import type { Move, PlanCtx, PlanState } from "../../core/tools/planner/types";
import type { PlanRequest } from "../../lib/tools/craftPlannerContract";
import { BREACH_RING, fixturePrices, target } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const ctxOf = (cat: CraftCatalog, req: PlanRequest): PlanCtx => buildCtx(req, { cat, prices: fixturePrices(), exaltPerDivine: null, league: "Test", now: NOW }).ctx;
const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-12;
const rare = (affixes: PlanState["affixes"]): PlanState => canonical({ rarity: "Rare", affixes, quality: 0, catalyst: null });

const FLOOR_RING: PlanRequest = {
  itemClass: "Rings",
  base: "Ruby Ring",
  ilvl: 82,
  targets: [target("FireDamage", "prefix", "AddedFireDamage9"), target("ItemFoundRarityIncrease", "suffix", "ItemFoundRarityIncrease3")],
  includeUnverified: false,
  quality: null,
};

/** Ring flat fire: levels 1…75 in nine tiers; Greater (35) leaves five, Perfect (50) four; families wholly below a floor keep their top tier. */
function testFloors(cat: CraftCatalog): void {
  const ctx = ctxOf(cat, FLOOR_RING);
  assert.deepEqual(eligibleTierLevels(ctx, "prefix", "FireDamage", null), [1, 8, 16, 33, 46, 54, 60, 65, 75], "no floor: all nine tiers");
  assert.deepEqual(eligibleTierLevels(ctx, "prefix", "FireDamage", 35), [46, 54, 60, 65, 75], "Greater: level 35+");
  assert.deepEqual(eligibleTierLevels(ctx, "prefix", "FireDamage", 50), [54, 60, 65, 75], "Perfect: level 50+");
  assert.deepEqual(eligibleTierLevels(ctx, "suffix", "LightRadiusAndManaRegeneration", 50), [30], "soft floor: the top tier (level 30) stays");
  assert.deepEqual(eligibleTierLevels(ctx, "suffix", "ItemFoundRarityIncrease", 50), [40], "soft floor: the top tier (level 40) stays");
  const t9 = ctx.targets[0]!;
  assert.equal(t9.level, 75);
  assert.ok(near(tierShare(ctx, t9, 50).share, 1 / 4), "T9 under a Perfect floor: 1 of 4 tiers");
  for (const id of ["chaos-greater", "chaos-perfect"]) {
    const r = ALL_RULES.find((x) => x.id === id);
    assert.ok(r?.verified, `${id} is verified`);
    assert.ok(!r.notes?.some((n) => /UNVERIFIED/.test(n)), `${id} carries no unverified-floor note`);
  }
  // the Regal floors are verified too; the rule stays unverified for its magic → rare precondition (not in the verified KB)
  for (const id of ["regal-greater", "regal-perfect"]) {
    const r = ALL_RULES.find((x) => x.id === id);
    assert.ok(r && !r.notes?.some((n) => /UNVERIFIED/.test(n)), `${id} carries no unverified-floor note`);
  }
}

function desecrateMove(cat: CraftCatalog): { ctx: PlanCtx; state: PlanState; move: Move } {
  const ctx = ctxOf(cat, BREACH_RING);
  const state = rare([junk("prefix"), junk("suffix"), junk("suffix")]);
  const method = DESECRATE_METHODS.find((m) => m.id === "desecrate")!;
  const move = method.moves(state, ctx).find((m) => m.methodId === "desecrate-liege");
  assert.ok(move, "the Amanamu target is desecrated with the Liege (always with Echoes)");
  return { ctx, state, move };
}

const qtyOf = (m: Move, key: "omenLight" | "omenAbyssalEchoes"): number => m.uses.find((u) => u.mat.id === mat(key).id)!.qty.point;

/**
 * Echoes is a second draw: P = 1 − (1 − p)², and on the ordinary-mod model the band ends get the
 * same transform. Echoes is spent only when the first three options miss: attempts·(1 − p); Light on
 * every failed attempt: attempts − 1.
 */
function testReveal(cat: CraftCatalog): void {
  const ctx = ctxOf(cat, BREACH_RING);
  const state = rare([junk("prefix"), junk("suffix"), junk("suffix")]);
  const odds = revealOdds(ctx, state, ctx.targets[3]!, { liege: false, bone: "preserved" })!;
  const twice = (p: number) => 1 - (1 - p) ** 2;
  assert.ok(near(odds.withEchoes.point!, twice(odds.first)), "point: 1 − (1 − first)²");
  assert.ok(near(odds.withEchoes.low!, twice(odds.once.low!)) && near(odds.withEchoes.high!, twice(odds.once.high!)), "band ends: the same transform");
  const { move } = desecrateMove(cat);
  const liege = revealOdds(ctx, state, ctx.targets[2]!, { liege: true, bone: "preserved" })!;
  const attempts = 1 / move.odds.point!;
  assert.ok(near(move.odds.point!, twice(liege.first)), "the move's odds are the Echoes odds");
  assert.ok(near(qtyOf(move, "omenLight"), attempts - 1), "one Omen of Light per failed attempt");
  assert.ok(near(qtyOf(move, "omenAbyssalEchoes"), attempts * (1 - liege.first)), "Echoes only when the first options miss");
}

/** Omen of Light is verified by its item text: neither the reveal loop nor the slot clear calls it unconfirmed. */
function testLightVerified(cat: CraftCatalog): void {
  const light = ALL_RULES.find((r) => r.id === "omen-light");
  assert.ok(light?.verified && light.source.endsWith("§4"), `omen-light verified against KB §4: ${light?.source}`);
  const { ctx, state, move } = desecrateMove(cat);
  assert.doesNotMatch(move.unverified ?? "", /Light/, "the reveal loop's unverified text no longer names Omen of Light");
  const echoes = move.steps.find((s) => s.mats.some((m) => m.id === mat("omenAbyssalEchoes").id))!;
  assert.match(echoes.why, /Arm it before the first reveal; arming it after a reveal can eat it unused \(forum 3861139\)/);
  const spent = rare([...state.affixes.filter((a) => a.side !== "prefix"), junk("prefix", "desecrated")]);
  const strip = DESECRATE_METHODS.find((m) => m.id === "strip-desecrated")!.moves(spent, ctx)[0];
  assert.ok(strip && strip.unverified === null && strip.grade === "vp", `a revealed throwaway is cleared on verified rules: ${strip?.unverified}`);
}

/** Verbatim KB fragments (whitespace-normalised) behind the verified floors and Omen of Light. */
export const KB_RULE_FLAG_FACTS: ReadonlyArray<{ section: "1" | "4"; rule: string; text: string }> = [
  { section: "1", rule: "greater regal floor", text: '| Greater Regal Orb | **35** | CONFIRMED (poe2db, 2026-10-07): item text "Minimum Modifier Level: 35" |' },
  { section: "1", rule: "greater chaos floor", text: '| Greater Chaos Orb | **35** | CONFIRMED (poe2db, 2026-10-07): item text "Minimum Modifier Level: 35" |' },
  { section: "1", rule: "perfect chaos floor", text: '| Perfect Chaos Orb | **50** | CONFIRMED (poe2db, 2026-10-07): item text "Minimum Modifier Level: 50" |' },
  { section: "1", rule: "soft floor", text: "a floor never excludes a modifier FAMILY entirely. If every tier of a family sits below the floor, the family's highest tier (respecting ilvl) stays eligible" },
  { section: "4", rule: "omen-light", text: '**Omen of Light**: "your next Orb of Annulment will remove only Desecrated modifiers" [verified-primary — item text]' },
  { section: "4", rule: "omen-light required", text: "a second desecration is refused while one desecrated mod exists (§5)" },
  { section: "4", rule: "omen-abyssal-echoes", text: '"you can reroll the options once"' },
];

function testKbPins(): void {
  const kb = readFileSync(join(process.cwd(), "docs", "research", "poe2-crafting-knowledge.md"), "utf8").replace(/\r/g, "");
  const section = (n: string): string => {
    const start = kb.indexOf(`\n## ${n}. `);
    assert.ok(start >= 0, `KB lost its §${n} heading`);
    return kb.slice(start, kb.indexOf("\n## ", start + 1)).replace(/\s+/g, " ");
  };
  for (const f of KB_RULE_FLAG_FACTS) assert.ok(section(f.section).includes(f.text), `KB §${f.section} no longer states (${f.rule}): ${f.text}`);
  assert.doesNotMatch(section("1"), /no surviving claim/, "no floor row is left unverified");
}

export function runRuleFlagCases(cat: CraftCatalog): void {
  testKbPins();
  testFloors(cat);
  testReveal(cat);
  testLightVerified(cat);
}
