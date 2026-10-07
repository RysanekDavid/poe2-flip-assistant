/* Craft planner: golden plans, rule-violation refusals, odds basis, the expectation math, search
 * determinism + cap, the legality projection, the essence table vs the catalog, and the contract.
 * Run: npm run test:tools:craft-planner */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isRmtUrl } from "../../lib/claim";
import { loadCraftCatalog, type CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { ESSENCE_OUTCOMES } from "../../core/tools/planner/essenceOutcomes";
import { solveChain, type ChainNode } from "../../core/tools/planner/expectation";
import { planCraft, PlanRejectedError, buildCtx } from "../../core/tools/planner/plan";
import { searchPlan, SearchCappedError } from "../../core/tools/planner/search";
import { slotIssues } from "../../core/tools/planner/targets";
import { plannerCatalog, plannerPool } from "../../core/tools/planner/load";
import { plannerCatalogSchema, plannerPoolSchema, planRequestSchema, planResponseSchema, type PlanRequest } from "../../lib/tools/craftPlannerContract";
import { BREACH_RING, FRACTURE_PLUS3_AMULET, FRACTURED_T1RES_RING, OWNER_FLAT_RING, OWNER_POOL_RING, fixturePrices, target } from "./plannerFixtures";
import { NOW, plan, runGoldenCases } from "./testCraftPlannerGolden";
import { runPlannerStateCases } from "./craftPlannerStateCases";
import { runSanityCases } from "./craftPlannerSanityCases";
import { runWhittleCases } from "./craftPlannerWhittleCases";
import { runCacheCases } from "./craftPlannerCacheCases";
import { runPoolCases } from "./craftPlannerPoolCases";
import { runReviewCases } from "./craftPlannerReviewCases";
import { runFractureCases } from "./craftPlannerFractureCases";
import { KB2_FACTS, testKbFracture } from "./craftPlannerKbFacts";
import { runAlloyCases } from "./craftPlannerAlloyCases";
import { runLazyCases } from "./craftPlannerLazyCases";

function rejected(cat: CraftCatalog, req: PlanRequest): PlanRejectedError {
  try {
    planCraft(req, { cat, prices: fixturePrices(), exaltPerDivine: null, league: "Test", now: NOW });
  } catch (e: unknown) {
    if (e instanceof PlanRejectedError) return e;
    throw e;
  }
  assert.fail(`expected a refusal for ${JSON.stringify(req.targets)}`);
}

const ring = (base: string, ilvl: number, targets: PlanRequest["targets"], extra: Partial<PlanRequest> = {}): PlanRequest => ({ itemClass: "Rings", base, ilvl, targets, includeUnverified: false, quality: null, ...extra });
const ruleOf = (e: PlanRejectedError): string[] => e.issues.filter((i) => i.severity === "impossible").map((i) => i.rule);

function testViolations(cat: CraftCatalog): void {
  const sameGroup = rejected(cat, { itemClass: "Amulets", base: "Stellar Amulet", ilvl: 82, targets: [target("GlobalIncreaseSpellSkillGemLevel", "suffix", "GlobalSpellGemsLevel3"), target("GlobalIncreaseMinionSpellSkillGemLevel", "suffix", "GlobalMinionSpellSkillGemLevel3")], includeUnverified: false, quality: null });
  assert.deepEqual(ruleOf(sameGroup), ["mod-group"], "two IncreaseSocketedGemLevel mods can't coexist");
  const fourPrefixes = [target("IncreasedLife", "prefix", "IncreasedLife1"), target("IncreasedMana", "prefix", "IncreasedMana1"), target("FireDamage", "prefix", "AddedFireDamage1"), target("ColdDamage", "prefix", "AddedColdDamage1")];
  assert.deepEqual(ruleOf(rejected(cat, ring("Ruby Ring", 82, fourPrefixes))), ["affix-cap"], "4 prefixes on a Ruby Ring");
  const dusk = buildCtx(ring("Dusk Ring", 82, fourPrefixes), { cat, prices: fixturePrices(), exaltPerDivine: null, league: "Test", now: NOW });
  assert.ok(!dusk.issues.some((i) => i.severity === "impossible"), "a Dusk Ring holds 4 prefixes (+1 prefix implicit)");
  assert.ok(plan(cat, ring("Dusk Ring", 82, fourPrefixes)).steps.length > 1, "and the planner finds a way");
  const lowIlvl = rejected(cat, ring("Ruby Ring", 75, [target("FireResistance", "suffix", "FireResist8")]));
  assert.deepEqual(ruleOf(lowIlvl), ["ilvl-gate"]);
  assert.match(lowIlvl.issues[0]!.message, /needs item level 82/);
  const twoDesecrated = rejected(cat, ring("Breach Ring", 82, [target("IncreasedMinionDamageIfYouHitEnemy", "prefix", "AbyssModRingAmuletAmanamuPrefixMinionDamageIfYou'veHitRecently"), target("RemnantEffect", "prefix", "AbyssModRingAmuletAmanamuPrefixRemnantEffect")]));
  assert.deepEqual(ruleOf(twoDesecrated), ["one-desecrated"]);
  assert.match(twoDesecrated.issues[0]!.message, /Putrefaction/);
  const timeLost = rejected(cat, { itemClass: "Jewels", base: "Time-Lost Sapphire", ilvl: 82, targets: threePrefixes(cat, "Jewels", "Time-Lost Sapphire"), includeUnverified: true, quality: null });
  assert.deepEqual(ruleOf(timeLost), ["affix-cap"], "rare Time-Lost jewels hold 2 + 2");
  assert.equal(timeLost.issues[0]!.grade, "vs");
  const notCrafted = rejected(cat, ring("Ruby Ring", 82, [target("MaximumLifeIncreasePercent", "prefix", "EssenceIncreasedLifePercent1")]));
  assert.deepEqual(ruleOf(notCrafted), ["essence-table"], "no curated essence writes % life on a ring");
  const quality = rejected(cat, ring("Ruby Ring", 82, [target("IncreasedMana", "prefix", "IncreasedMana12")], { quality: { catalyst: "neural-catalyst", pct: 60 } }));
  assert.deepEqual(ruleOf(quality), ["quality-cap"], "a Ruby Ring tops out at 40% (20% + the Breach essence's 20%)");
  testTwoCrafted(cat);
  testJewelOverCap(cat);
}

function threePrefixes(cat: CraftCatalog, cls: string, base: string): PlanRequest["targets"] {
  const combo = Object.values(cat.classes[cls]!).find((c) => c.bases.includes(base))!;
  return Object.entries(combo.prefix).slice(0, 3).map(([family, tiers]) => target(family, "prefix", Object.keys(tiers)[0]!));
}

/** Two essence-only targets: the curated table holds one per MVP class, so the rule is driven directly. */
function testTwoCrafted(cat: CraftCatalog): void {
  const ctx = buildCtx(BREACH_RING, { cat, prices: fixturePrices(), exaltPerDivine: null, league: "Test", now: NOW }).ctx;
  const crafted = ctx.targets.find((t) => t.source === "essence")!;
  const issues = slotIssues(ctx.base, [crafted, { ...crafted, idx: 9 }]);
  assert.ok(issues.some((i) => i.rule === "one-crafted" && /Astrid's Creativity/.test(i.message)), "two crafted-only mods name Astrid's Creativity");
}

/**
 * jewel_liquid_5mod_budget: 3 suffixes + 2 prefixes on a basic Sapphire. The over-cap Contempt route
 * ends with an Exalt onto an over-cap jewel (KB §6 b, unverified): no plan by default, a badged plan
 * with "include unverified methods". 4 suffixes stays impossible.
 */
function testJewelOverCap(cat: CraftCatalog): void {
  const combo = Object.values(cat.classes.Jewels!).find((c) => c.bases.includes("Sapphire"))!;
  const pick = (side: "prefix" | "suffix", n: number) => Object.entries(combo[side]).slice(0, n).map(([family, tiers]) => target(family, side, Object.keys(tiers)[0]!));
  const req: PlanRequest = { itemClass: "Jewels", base: "Sapphire", ilvl: 82, targets: [...pick("suffix", 3), ...pick("prefix", 2)], includeUnverified: false, quality: null };
  const e = rejected(cat, req);
  assert.deepEqual(ruleOf(e), [], "feasible on paper (over-cap route) …");
  assert.match(e.message, /include unverified methods/, "… but no plan with verified + creator-demonstrated methods");
  assert.ok(e.issues.some((i) => i.rule === "over-cap-jewel" && i.severity === "warn"));
  const p = plan(cat, { ...req, includeUnverified: true });
  const ids = p.steps.map((s) => s.method);
  assert.ok(ids.includes("contempt-suffix") && ids.includes("strip-contempt"), `Contempt route planned: ${ids.join(", ")}`);
  const contempt = p.steps.find((s) => s.method === "contempt-suffix")!;
  assert.equal(contempt.odds.basis, "estimate");
  assert.deepEqual(contempt.instructions[0]!.retryTo, { phase: p.steps[0]!.phase, step: 1 }, "the wrong Contempt mod restarts on a new base");
  assert.ok(p.steps.some((s) => s.grade === "uv" && /over-cap/.test(s.unverified ?? "")), "the over-cap add is badged unverified");
  assert.deepEqual(ruleOf(rejected(cat, { ...req, targets: [...pick("suffix", 4)] })), ["affix-cap"], "4 suffixes: never");
}

function testOddsBasis(cat: CraftCatalog): void {
  for (const req of [BREACH_RING]) {
    const p = plan(cat, req);
    for (const s of p.steps) {
      assert.ok(s.odds.formula.length > 0, `${s.method} carries its formula`);
      if (/^(chaos-loop|slam-|magic-loop|desecrate)/.test(s.method)) assert.equal(s.odds.basis, "estimate", `${s.method}: an add is an estimate`);
      if (/^(acquire|plant-junk|essence|fracture|strip|blocker)/.test(s.method)) assert.equal(s.odds.basis, "exact", `${s.method}: count-based`);
      for (const m of s.materials) assert.ok(m.qty.low <= m.qty.point && m.qty.point <= m.qty.high, `${s.method} ${m.id} band`);
    }
  }
}

/** Geometric closed form vs the chain solver, and the two-slot chain with a 1/2 wrong Annulment by hand. */
function testExpectation(): void {
  const p = 0.2;
  const geo: ChainNode[] = [
    { id: "s", terminal: false, cost: { slam: 1 }, edges: [{ to: "t", p }, { to: "j", p: 1 - p }] },
    { id: "j", terminal: false, cost: { annul: 1 }, edges: [{ to: "s", p: 1 }] },
    { id: "t", terminal: true, cost: {}, edges: [] },
  ];
  const g = solveChain(geo, "s", ["slam", "annul"]);
  assert.ok(Math.abs(g.slam! - 1 / p) < 1e-9 && Math.abs(g.annul! - (1 - p) / p) < 1e-9, "geometric: 1/p slams, (1−p)/p fixes");
  const q = 0.2;
  const two: ChainNode[] = [
    { id: "A", terminal: false, cost: { slam: 1 }, edges: [{ to: "B", p }, { to: "A'", p: 1 - p }] },
    { id: "A'", terminal: false, cost: { annul: 1 }, edges: [{ to: "A", p: 1 }] },
    { id: "B", terminal: false, cost: { slam: 1 }, edges: [{ to: "T", p: q }, { to: "B'", p: 1 - q }] },
    { id: "B'", terminal: false, cost: { annul: 1 }, edges: [{ to: "B", p: 0.5 }, { to: "A'", p: 0.5 }] },
    { id: "T", terminal: true, cost: {}, edges: [] },
  ];
  // E_B = (1 + r/p)/q with r = (1−q)/2; E_A = 1/p + E_B → 5 + 15 = 20 slams at p = q = 0.2
  assert.ok(Math.abs(solveChain(two, "A", ["slam"]).slam! - 20) < 1e-9, "two-res chain = 20 slams by hand");
}

function testDeterminismAndCap(cat: CraftCatalog): void {
  assert.equal(JSON.stringify(plan(cat, BREACH_RING)), JSON.stringify(plan(cat, BREACH_RING)), "same request → byte-identical plan");
  const { ctx } = buildCtx(BREACH_RING, { cat, prices: fixturePrices(), exaltPerDivine: null, league: "Test", now: NOW });
  assert.throws(() => searchPlan(ctx, 2), SearchCappedError);
}

function testEssenceTable(cat: CraftCatalog): void {
  const norm = (s: string) => s.replace(/—/g, "-");
  for (const r of ESSENCE_OUTCOMES) {
    const mod = cat.mods[r.modId];
    assert.ok(mod, `${r.essenceId} → ${r.modId} exists`);
    assert.equal(mod.text, norm(r.poe2dbText), `${r.essenceId} ${r.itemClass}: catalog text = poe2db text`);
    assert.match(r.source, /^https:\/\/poe2db\.tw\/us\//);
    assert.equal(isRmtUrl(r.source), false);
    if (!mod.craftedOnly) {
      for (const combo of Object.values(cat.classes[r.itemClass]!)) assert.ok(combo[mod.side][mod.family]?.[r.modId] != null, `${r.modId} rolls on ${r.itemClass}`);
    }
  }
  assert.ok(!ESSENCE_OUTCOMES.some((r) => (r.itemClass as string) === "Jewels"), "no essence row for jewels (no poe2db page lists them)");
}

/** Owner rules the library must never break: no Gnawed bones, no Greater Exaltation, no Greater/Perfect Chaos. */
function testLibraryNeverUses(): void {
  const dir = join(process.cwd(), "src", "core", "tools", "planner");
  const src = readdirSync(dir).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
  for (const banned of ["gnawedCollarbone", "gnawedJawbone", "gnawedRib", "omenGreaterExaltation", "greaterChaos", "perfectChaos"]) {
    assert.ok(!src.includes(`"${banned}"`), `the planner never plans ${banned}`);
  }
}

function testContract(): void {
  assert.equal(planRequestSchema.safeParse({ ...BREACH_RING, targets: [] }).success, false, "at least one target");
  assert.equal(planRequestSchema.safeParse({ ...BREACH_RING, targets: [...BREACH_RING.targets, BREACH_RING.targets[0]!] }).success, false, "no duplicate mod");
  assert.equal(planRequestSchema.safeParse({ ...BREACH_RING, itemClass: "Boots" }).success, false, "MVP classes only");
  const parsed = planRequestSchema.parse({ itemClass: "Rings", base: "Breach Ring", ilvl: 82, targets: [{ family: "IncreasedMana", side: "prefix", minModId: "IncreasedMana12" }] });
  assert.equal(parsed.includeUnverified, false, "unverified methods are opt-in");
  assert.equal(parsed.targets[0]!.fractured, false);
}

/** What the planner UI reads: the item after each step, material art, catalog/pool art. */
function testUiFields(cat: CraftCatalog): void {
  const icon = (id: string) => `https://web.poecdn.com/gen/image/x/0123456789/${id}.png`;
  const p = planResponseSchema.parse(planCraft(BREACH_RING, { cat, prices: fixturePrices(), exaltPerDivine: 400, league: "Test", now: NOW, iconOf: icon }));
  const last = p.steps.at(-1)!.after;
  const met = new Set(last.affixes.map((a) => a.target).filter((t) => t != null));
  assert.equal(met.size, BREACH_RING.targets.length, "the last step's item carries every target");
  // PR-A: the Breach plan self-fractures a wanted resistance instead of buying a junk anchor
  assert.ok(p.steps.find((s) => s.method === "fracture")!.after.affixes.some((a) => a.kind === "fractured" && a.target != null), "the item after the fracture shows the fractured wanted mod");
  for (const line of p.bill) assert.equal(p.icons[line.id], icon(line.id), `bill art for ${line.id}`);
  assert.equal(p.exaltPerDivine, 400);
  assert.deepEqual(plan(cat, BREACH_RING).icons, {}, "no art source → no icons, never a guess");
  const catalog = plannerCatalogSchema.parse(plannerCatalog(cat));
  assert.ok(catalog.catalysts.every((c) => c.icon == null || c.icon.startsWith("https://web.poecdn.com/")), "catalyst art is poecdn (CSP)");
  const pool = plannerPoolSchema.parse(plannerPool("Rings", "Breach Ring", cat));
  assert.equal(pool.bone.id, "preserved-collarbone", "rings desecrate with a Collarbone");
  assert.equal(plannerPoolSchema.parse(plannerPool("Jewels", "Emerald", cat)).bone.id, "preserved-cranium", "jewels with a Cranium");
}

/** Every string in a value, depth-first (object keys too: odds inputs are shown by key). */
function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => [k, ...strings(x)]);
  return [];
}

const DEV_REF = /\.md\b|§|\bsrc\/|\bdocs\/|theory-gaps|\bKB\b/;

/** Players read every planner string: no file names, section signs or research-note ids. */
function testNoDeveloperReferences(cat: CraftCatalog): void {
  const combo = Object.values(cat.classes.Jewels!).find((c) => c.bases.includes("Sapphire"))!;
  const pick = (side: "prefix" | "suffix", n: number) => Object.entries(combo[side]).slice(0, n).map(([family, tiers]) => target(family, side, Object.keys(tiers)[0]!));
  const jewel: PlanRequest = { itemClass: "Jewels", base: "Sapphire", ilvl: 82, targets: [...pick("suffix", 3), ...pick("prefix", 2)], includeUnverified: true, quality: null };
  const quality: PlanRequest = { ...BREACH_RING, quality: { catalyst: "xophs-catalyst", pct: 40 } };
  const pools = [OWNER_POOL_RING({ kind: "bought", carried: null, askDiv: 65 }, { catalyst: "reaver-catalyst", pct: 60 }, 9), OWNER_POOL_RING({ kind: "clean" })];
  const golden = [BREACH_RING, FRACTURED_T1RES_RING, FRACTURE_PLUS3_AMULET, { ...BREACH_RING, includeUnverified: true }, jewel, quality, OWNER_FLAT_RING, ...pools];
  const shown = golden.flatMap((req) => {
    const p = plan(cat, req);
    // patch/method/rule ids are not shown as prose; everything else is
    return strings({ steps: p.steps.map((s) => ({ ...s, method: "", rules: [] })), guide: p.guide, feasibility: p.feasibility, targets: p.targets, alternatives: p.alternatives, start: p.start });
  });
  const refusals = [
    ring("Ruby Ring", 60, [target("FireResistance", "suffix", "FireResist8")]),
    ring("Ruby Ring", 82, [target("FireResistance", "suffix", "FireResist8", true), target("ColdResistance", "suffix", "ColdResist8", true)]),
  ].flatMap((req) => strings(rejected(cat, req).issues));
  const leaks = [...shown, ...refusals].filter((s) => DEV_REF.test(s));
  assert.deepEqual([...new Set(leaks)], [], "no developer references in player-facing planner text");
  assert.ok(plan(cat, BREACH_RING).steps.some((s) => s.instructions.some((i) => i.sources.length > 0)), "sources travel beside the why");
}

const cat = loadCraftCatalog();
testUiFields(cat);
testNoDeveloperReferences(cat);
runGoldenCases(cat);
testViolations(cat);
testOddsBasis(cat);
testExpectation();
testDeterminismAndCap(cat);
testEssenceTable(cat);
testLibraryNeverUses();
testContract();
runPlannerStateCases(cat);
runSanityCases(cat);
runWhittleCases(cat);
runCacheCases(cat);
runPoolCases(cat);
runReviewCases(cat);
runFractureCases(cat);
testKbFracture();
runAlloyCases(cat);
runLazyCases(cat);
console.log(
  `ALL PASS — craft-planner: golden plans (Breach mana stacker, fractured-flat res ring, fractured +3 amulet), violations (mod group, caps incl. Dusk/Time-Lost, ilvl gate, one crafted/desecrated, essence table, quality cap, over-cap jewel), ` +
    `odds basis, geometric + absorbing chain by hand, determinism + search cap, ${ESSENCE_OUTCOMES.length} essence rows vs catalog + poe2db, banned methods, contract, UI fields (item after each step, material/bone art), no developer references in player text, state/projection cases, cost sanity (owner's 13,201-slam ring: a flat self-fractured, last flat desecrated, under 700 div, pool variant cheaper; four-flat Dusk Ring flagged + cheaper alternatives; partial hits by hand, goldens unflagged, time budgets), whittle loop (ties / no tie / unique-lowest by hand, fixed-mod guard, older-server defaults), route memo (cut-short plans not cached, 45 s timeout refusal, capped candidate = incomplete list), P1 (pool feasibility, reveal model by hand, owner pool ring inside the creators' band clean + bought, Light anchor, bought-base golden + start refusals, quality ordering, buy link), PR-A self-fracture (1-in-3 behind the blocker, last-target prune, throwaway Chaos loop, owner T1 pool ring unwhittled), ${KB2_FACTS.length} KB §2 facts + transcript quotes, alloys (table vs catalog + poe2db, steered Swift Alloy graded creator-shown, Breach strip first, one-crafted refusal, alloy rule, KB §7 pins), lazy edges (lazy = eager plan/totals/expanded on goldens + owner rings, bounds ≤ cost, owner + six-single rings pinned inside the server budget, fracture miss text, crafted keeper)`,
);
