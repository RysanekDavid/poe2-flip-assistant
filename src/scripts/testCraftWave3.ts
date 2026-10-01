/* The 2026-10-01 creator-video wave: owner rules and fact-check corrections that must not regress.
 * Durability on every recipe (and the Crystallisation-on-alloys bug risk on the alloy crafts),
 * craft-to-use recipes never scanned, creator numbers only as timestamped claims, the corrected
 * alloy mapping, and badges on the creator-only mechanics. Pure data checks, no network or DB. */
import { MATS } from "../core/craftMaterials";
import { RECIPES, SCANNED_RECIPES, recipePurpose, type CraftRecipe, type GuideStep } from "../core/craftRecipes";
import { provenanceFor } from "../core/craftProvenanceData";

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const WAVE3 = [
  "spear_bleed_abrasion_necro",
  "wand_cold_skills_sorcery_desecrate",
  "wand_ilvl80_perfect_orb_lottery",
  "wand_plus4_alloy_fracture",
  "ring_gold_rarity_opulence",
  "shield_armour_fracture",
  "jewel_liquid_fear_4mod_budget",
  "ring_dusk_four_flat",
  "boots_es_ms_spirit_fracture",
] as const;
const CRAFT_TO_USE = ["spear_bleed_abrasion_necro", "wand_cold_skills_sorcery_desecrate", "ring_gold_rarity_opulence"];
const ALLOY_CRAFTS = ["wand_plus4_alloy_fracture", "ring_dusk_four_flat"];

const recipe = (key: string): CraftRecipe => {
  const r = RECIPES.find((x) => x.key === key);
  if (!r) throw new Error(`recipe ${key} missing`);
  return r;
};
const steps = (r: CraftRecipe): GuideStep[] => r.guide.phases.flatMap((p) => p.steps);
const uses = (s: GuideStep, id: string): boolean => (s.mats ?? []).some((m) => m.id === id);

function testPurpose(): void {
  const missing = WAVE3.filter((k) => !RECIPES.some((r) => r.key === k));
  ok("all nine wave-3 recipes are registered", missing.length === 0, missing.join(","));
  const use = RECIPES.filter((r) => recipePurpose(r) === "use").map((r) => r.key).sort();
  ok("exactly the three craft-to-use recipes are purpose 'use'", use.join(",") === [...CRAFT_TO_USE].sort().join(","), use.join(","));
  ok("the scanner never prices a craft-to-use recipe", SCANNED_RECIPES.every((r) => recipePurpose(r) === "sell") && SCANNED_RECIPES.length === RECIPES.length - 3);
}

function testDurability(): void {
  const noDurability = WAVE3.filter((k) => !provenanceFor(k).durability);
  ok("every wave-3 recipe has why_it_works + breaks_when", noDurability.length === 0, noDurability.join(","));
  const noBugRisk = ALLOY_CRAFTS.filter((k) => !provenanceFor(k).durability?.breaks_when.some((b) => /GGG treats Crystallisation-on-alloys as a bug/.test(b)));
  ok("the alloy crafts name the Crystallisation-on-alloys bug risk", noBugRisk.length === 0, noBugRisk.join(","));
  const overGraded = ALLOY_CRAFTS.filter((k) => provenanceFor(k).durability?.claim.v !== "uv");
  ok("alloy crafts rest on a demonstrated, undocumented interaction → graded unverified", overGraded.length === 0, overGraded.join(","));
  const verified = WAVE3.filter((k) => ["vp", "vs"].includes(provenanceFor(k).durability?.claim.v ?? ""));
  ok("no wave-3 mechanic is graded verified/2+ sources (creator-sourced wave)", verified.length === 0, verified.join(","));
}

function testCreatorNumbers(): void {
  const noClaims = WAVE3.filter((k) => (provenanceFor(k).creatorClaims ?? []).length === 0);
  ok("every wave-3 recipe carries timestamped creator claims", noClaims.length === 0, noClaims.join(","));
  // a creator's price is context, never the headline: no Div/exalt amounts in goal or market check
  const AMOUNT = /\d[\d,.]*\s*(div|divines?|ex|exalts?)\b/i;
  const headline = WAVE3.filter((k) => AMOUNT.test(recipe(k).guide.goal) || AMOUNT.test(recipe(k).guide.marketCheck) || AMOUNT.test(recipe(k).guide.shopping));
  ok("no creator price in a wave-3 goal, shopping list or market check", headline.length === 0, headline.join(","));
  const unlinked = WAVE3.flatMap((k) => provenanceFor(k).sources).filter((s) => s.kind === "video" && (s.url !== null || !s.ref || !/title not fetched/.test(s.title)));
  ok("wave-3 videos are cited by their committed transcript until oEmbed is fetched", unlinked.length === 0, unlinked.map((s) => s.title).join(" | "));
}

function testAlloysAndBadges(): void {
  const plus4 = steps(recipe("wand_plus4_alloy_fracture"));
  const transcendent = plus4.find((s) => uses(s, MATS.transcendentAlloy.id));
  const celestial = plus4.find((s) => uses(s, MATS.celestialAlloy.id));
  ok("Transcendent Alloy = the cast speed SUFFIX (fact-check)", /Cast Speed/.test(transcendent?.why ?? "") && /SUFFIX/.test(transcendent?.why ?? ""));
  ok("Celestial Alloy = the +1 spell levels / mana PREFIX (fact-check)", /maximum Mana/.test(celestial?.why ?? "") && /PREFIX/.test(celestial?.why ?? ""));
  ok("Crystallisation is activated only after the essence (forum 3851940)", /3851940/.test(transcendent?.warning ?? ""));
  const alloySteps = ALLOY_CRAFTS.flatMap((k) =>
    steps(recipe(k)).filter((s) => [MATS.transcendentAlloy, MATS.celestialAlloy, MATS.swiftAlloy].some((m) => uses(s, m.id))),
  );
  ok("every Crystallisation + alloy step is badged (forum 3949532)", alloySteps.length === 3 && alloySteps.every((s) => /3949532/.test(s.unverified ?? "")), String(alloySteps.length));
  const fractures = WAVE3.flatMap((k) => steps(recipe(k)).filter((s) => uses(s, MATS.fracturing.id)));
  ok("wave-3 fractures flag the unrevealed blocker", fractures.length === 4 && fractures.every((s) => /UNREVEALED/.test(s.unverified ?? "")), String(fractures.length));
  const jewel = recipe("jewel_liquid_fear_4mod_budget");
  ok("the Liquid Fear recipe is Emerald-only", jewel.base.type === "Emerald" && jewel.result.type === "Emerald");
  const rib = steps(recipe("boots_es_ms_spirit_fracture")).find((s) => uses(s, MATS.ancientRib.id));
  ok("a second desecration waits for the first one to be gone", /can't be desecrated again/.test(rib?.warning ?? ""));
  const shieldRib = steps(recipe("shield_armour_fracture")).find((s) => uses(s, MATS.preservedRib.id));
  ok("the shield's 'omen of sanctification' misspeak is called out, no omen on the blocker", /misspeak/.test(shieldRib?.warning ?? "") && !uses(shieldRib!, MATS.omenSanctification.id));
}

testPurpose();
testDurability();
testCreatorNumbers();
testAlloysAndBadges();
console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
