/* Craft planner faction omens (G3, 2026-10-07): the Liege / Sovereign / Blackblooded steer a Lich
 * desecrated target by t.faction. Item text (poe2db, all three): "your next Weapon or Jewellery
 * Desecration attempt will guarantee a random <Lich> modifier". The golden belt (TheSaneExile,
 * Zop328DR50Q 0:51–1:12, reveal 2:35–2:59) arms the Sovereign on a belt. KB §5 pin. Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { ALL_RULES } from "../../core/tools/craftmoves/rules";
import { mat } from "../../core/tools/planner/methodKit";
import { DESECRATE_METHODS } from "../../core/tools/planner/methodsDesecrate";
import { buildCtx } from "../../core/tools/planner/plan";
import { revealOdds } from "../../core/tools/planner/reveal";
import { canonical, legality, presentModGroups, withLanded } from "../../core/tools/planner/state";
import { slotIssues } from "../../core/tools/planner/targets";
import type { Move, PlanCtx, PlanState } from "../../core/tools/planner/types";
import type { PlanRequest } from "../../lib/tools/craftPlannerContract";
import { fixturePrices, target } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const ctxOf = (cat: CraftCatalog, req: PlanRequest): PlanCtx => buildCtx(req, { cat, prices: fixturePrices(), exaltPerDivine: null, league: "Test", now: NOW }).ctx;
const near = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-12;
const EMPTY_RARE: PlanState = canonical({ rarity: "Rare", affixes: [], quality: 0, catalyst: null });

/** The golden belt's request (docs/research/craft-mining/golden/belt-life-res-ulaman-thesaneexile.json). */
export const ULAMAN_BELT: PlanRequest = {
  itemClass: "Belts",
  base: "Heavy Belt",
  ilvl: 75,
  targets: [
    target("IncreasedLife", "prefix", "IncreasedLife10"),
    target("LightningResistance", "suffix", "LightningResist5"),
    target("ChaosResistance", "suffix", "ChaosResist2"),
    target("LightningAndChaosDamageResistance", "suffix", "AbyssModArmourJewelleryUlamanSuffixLightningChaosResistance"),
  ],
  includeUnverified: false,
  quality: null,
};

const KURGAL_RING: PlanRequest = {
  itemClass: "Rings",
  base: "Ruby Ring",
  ilvl: 82,
  targets: [target("FireResistance", "suffix", "FireResist7"), target("ColdAndChaosDamageResistance", "suffix", "AbyssModArmourJewelleryKurgalSuffixColdChaosResistance")],
  includeUnverified: false,
  quality: null,
};

/** Desecrated families on `side` whose mods carry the Lich's tag and no group the item holds: counted straight from the catalog. */
function lichFamilies(ctx: PlanCtx, state: PlanState, side: "prefix" | "suffix", faction: string): string[] {
  const blocked = presentModGroups(ctx, state);
  return Object.entries(ctx.combo.desecrated)
    .filter(([, tiers]) => Object.keys(tiers).some((id) => ctx.cat.mods[id]?.tags.includes(`${faction}_mod`)))
    .filter(([, tiers]) => {
      const mod = ctx.cat.mods[Object.keys(tiers)[0]!]!;
      return mod.side === side && !mod.groups.some((g) => blocked.has(g));
    })
    .map(([family]) => family)
    .sort();
}

function desecrateMoves(ctx: PlanCtx, state: PlanState): Move[] {
  return DESECRATE_METHODS.find((m) => m.id === "desecrate")!.moves(state, ctx);
}

const usesMat = (m: Move, key: Parameters<typeof mat>[0]): boolean => m.uses.some((u) => u.mat.id === mat(key).id && u.qty.point > 0);

/** The belt after the creator's first two steps: bought life + lightning res, Greater Essence of Ruin for chaos res. */
function beltAfterEssence(ctx: PlanCtx): PlanState {
  return withLanded(ctx, withLanded(ctx, withLanded(ctx, EMPTY_RARE, 0, "explicit"), 1, "explicit"), 2, "crafted");
}

function testSovereignBelt(cat: CraftCatalog): void {
  const ctx = ctxOf(cat, ULAMAN_BELT);
  const state = beltAfterEssence(ctx);
  const t = ctx.targets[3]!;
  assert.equal(t.faction, "ulaman");
  const families = lichFamilies(ctx, state, "suffix", "ulaman");
  assert.deepEqual(families, ["LightningAndChaosDamageResistance", "ReducedPoisonDuration", "SlowEffectIfCharmedRecently", "StrengthAndDexterity"], "RePoE: four Ulaman belt suffixes, none blocked by life / lightning / chaos res");
  const odds = revealOdds(ctx, state, t, { factionOmen: true, bone: "preserved" })!;
  const expected = Math.min(1, ctx.reveal.options / families.length);
  assert.ok(near(odds.first, expected) && near(expected, 3 / 4), `first = min(1, 3/${families.length}) = ${odds.first}`);
  const moves = desecrateMoves(ctx, state);
  const move = moves.find((m) => m.methodId === "desecrate-sovereign");
  assert.ok(move, `the Ulaman target is desecrated with the Sovereign: ${moves.map((m) => m.methodId).join(", ")}`);
  assert.ok(near(move.odds.point!, 1 - (1 - expected) ** 2), "with the Echoes reroll: 1 − (1 − ¾)²");
  assert.ok(usesMat(move, "omenTheSovereign") && !usesMat(move, "omenTheLiege"), "spends the Sovereign, not the Liege");
  assert.ok(move.ruleIds.includes("omen-sovereign"), "the Sovereign click is legality-checked");
  assert.equal(move.grade, "ss", "belts are creator-shown, not in the item text");
  assert.match(move.unverified ?? "", /Omen of the Sovereign on belts: seen in one creator video only \(TheSaneExile, Zop328DR50Q 0:51–1:12 and 2:35–2:59\)/);
  assert.ok(!slotIssues(ctx.base, ctx.targets).some((i) => i.rule === "reveal-pool"), "a steered Ulaman target no longer warns about the whole pool");
}

function testBlackbloodedRing(cat: CraftCatalog): void {
  const ctx = ctxOf(cat, KURGAL_RING);
  const state = withLanded(ctx, EMPTY_RARE, 0, "explicit");
  const t = ctx.targets[1]!;
  assert.equal(t.faction, "kurgal");
  const move = desecrateMoves(ctx, state).find((m) => m.methodId === "desecrate-blackblooded");
  assert.ok(move, "the Kurgal target is offered the Blackblooded");
  assert.ok(usesMat(move, "omenTheBlackblooded"), "spends the Blackblooded");
  assert.equal(move.unverified, null, "rings are jewellery: the item text covers them");
  const families = lichFamilies(ctx, state, "suffix", "kurgal");
  const odds = revealOdds(ctx, state, t, { factionOmen: true, bone: "preserved" })!;
  assert.ok(near(odds.first, Math.min(1, 3 / families.length)), `first = min(1, 3/${families.length})`);
  const l = legality(ctx, state, ["bone-preserved", "omen-dextral-necromancy", "omen-blackblooded"]);
  assert.ok(l.ok && l.unverified.length === 0, `legal and verified on a rare ring: ${l.blocked}`);
}

/** The three rules share the item text: verified on jewellery, belts only with an unverified reason, never on jewels. */
function testRules(cat: CraftCatalog): void {
  for (const id of ["omen-liege", "omen-sovereign", "omen-blackblooded"]) assert.ok(ALL_RULES.find((r) => r.id === id)?.verified, `${id} verified by its item text`);
  const ctx = ctxOf(cat, ULAMAN_BELT);
  const state = beltAfterEssence(ctx);
  for (const id of ["omen-liege", "omen-sovereign", "omen-blackblooded"]) {
    const l = legality(ctx, state, [id]);
    assert.ok(l.ok && l.unverified.length === 1, `${id} on a belt: legal, unverified (${l.unverified.join(" ")})`);
  }
}

/** Verbatim KB §5 fragment (whitespace-normalised) behind the three omens, the belt evidence and the jewel reveal model (reveal.ts). */
export const KB5_FACTION_FACTS: ReadonlyArray<{ rule: string; text: string }> = [
  { rule: "faction omen map", text: "Liege → Amanamu, Sovereign → Ulaman, Blackblooded → Kurgal" },
  { rule: "faction omen text", text: "\"your next Weapon or Jewellery Desecration attempt will guarantee a random Kurgal modifier\"" },
  { rule: "sovereign on a belt", text: "Dextral Necromancy + Sovereign + a collarbone on a life + lightning resistance belt for the Ulaman lightning and chaos resistance suffix (TheSaneExile [Zop328DR50Q](https://www.youtube.com/watch?v=Zop328DR50Q) 0:51–1:12, reveal 2:35–2:59)" },
  { rule: "jewel reveals: no faction mods", text: "jewels have no faction mods — a Cranium's desecrated-only options are the jewel exclusives" },
  { rule: "jewel reveals: Time-Lost exclusives", text: "Time-Lost jewels have their own 12 radius exclusives" },
  { rule: "jewel reveals: open draws", text: "Whether a jewel reveal always includes one jewel-exclusive option is unconfirmed" },
];

function testKb5(): void {
  const kb = readFileSync(join(process.cwd(), "docs", "research", "poe2-crafting-knowledge.md"), "utf8").replace(/\r/g, "");
  const start = kb.indexOf("\n## 5. ");
  assert.ok(start >= 0, "KB lost its §5 heading");
  const section5 = kb.slice(start, kb.indexOf("\n## ", start + 1)).replace(/\s+/g, " ");
  for (const f of KB5_FACTION_FACTS) assert.ok(section5.includes(f.text), `KB §5 no longer states (${f.rule}): ${f.text}`);
}

export function runFactionCases(cat: CraftCatalog): void {
  testKb5();
  testSovereignBelt(cat);
  testBlackbloodedRing(cat);
  testRules(cat);
}
