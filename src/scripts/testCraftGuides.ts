/* Guide-content invariants: every curated recipe's playbook must agree with the verified KB
 * (docs/research/poe2-crafting-knowledge.md) and the RePoE catalog text on the mechanics that cost
 * real currency when stated wrong — fracture mod count, reveal sides, Omen of Light, catalyst weight,
 * Perfect-vs-regular exalts, and visible flags on unconfirmed steps. Pure data checks, no network. */
import "../config/env";
import { MATS } from "../core/craftMaterials";
import { RECIPES, type CraftRecipe, type GuideStep } from "../core/craftRecipes";

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
  const loop = allSteps(recipe("amulet_giga_spirit")).find((s) => /Desecrate.*repeatedly/i.test(s.do));
  ok("giga-Spirit multi-desecration loop is flagged unverified", !!loop?.unverified);
}

// --- ring budgets: reveal rerolls priced as Echoes, Light strips paired with Annulments ---
{
  const ids = (key: string): string[] => recipe(key).materials.map((m) => m.material.id);
  const t1 = ids("ring_fractured_t1res");
  ok("fractured ring budgets Abyssal Echoes for reveal rerolls", t1.includes(MATS.omenAbyssalEchoes.id), t1.join(","));
  ok("fractured ring budgets an Annulment line for the Light strips", t1.includes(MATS.annul.id), t1.join(","));
  ok("catalysing ring budgets Abyssal Echoes for its reveal", ids("ring_catalysing_exalt").includes(MATS.omenAbyssalEchoes.id));
}

// --- data integrity survives the edits ---
{
  ok("14 curated recipes", RECIPES.length === 14, String(RECIPES.length));
  const badRate = RECIPES.filter((r) => !(r.hitRate > 0 && r.hitRate <= 1));
  ok("all hitRates in (0,1]", badRate.length === 0, badRate.map((r) => r.key).join(","));
  const badQty = RECIPES.flatMap((r) => r.materials).filter((m) => !(m.qtyPerAttempt > 0));
  ok("all material qtyPerAttempt > 0", badQty.length === 0, badQty.map((m) => m.material.id).join(","));
}

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
