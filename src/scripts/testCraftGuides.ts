/* Guide-content invariants: every curated recipe's playbook must agree with the verified KB
 * (docs/research/poe2-crafting-knowledge.md) and the RePoE catalog text on the mechanics that cost
 * real currency when stated wrong — fracture mod count, reveal sides, Omen of Light, catalyst weight,
 * Perfect-vs-regular exalts, and visible flags on unconfirmed steps. Pure data checks, no network. */
import "../config/env";
import { MATS } from "../core/craftMaterials";
import { RECIPES, type CraftRecipe, type GuideStep } from "../core/craftRecipes";
import { checkStep, recipeLegality } from "../core/craftProvenance/legality";
import { entityByExchangeId, loadEntityCatalog } from "../core/entities/load";
import { comboFor, loadCraftCatalog } from "../core/tools/craftmoves/catalog";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const stepText = (s: GuideStep): string => [s.do, s.why, s.check, s.warning, s.onFail].filter(Boolean).join(" ");
const allSteps = (r: CraftRecipe): GuideStep[] => r.guide.phases.flatMap((p) => p.steps);
const uses = (s: GuideStep, id: string): boolean => (s.mats ?? []).some((m) => m.id === id);
const recipe = (key: string): CraftRecipe => {
  const r = RECIPES.find((x) => x.key === key);
  if (!r) throw new Error(`recipe ${key} missing`);
  return r;
};

// --- KB §2: fracture needs a rare with ≥4 mods; the "~3 mods" folklore must be gone ---
{
  const fractureSteps = RECIPES.flatMap((r) => allSteps(r).filter((s) => uses(s, MATS.fracturing.id)).map((s) => ({ r, s })));
  ok("fracture steps exist", fractureSteps.length >= 2, String(fractureSteps.length));
  const missing = fractureSteps.filter(({ s }) => !/(≥|at least|exactly)\s*4/i.test(stepText(s)));
  ok("every fracture step states the ≥4-mod requirement", missing.length === 0, missing.map(({ r }) => r.key).join(","));
  const threeMods = /~\s*3\s*(total\s*)?mods|3 total mods/i;
  const bad = RECIPES.filter(
    (r) => allSteps(r).some((s) => threeMods.test(stepText(s))) || r.materials.some((m) => threeMods.test(m.note ?? "")),
  );
  ok("no step or material note claims ~3-mod fracture odds", bad.length === 0, bad.map((r) => r.key).join(","));
}

// --- KB §5: a Dextral-forced (suffix) reveal can't offer prefixes — pick lists must match ---
{
  const PREFIX_MARKER = /\bprefix\b|Adds # to #|\bflat\b|Physical Damage|maximum Life|Spirit/i;
  const offenders: string[] = [];
  for (const r of RECIPES) {
    for (const phase of r.guide.phases) {
      if (!phase.steps.some((s) => uses(s, MATS.omenDextralNecromancy.id))) continue;
      for (const s of phase.steps) for (const p of s.pick ?? []) if (PREFIX_MARKER.test(p)) offenders.push(`${r.key}: ${p}`);
    }
  }
  ok("no prefix picks in a suffix-only (Dextral) reveal", offenders.length === 0, offenders.join(" | "));
  const bowPicks = allSteps(recipe("bow_amanamu")).flatMap((s) => s.pick ?? []);
  ok("bow Amanamu reveal ranks Attack Speed over Pierce", /Attack Speed/.test(bowPicks[0] ?? "") && /Pierce/.test(bowPicks[1] ?? ""), bowPicks.join(","));
}

// --- RePoE: Omen of Light only makes the next Annulment strip Desecrated mods — never a reroll ---
{
  const sentences = (t: string): string[] => t.split(/[.;?!—]/);
  const rerollsLight = (t: string): boolean =>
    sentences(t).some((x) => /\bLight\b/.test(x) && /\bre-?(roll|reveal)/i.test(x));
  const bad: string[] = [];
  for (const r of RECIPES) {
    for (const s of allSteps(r)) if (rerollsLight(stepText(s))) bad.push(`${r.key} step`);
    for (const m of r.materials) if (rerollsLight(m.note ?? "")) bad.push(`${r.key} ${m.material.id}`);
  }
  ok("Omen of Light is never described as a reroll/re-reveal", bad.length === 0, bad.join(","));
  const noAnnul = RECIPES.flatMap((r) =>
    allSteps(r).filter((s) => uses(s, MATS.omenLight.id) && !/Annul/i.test(stepText(s))).map(() => r.key),
  );
  ok("every step using Omen of Light pairs it with an Annulment", noAnnul.length === 0, noAnnul.join(","));
}

// --- KB §4/§8: Catalysing Exaltation = 5× tag weight at 20% quality ---
{
  const tuls = recipe("ring_catalysing_exalt").materials.find((m) => m.material.id === MATS.tulsCatalyst.id);
  ok("Tul's catalyst note says 5× at 20%", /5×/.test(tuls?.note ?? "") && !/2×/.test(tuls?.note ?? ""), tuls?.note ?? "missing");
}

// --- KB §1: a step that says Perfect-exalt must spend (and price) the Perfect orb ---
{
  const bad = RECIPES.flatMap((r) =>
    allSteps(r)
      .filter((s) => /Perfect[- ]exalt/i.test(s.do) && (!uses(s, MATS.perfectExalted.id) || uses(s, MATS.exalted.id)))
      .map((s) => `${r.key}: ${s.do.slice(0, 40)}`),
  );
  ok("Perfect-exalt steps use MATS.perfectExalted, never MATS.exalted", bad.length === 0, bad.join(" | "));
  const wand = recipe("wand_alloy_crystallisation").materials.map((m) => m.material.id);
  ok("wand budget prices a Perfect Exalted Orb", wand.includes(MATS.perfectExalted.id), wand.join(","));
}

// --- unconfirmed mechanics carry a visible `unverified` flag ---
{
  const wandSteps = allSteps(recipe("wand_alloy_crystallisation"));
  const astrid = wandSteps.find((s) => uses(s, MATS.astridsCreativity.id));
  ok("wand Astrid's step is flagged unverified", !!astrid?.unverified);
  const bench = wandSteps.find((s) => /bench craft/i.test(s.do));
  ok("wand bench-craft step is flagged unverified", !!bench?.unverified);
  // S11 transcript + RePoE (IncreasedSpirit1-5 are ordinary amulet prefixes): Spirit is chaos-spammed on a RARE
  const giga = recipe("amulet_giga_spirit");
  ok("giga Spirit is hunted with Chaos Orbs on a rare base", giga.base.rarity === "rare" && allSteps(giga).some((s) => uses(s, MATS.chaos.id) && /Spirit/.test(s.do)));
}

// --- ring budgets: reveal rerolls priced as Echoes, Light strips paired with Annulments ---
{
  const ids = (key: string): string[] => recipe(key).materials.map((m) => m.material.id);
  const t1 = ids("ring_fractured_t1res");
  ok("fractured ring budgets Abyssal Echoes for reveal rerolls", t1.includes(MATS.omenAbyssalEchoes.id), t1.join(","));
  ok("fractured ring budgets an Annulment line for the Light strips", t1.includes(MATS.annul.id), t1.join(","));
  ok("catalysing ring budgets Abyssal Echoes for its reveal", ids("ring_catalysing_exalt").includes(MATS.omenAbyssalEchoes.id));
}

// --- KB §4: Omen of Putrefaction CORRUPTS — its results must be valued against corrupted items ---
{
  const putrefaction = RECIPES.filter((r) => r.materials.some((m) => m.material.id === MATS.omenPutrefaction.id));
  const clean = putrefaction.filter((r) => r.result.corrupted !== true).map((r) => r.key);
  ok("putrefaction result legs are corrupted comparables", putrefaction.length > 0 && clean.length === 0, clean.join(","));
  // KB §2: a fracture recipe sells a fractured mod — its result must search the fractured stat
  const fractureResults = [
    "amulet_fracture_plus3",
    "gloves_projectile_plus2",
    "ring_fractured_t1res",
    "jewel_fractured_5mod",
    "jewel_timelost_fractured_radius",
    "amulet_plus3_spirit_chaos",
  ].filter(
    (k) => !recipe(k).result.stats.some((s) => s.group === "fractured" && s.tier !== 2),
  );
  ok("fracture recipes value a FRACTURED defining mod", fractureResults.length === 0, fractureResults.join(","));
}

// --- KB §6: Potent liquids only on rare BASIC jewels, Ancient only on rare Time-Lost jewels ---
{
  const potent = new Set<string>([MATS.potentLiquidContempt.id, MATS.potentLiquidFerocity.id]);
  const ancient = new Set<string>([MATS.ancientPotentLiquidContempt.id]);
  const onTimeLost = (r: CraftRecipe): boolean => /Time-Lost/.test(r.base.type ?? "");
  const wrongTier = RECIPES.filter((r) =>
    r.materials.some((m) => (potent.has(m.material.id) && onTimeLost(r)) || (ancient.has(m.material.id) && !onTimeLost(r))),
  );
  ok("liquid tier matches the jewel base (Potent↔basic, Ancient↔Time-Lost)", wrongTier.length === 0, wrongTier.map((r) => r.key).join(","));
  // the removal side and the over-cap strip are creator-observed only — badge them
  const liquidSteps = ["jewel_liquid_5mod_budget", "jewel_fractured_5mod"].flatMap((k) =>
    allSteps(recipe(k)).filter((s) => uses(s, MATS.potentLiquidContempt.id) || uses(s, MATS.omenSinistralAnnulment.id)),
  );
  ok("Contempt + Sinistral-strip steps carry an unverified badge", liquidSteps.length >= 4 && liquidSteps.every((s) => !!s.unverified), String(liquidSteps.length));
  const threeSuffix = ["jewel_liquid_5mod_budget", "jewel_fractured_5mod"].filter(
    (k) => !recipe(k).result.stats.some((s) => s.group === "pseudo" && /Suffix Modifiers/.test(s.text) && s.min === 3 && s.tier !== 2),
  );
  ok("5-mod jewel results require 3 suffixes as a tier-1 stat", threeSuffix.length === 0, threeSuffix.join(","));
}

// --- 2026-09-30 expansion: KB-open and single-source mechanics carry a visible badge ---
{
  const magicEssences = new Set<string>([MATS.greaterEssenceEnhancement.id, MATS.greaterEssenceAbrasion.id]);
  const expansion = ["helmet_tiara_es", "armour_vile_robe_spirit", "armour_vile_robe_es", "crossbow_sovereign_ballista"];
  const essenceSteps = expansion.flatMap((k) => allSteps(recipe(k)).filter((s) => (s.mats ?? []).some((m) => magicEssences.has(m.id))));
  // KB §7 (verified-secondary since 2026-09-30): a Greater essence keeps the magic mods — cited, no longer a badge
  ok("magic-base essence steps cite KB §7 in prose", essenceSteps.length === 4 && essenceSteps.every((s) => /KB §7/.test(s.why ?? "") && !/KB §7/.test(s.unverified ?? "")));
  const sovereign = allSteps(recipe("crossbow_sovereign_ballista")).find((s) => uses(s, MATS.omenTheSovereign.id));
  ok("the 'guaranteed ballista' claim is flagged against RePoE's two Ulaman prefixes", /TWO Ulaman/.test(sovereign?.unverified ?? ""));
  const plus4 = allSteps(recipe("amulet_plus4_breach_quality")).filter((s) => (s.mats ?? []).length > 0);
  ok("every +4 quality-tech step is flagged unverified", plus4.length > 0 && plus4.every((s) => !!s.unverified));
  const putrefy = allSteps(recipe("quiver_putrefaction")).find((s) => uses(s, MATS.omenPutrefaction.id));
  ok("the quiver's 6-mod conflict is flagged on the putrefy step", /6/.test(putrefy?.unverified ?? ""));
  // omen text: Crystallisation acts on the next "Perfect or Corrupted Essence"; Essence of the Breach is a Corrupted one (RePoE)
  const crystalOmens = new Set<string>([MATS.omenDextralCrystallisation.id, MATS.omenSinistralCrystallisation.id]);
  const crystal = ["ring_breach_mana_stacker", "amulet_plus3_spirit_chaos", "amulet_plus4_breach_quality"].flatMap((k) =>
    allSteps(recipe(k)).filter((s) => (s.mats ?? []).some((m) => crystalOmens.has(m.id))),
  );
  const perfectOrCorrupted = (m: { id: string; label: string }): boolean => m.label.startsWith("Perfect") || m.id === MATS.essenceOfTheBreach.id;
  const unpaired = crystal.filter((s) => !(s.mats ?? []).some((m) => m.group === "essence" && perfectOrCorrupted(m)));
  ok("expansion Crystallisation steps pair with a Perfect or Corrupted essence", crystal.length === 3 && unpaired.length === 0, `${crystal.length} steps`);
}

// --- RePoE: Spirit is an ordinary amulet prefix a Chaos Orb can roll on a rare (S11 chaos-spams it) ---
{
  const cat = loadCraftCatalog();
  const amulets = ["Solar Amulet", "Stellar Amulet"].map((b) => comboFor(cat, "Amulets", b));
  ok("amulet prefix pools carry the Spirit family (RePoE IncreasedSpirit1-5)", amulets.every((c) => c !== null && "BaseSpirit" in c.prefix));
  const magicOnly = /Spirit[^.]*only[^.]*(add|while)[^.]*Magic/i;
  const claims = RECIPES.flatMap((r) => [r.base.note, r.result.note, ...r.materials.map((m) => m.note ?? ""), r.guide.shopping, ...allSteps(r).map(stepText)])
    .filter((t) => magicOnly.test(t ?? ""));
  ok("no recipe text claims Spirit only adds while Magic", claims.length === 0, claims.join(" | "));
}

// --- 2026-09-30 second wave: single-source mechanics carry a badge; RePoE gates hold ---
{
  const cat = loadCraftCatalog();
  const ms35 = Object.values(cat.mods).find((m) => m.family === "MovementVelocity" && m.text.startsWith("35%"));
  ok("35% MS boots base clears RePoE's modifier level", !!ms35 && (recipe("boots_evasion_ms_ruin").base.ilvlMin ?? 0) >= ms35.level, String(ms35?.level));
  const gloves = allSteps(recipe("gloves_putrefaction_decay"));
  ok("the putrefaction gloves' Decay-pool claim is flagged", /Decay/.test(gloves.find((s) => uses(s, MATS.omenPutrefaction.id))?.unverified ?? ""));
  ok("the gloves' 2-socket claim is flagged against the KB cap", /1 socket/.test(gloves.find((s) => uses(s, MATS.artificers.id))?.unverified ?? ""));
  const bossSteps = ["belt_life_res_desecrated_hybrid", "ring_prismatic_catalyst_attack"].map((k) => allSteps(recipe(k)).find((s) => uses(s, MATS.omenTheSovereign.id)));
  ok("the boss-omen hybrid reveals are flagged (K6 / all-boss options)", bossSteps.every((s) => /3\/4/.test(s?.unverified ?? "")));
  const fireSlam = allSteps(recipe("ring_prismatic_catalyst_attack")).find((s) => uses(s, MATS.xophsCatalyst.id));
  ok("an omen-less catalyst slam is flagged against KB §8", /KB §8/.test(fireSlam?.unverified ?? "") && !uses(fireSlam!, MATS.omenCatalysingExaltation.id));
  // entity catalog: Scraps improve "an armour", Whetstones "a martial weapon"
  // poe2db: Seeking's crit is a SUFFIX on every class — the crit bow must not route it into a prefix
  const seeking = recipe("bow_seeking_desecrated_prefix").guide.shopping;
  ok("the Seeking bow keeps a suffix open for its essence", /suffix open for the essence/.test(seeking) && !/prefix open for the essence/.test(seeking));
  const foreign: Partial<Record<CraftRecipe["domain"], string>> = { armour: MATS.whetstone.id, weapon: MATS.scrap.id };
  const wrongQuality = RECIPES.filter((r) => allSteps(r).some((s) => uses(s, foreign[r.domain] ?? "")));
  ok("armour never spends Whetstones, weapons never spend Scraps", wrongQuality.length === 0, wrongQuality.map((r) => r.key).join(","));
}

// --- data integrity survives the edits ---
{
  ok("33 curated recipes", RECIPES.length === 33, String(RECIPES.length));
  const badRate = RECIPES.filter((r) => !(r.hitRate > 0 && r.hitRate <= 1));
  ok("all hitRates in (0,1]", badRate.length === 0, badRate.map((r) => r.key).join(","));
  const badQty = RECIPES.flatMap((r) => r.materials).filter((m) => !(m.qtyPerAttempt > 0));
  ok("all material qtyPerAttempt > 0", badQty.length === 0, badQty.map((m) => m.material.id).join(","));
}

// --- step legality (craftProvenance/legality): catalog presence, KB §1 floors + rarity, §5 ilvl gates ---
{
  const patch = loadEntityCatalog().game_data_patch;
  const broken = RECIPES.flatMap((r) =>
    recipeLegality(r, entityByExchangeId, patch)
      .filter((s) => s.verdict === "violation")
      .map((s) => `${r.key}#${s.idx}: ${s.checks.filter((c) => c.verdict === "violation").map((c) => c.detail).join("; ")}`),
  );
  ok("no guide step breaks a catalog, floor, rarity or ilvl rule", broken.length === 0, broken.join(" | "));
  // KB §4: Whittling works ONLY with a Chaos Orb — every Whittling step must pair as that rule expects
  const whittle = RECIPES.flatMap((r) => allSteps(r).filter((s) => uses(s, MATS.omenWhittling.id) && uses(s, MATS.chaos.id)));
  const unpaired = whittle.filter((s) => !checkStep(s, { ilvlMin: 82, rarity: "rare", asBought: false }, entityByExchangeId, patch).some((c) => c.kind === "pairing" && c.verdict === "ok"));
  ok("Whittling + Chaos steps match the verified Whittling rule", whittle.length >= 1 && unpaired.length === 0, `${whittle.length} steps`);
}

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
