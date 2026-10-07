/* Craft planner alloys: the curated alloy table vs the catalog, the alloy as the item's one crafted
 * mod in a plan (Crystallisation-steered, graded creator-shown), the Breach-quality ordering, the
 * one-crafted refusal, the craft-moves "alloy" rule, and the KB §7 wording it rests on.
 * Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isRmtUrl } from "../../lib/claim";
import { ALL_MATERIALS } from "../../core/craftMaterials";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { ALL_RULES, KB } from "../../core/tools/craftmoves/rules";
import { ALLOY_OUTCOMES, CRYSTALLISATION_ALLOY_FACT } from "../../core/tools/planner/alloyOutcomes";
import { plannerPool } from "../../core/tools/planner/load";
import { buildCtx, planCraft, PlanRejectedError } from "../../core/tools/planner/plan";
import { canonical, junk, legality } from "../../core/tools/planner/state";
import { planResponseSchema, type PlanRequest, type PlanResponse } from "../../lib/tools/craftPlannerContract";
import { OWNER_POOL_RING, fixturePrices, target } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const deps = (cat: CraftCatalog) => ({ cat, prices: fixturePrices(), exaltPerDivine: 250, league: "Test", now: NOW });
const planOf = (cat: CraftCatalog, req: PlanRequest): PlanResponse => planResponseSchema.parse(planCraft(req, deps(cat)));
const methods = (p: PlanResponse): string => p.steps.map((s) => s.method).join(", ");

/** poe2db prints each alloy mod's side; the catalog (RePoE Alloy*) must agree. */
const POE2DB_SIDE: Record<string, "prefix" | "suffix"> = {
  AlloyAttackSpeedRing1: "suffix",
  AlloyFlaskChargesPerSecond1: "suffix",
  AlloyMaximumRunicWard1: "prefix",
  AlloyMaximumRunicWardPercent1: "prefix",
  AlloyRunicWardRechargeRate1: "prefix",
  AlloyRecoverRunicWardOnCharmUse1: "prefix",
  AlloyEffectOfResistanceMods1: "prefix",
};

const SWIFT_RING = target("IncreasedAttackSpeedNoCastSpeed", "suffix", "AlloyAttackSpeedRing1");

function testAlloyTable(cat: CraftCatalog): void {
  for (const r of ALLOY_OUTCOMES) {
    const mod = cat.mods[r.modId];
    assert.ok(mod, `${r.essenceId} → ${r.modId} exists in the catalog`);
    assert.equal(mod.craftedOnly, true, `${r.modId} is crafted-only`);
    assert.equal(mod.side, POE2DB_SIDE[r.modId], `${r.modId} side vs poe2db`);
    assert.equal(mod.text, r.poe2dbText, `${r.essenceId} ${r.itemClass}: catalog text = poe2db text`);
    assert.equal(r.tier, "alloy");
    assert.match(r.source, /^https:\/\/poe2db\.tw\/us\/[A-Za-z]+_Alloy$/);
    assert.equal(isRmtUrl(r.source), false);
    assert.ok(ALL_MATERIALS.some((m) => m.id === r.essenceId && m.group === "currency"), `${r.essenceId} is a priced currency material`);
  }
  const ids = Object.keys(cat.mods).filter((id) => /^Alloy/.test(id));
  assert.ok(ids.length >= 50 && ids.every((id) => cat.mods[id]!.craftedOnly), `every RePoE Alloy* mod is in the catalog, crafted-only (${ids.length})`);
  const pool = plannerPool("Rings", "Breach Ring", cat);
  const swift = pool.families.find((f) => f.tiers.some((t) => t.modId === "AlloyAttackSpeedRing1"));
  assert.ok(swift && swift.source === "essence" && swift.essences[0]!.id === "swift-alloy", "the ring pool lists the Swift Alloy mod as crafted-only");
}

/** The T7 attack-flat pool plus the Swift Alloy attack speed: the alloy replaces a planted suffix, steered. */
function testSwiftPlan(cat: CraftCatalog): void {
  const pool = OWNER_POOL_RING({ kind: "clean" }, null, 7);
  const req: PlanRequest = { ...pool, groups: [pool.groups![0]!], targets: [SWIFT_RING] };
  const p = planOf(cat, req);
  const seq = p.steps.map((s) => s.method);
  const at = seq.indexOf("alloy:swift-alloy:suffix");
  assert.ok(at > 0 && seq.slice(0, at).includes("plant-junk-suffix"), `the alloy replaces a planted suffix: ${methods(p)}`);
  const step = p.steps[at]!;
  assert.equal(step.grade, "ss", "steering an alloy is creator-shown, not item text");
  assert.ok(step.unverified?.includes(CRYSTALLISATION_ALLOY_FACT.text), "the step names the creator-only fact");
  assert.equal(CRYSTALLISATION_ALLOY_FACT.basis, "creator_stated");
  assert.match(step.instructions[0]!.do, /^Omen of Dextral Crystallisation \+ Swift Alloy → \(7-9\)% increased Attack Speed\.$/);
  assert.match(step.instructions[0]!.why, /already has a crafted mod/);
  assert.equal(step.odds.basis, "exact");
  assert.ok(step.materials.some((m) => m.id === "swift-alloy"), "the Swift Alloy is on the bill");
  assert.ok(step.rules.includes("omen-dextral-crystallisation"), "the steered write is checked by the omen rule");
  const shown = JSON.stringify({ i: step.instructions, u: step.unverified, p: step.phase });
  assert.doesNotMatch(shown, /\.md\b|§|\bsrc\/|\bdocs\/|theory-gaps|\bKB\b/, "no developer references in the alloy step");
  const bare = planOf(cat, { itemClass: "Rings", base: "Breach Ring", ilvl: 82, targets: [SWIFT_RING], includeUnverified: false, quality: null });
  const alone = bare.steps.find((s) => s.method === "alloy:swift-alloy");
  assert.ok(alone && alone.grade === "vp" && alone.rules.includes("alloy"), `unsteered: the alloy rule, verified: ${methods(bare)}`);
}

/** 60% quality: the Breach essence holds the crafted slot until it is stripped, so it goes first. */
function testBreachFirst(cat: CraftCatalog): void {
  const pool = OWNER_POOL_RING({ kind: "clean" }, { catalyst: "reaver-catalyst", pct: 60 }, 7);
  const p = planOf(cat, { ...pool, groups: [pool.groups![0]!], targets: [SWIFT_RING] });
  const breach = p.steps.findIndex((s) => s.method.startsWith("breach-quality"));
  const alloy = p.steps.findIndex((s) => s.method.startsWith("alloy:swift-alloy"));
  assert.ok(breach >= 0 && alloy > breach, `the Breach strip precedes the alloy: ${methods(p)}`);
  assert.equal(p.steps.at(-1)!.after.quality, 60);
}

function testOneCrafted(cat: CraftCatalog): void {
  const req: PlanRequest = { itemClass: "Rings", base: "Breach Ring", ilvl: 82, targets: [target("MaximumManaIncreasePercent", "prefix", "EssenceIncreasedManaPercent1"), SWIFT_RING], includeUnverified: false, quality: null };
  try {
    planCraft(req, deps(cat));
    assert.fail("an essence mod and an alloy mod both want the one crafted slot");
  } catch (e: unknown) {
    if (!(e instanceof PlanRejectedError)) throw e;
    const rules = e.issues.filter((i) => i.severity === "impossible").map((i) => i.rule);
    assert.deepEqual(rules, ["one-crafted"]);
    assert.match(e.issues.find((i) => i.rule === "one-crafted")!.message, /essence- or alloy-only/);
  }
}

/** The craft-moves rule: rare, a removable mod, and refused over an existing crafted mod (forum 3967316). */
function testAlloyRule(cat: CraftCatalog): void {
  const rule = ALL_RULES.find((r) => r.id === "alloy");
  assert.ok(rule && rule.verified && rule.family === "essence" && rule.source.includes(`${KB} §7`), "alloy rule verified against KB §7");
  const { ctx } = buildCtx({ itemClass: "Rings", base: "Breach Ring", ilvl: 82, targets: [SWIFT_RING], includeUnverified: false, quality: null }, deps(cat));
  const rare = canonical({ rarity: "Rare", affixes: [junk("prefix"), junk("suffix")], quality: 0, catalyst: null });
  assert.equal(legality(ctx, rare, ["alloy"]).ok, true, "a rare with removable mods takes an alloy");
  const crafted = canonical({ ...rare, affixes: [...rare.affixes, junk("prefix", "crafted")] });
  assert.match(legality(ctx, crafted, ["alloy"]).blocked ?? "", /already has a crafted mod/, "an existing crafted mod refuses it");
  const magic = canonical({ rarity: "Magic", affixes: [junk("prefix")], quality: 0, catalyst: null });
  assert.equal(legality(ctx, magic, ["alloy"]).ok, false, "rare only");
}

/** Verbatim KB §7 fragments (whitespace-normalised) the alloy rule and the planner's ordering rely on. */
export const KB7_ALLOY_FACTS: ReadonlyArray<{ rule: string; text: string }> = [
  { rule: "alloy target", text: "every alloy reads \"Removes a random modifier and augments a Rare item with a new guaranteed modifier\"" },
  { rule: "alloy crafted slot", text: "its mod is crafted-only and is the item's ONE crafted mod" },
  { rule: "alloy refused", text: "**an alloy on an item that already has a crafted mod is refused: \"This item already has a crafted mod\"**" },
  { rule: "perfect essence refused too", text: "a crafted mod\"** — and so is a Perfect essence" },
  { rule: "breach first", text: "a Breach-quality route runs **Essence of the Breach first**" },
];

function testKb7(): void {
  const kb = readFileSync(join(process.cwd(), "docs", "research", "poe2-crafting-knowledge.md"), "utf8");
  const start = kb.indexOf("## 7.");
  const section7 = kb.slice(start, kb.indexOf("## 8.", start)).replace(/\s+/g, " ");
  for (const f of KB7_ALLOY_FACTS) assert.ok(section7.includes(f.text), `KB §7 no longer states (${f.rule}): ${f.text}`);
}

export function runAlloyCases(cat: CraftCatalog): void {
  testKb7();
  testAlloyTable(cat);
  testAlloyRule(cat);
  testOneCrafted(cat);
  testSwiftPlan(cat);
  testBreachFirst(cat);
}
