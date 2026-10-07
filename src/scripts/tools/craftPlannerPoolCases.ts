/* Craft planner P1 cases: mod pools ("any k of n"), the bought-base start, desecration for ordinary
 * mods (the reveal model) and the quality ordering, plus the market-reality case — the owner's
 * Breach Ring as a pool must land inside the creators' cost band (docs/research/craft-mining/
 * ring-attack-flat/synthesis.md §2, §5). Imported by testCraftPlanner.ts. */
import assert from "node:assert/strict";
import { loadCraftMining } from "../../core/research/craftMining/load";
import { buildBaseLink, statCatalogs } from "../../core/tools/planner/baseLink";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { mat } from "../../core/tools/planner/methodKit";
import { buildCtx, planCraft, PlanRejectedError } from "../../core/tools/planner/plan";
import { revealOdds } from "../../core/tools/planner/reveal";
import { revealPriorsFrom } from "../../core/tools/planner/revealPriors";
import { canonical, junk, targetAffix } from "../../core/tools/planner/state";
import type { PlanCtx, RevealPriors } from "../../core/tools/planner/types";
import { planResponseSchema, type PlanRequest, type PlanResponse } from "../../lib/tools/craftPlannerContract";
import { FRACTURED_T1RES_RING, OWNER_POOL_RING, fixturePrices, target } from "./plannerFixtures";
import { NOW } from "./testCraftPlannerGolden";

const reveal = (): RevealPriors => revealPriorsFrom(loadCraftMining().priors);
const deps = (cat: CraftCatalog) => ({ cat, prices: fixturePrices(), exaltPerDivine: 250, league: "Test", now: NOW, reveal: reveal() });
const planOf = (cat: CraftCatalog, req: PlanRequest): PlanResponse => planResponseSchema.parse(planCraft(req, deps(cat)));
const ctxOf = (cat: CraftCatalog, req: PlanRequest): PlanCtx => buildCtx(req, deps(cat)).ctx;
const methods = (p: PlanResponse): string => p.steps.map((s) => s.method).join(", ");

function rejectedRules(cat: CraftCatalog, req: PlanRequest): string[] {
  try {
    planCraft(req, deps(cat));
  } catch (e: unknown) {
    if (e instanceof PlanRejectedError) return e.issues.filter((i) => i.severity === "impossible").map((i) => i.rule);
    throw e;
  }
  return assert.fail(`expected a refusal: ${JSON.stringify(req.groups)}`);
}

const ring = (groups: PlanRequest["groups"], targets: PlanRequest["targets"] = []): PlanRequest => ({ itemClass: "Rings", base: "Breach Ring", ilvl: 82, targets, groups, includeUnverified: false, quality: null });
const flat = (family: string, id: string) => ({ family, minModId: id });

function testPoolFeasibility(cat: CraftCatalog): void {
  const flats4 = [flat("ColdDamage", "AddedColdDamage7"), flat("FireDamage", "AddedFireDamage7"), flat("LightningDamage", "AddedLightningDamage7"), flat("PhysicalDamage", "AddedPhysicalDamage7")];
  assert.deepEqual(rejectedRules(cat, ring([{ side: "prefix", need: 3, candidates: flats4 }], [target("IncreasedMana", "prefix", "IncreasedMana12")])), ["affix-cap"], "3 pool slots + a single prefix overfill a Breach Ring");
  assert.deepEqual(rejectedRules(cat, { ...ring([{ side: "prefix", need: 2, candidates: flats4 }]), ilvl: 55 }), ["ilvl-gate", "ilvl-gate", "ilvl-gate", "ilvl-gate"], "every candidate's minimum tier is gated by item level");
  const essence = rejectedRules(cat, ring([{ side: "prefix", need: 1, candidates: [flat("MaximumManaIncreasePercent", "EssenceIncreasedManaPercent1"), flats4[0]!] }]));
  assert.deepEqual(essence, ["pool-source"], "an essence-only mod can't be a pool candidate");
  const blocked = buildCtx(ring([{ side: "prefix", need: 2, candidates: flats4.slice(0, 2) }], [target("ColdDamage", "prefix", "AddedColdDamage9")]), deps(cat));
  assert.ok(blocked.issues.some((i) => i.rule === "pool-blocked" && i.severity === "warn") && blocked.issues.some((i) => i.rule === "pool-need"), "a candidate a single target blocks is left out, then the pool is short");
  const ctx = ctxOf(cat, ring([{ side: "prefix", need: 3, candidates: flats4 }]));
  assert.deepEqual(ctx.targets.map((t) => [t.group, t.alts.length]), [[0, 4], [0, 4], [0, 4]], "three slots share the four candidates");
}

/** The reveal model by hand: p = the wanted share of the side's families, two draws at ilvl 65+, three below, Ancient drops tiers under 40. */
function testRevealModel(cat: CraftCatalog): void {
  const req = ring(undefined, [target("FireResistance", "suffix", "FireResist7")]);
  const ctx = ctxOf(cat, req);
  const state = canonical({ rarity: "Rare", affixes: [junk("prefix"), junk("prefix"), junk("suffix")], quality: 0, catalyst: null });
  const odds = revealOdds(ctx, state, ctx.targets[0]!, { factionOmen: false, bone: "preserved" })!;
  const p = Number(odds.once.inputs["wanted share of them"]);
  const families = Number(odds.once.inputs["families the Well can offer"]);
  assert.ok(Math.abs(p - 2 / 8 / families) < 1e-4, `fire res T2+: 2 of 8 tiers of one of ${families} families, got ${p}`);
  assert.ok(Math.abs(odds.first - (1 - (1 - 2 / 8 / families) ** 2)) < 1e-9, "item level 82: one option is a faction mod, two draws for the ordinary pool");
  assert.ok(odds.once.low! < odds.first && odds.once.high! > odds.first && odds.withEchoes.point! > odds.first, "a band, and Echoes is one more draw");
  const low = ctxOf(cat, { ...req, ilvl: 72 });
  const lowOdds = revealOdds(low, state, low.targets[0]!, { factionOmen: false, bone: "preserved" })!;
  assert.ok(lowOdds.first > 0, "below 82 still offered");
  const anc = revealOdds(ctx, state, ctx.targets[0]!, { factionOmen: false, bone: "ancient" })!;
  assert.ok(anc.first > odds.first, "Ancient bones cut the tiers under level 40: better odds for a level-71 tier");
  assert.match(odds.once.formula, /creator's statement, confirmed by game patch notes/, "the options count names its basis");
}

/** The ring-attack-flat creators' band (synthesis §2): Keyson 300–400 incl. the 60–70 div base, 200–700 range; T3 mid budget 50–80. */
function testOwnerMarketCase(cat: CraftCatalog): void {
  const bought = planOf(cat, OWNER_POOL_RING({ kind: "bought", carried: null, askDiv: 65 }));
  const clean = planOf(cat, OWNER_POOL_RING({ kind: "clean" }));
  for (const p of [bought, clean]) {
    assert.deepEqual(p.steps.filter((s) => s.impractical).map((s) => s.method), [], `no impractical step: ${methods(p)}`);
    assert.ok(p.expanded < 600, `searched ${p.expanded} item states (CPU budget)`);
  }
  const withBase = bought.totalsWithBase!.div!;
  assert.ok(withBase.point >= 100 && withBase.point <= 700, `bought base at 65 div: ${withBase.point} div in total, inside the creators' 100–700`);
  assert.ok(Math.abs(withBase.point - bought.totals.div!.point - 65) < 1e-9, "the base is bought once (no restart step)");
  assert.equal(bought.start.kind, "bought");
  if (bought.start.kind === "bought") {
    assert.equal(bought.start.carried.length, 1);
    assert.ok(bought.start.carried[0]!.fractured && bought.start.carried[0]!.modIds.length === 4, "the planner buys a base with any one of the four flats fractured");
  }
  assert.equal(bought.steps[0]!.method, "acquire-bought-rare");
  assert.ok(clean.totals.div!.point >= 50 && clean.totals.div!.point <= 200, `clean base, T3+ flats: ${clean.totals.div!.point} div (creators: 50–80 at T3, 120–200 at T1)`);
  const noAsk = planOf(cat, OWNER_POOL_RING({ kind: "bought", carried: null, askDiv: null }));
  assert.equal(noAsk.totalsWithBase!.div, null, "no base price → the total with the base waits for it");
  assert.deepEqual(noAsk.totals, bought.totals, "the price only adds to the total, it never changes the plan");
  testPoolSlotsInResponse(clean);
  testLightAnchor(cat);
}

/**
 * The creators' Omen of Light count for the last ring prefix as a T1 attack flat (rings prior:
 * usually under 10, 15 should be enough) holds the model to within ½…2× (plan §3.2 i (5)).
 */
function testLightAnchor(cat: CraftCatalog): void {
  const anchor = reveal().lightAnchor!;
  const p = planOf(cat, OWNER_POOL_RING({ kind: "bought", carried: null, askDiv: 65 }, { catalyst: "reaver-catalyst", pct: 60 }, 9));
  const step = p.steps.find((s) => /^desecrate-/.test(s.method) && p.targets[s.after.affixes.find((a) => a.kind === "desecrated")!.target!]!.side === "prefix");
  assert.ok(step, `the T1 pool desecrates its last flat prefix: ${methods(p)}`);
  const lights = step.materials.find((m) => m.id === mat("omenLight").id)!.qty.point;
  assert.ok(lights >= anchor.point / 2 && lights <= anchor.point * 2, `${lights} Lights vs the creators' usual ${anchor.point} (≤ ${anchor.high})`);
  assert.ok(step.instructions.some((i) => i.why.includes(`under ${anchor.point} Omens of Light`)), "the step shows the creators' count");
  assert.ok(step.unverified && /poe2db/.test(step.unverified), "ordinary mods at the Well carry their evidence");
  const total = p.totalsWithBase!.div!.point;
  assert.ok(total >= 100 && total <= 700, `T1 flats, 60% Reaver, bought base at 65 div: ${total} div (creators 300–400 incl. base, 200–700 range)`);
}

function testPoolSlotsInResponse(p: PlanResponse): void {
  const slots = p.targets.filter((t) => t.group != null);
  assert.equal(slots.length, 5, "3 prefix + 2 suffix pool slots");
  assert.ok(slots.every((t) => t.candidates.length === 4 && t.text.startsWith("any of: ")));
  const end = p.steps.at(-1)!.after.affixes.filter((a) => a.target != null && p.targets[a.target]!.group != null);
  assert.equal(end.length, 5);
  for (const g of [0, 1]) {
    const alts = end.filter((a) => p.targets[a.target!]!.group === g).map((a) => a.alt);
    assert.ok(alts.every((a) => a != null) && new Set(alts).size === alts.length, `pool ${g}: distinct candidates landed (${alts.join(",")})`);
  }
  assert.ok(p.guide.goal.includes("three of: ") && p.guide.goal.includes("two of: "), `the goal reads the pools once: ${p.guide.goal}`);
}

/** The curated fractured-res recipe really starts from a bought fractured flat: with that start, no blocker, no fracture. */
function testBoughtGolden(cat: CraftCatalog): void {
  const req: PlanRequest = { ...FRACTURED_T1RES_RING, start: { kind: "bought", carried: [{ ref: 0, fractured: true }], askDiv: null } };
  const p = planOf(cat, req);
  const seq = methods(p);
  assert.ok(seq.startsWith("acquire-bought-rare") && !/blocker|fracture/.test(seq), `the bought route skips the self-fracture: ${seq}`);
  assert.ok(seq.includes("chaos-loop") && /slam-suffix-.*-catalysing/.test(seq), `then the curated Chaos loop and catalysed suffix slams: ${seq}`);
  assert.match(p.steps[0]!.instructions[0]!.do, /with FRACTURED Adds \(21-24\) to \(32-37\) Cold damage to Attacks/);
  assert.deepEqual(rejectedRules(cat, { ...req, start: { kind: "bought", carried: [{ ref: 0, fractured: true }, { ref: 2, fractured: false }], askDiv: null } }), ["start"], "a fractured base carries one wanted mod");
  assert.deepEqual(rejectedRules(cat, { ...req, start: { kind: "bought", carried: [{ ref: 2, fractured: false }, { ref: 3, fractured: false }], askDiv: null } }), ["start"], "a magic base holds one suffix");
  assert.deepEqual(rejectedRules(cat, { ...req, start: { kind: "bought", carried: [{ ref: 9, fractured: true }], askDiv: null } }), ["start"], "a carried mod must be a target");
  // a magic base that already carries both wanted mods (one per side) is the whole plan
  const both: PlanRequest = { ...ring(undefined, [target("IncreasedMana", "prefix", "IncreasedMana12"), target("FireResistance", "suffix", "FireResist7")]), base: "Ruby Ring" };
  const magic = planOf(cat, { ...both, start: { kind: "bought", carried: [{ ref: 0, fractured: false }, { ref: 1, fractured: false }], askDiv: 2 } });
  assert.deepEqual(magic.steps.map((s) => s.method), ["acquire-bought-magic"]);
  assert.match(magic.steps[0]!.instructions[0]!.do, /^Buy a magic Ruby Ring, item level 82\+, with \+\(165-179\) to maximum Mana and \+\(36-40\)% to Fire Resistance and no other mod\.$/);
  assert.deepEqual(magic.totalsWithBase!.div, { point: 2, low: 2, high: 2 }, "the magic base's 2 div is the total");
}

/** Quality ordering: the catalyst goes on while the Breach essence mod raises the cap, the strip comes last, and no Catalysing slam follows. */
function testQualityOrder(cat: CraftCatalog): void {
  const p = planOf(cat, OWNER_POOL_RING({ kind: "clean" }, { catalyst: "reaver-catalyst", pct: 60 }));
  const i = p.steps.findIndex((s) => s.method.startsWith("breach-quality"));
  assert.ok(i >= 0, `60% needs the Breach essence: ${methods(p)}`);
  const ins = p.steps[i]!.instructions.map((x) => x.do);
  const cat60 = ins.findIndex((d) => /Reaver Catalyst → quality to 60%/.test(d));
  const strip = ins.findIndex((d) => /removes the "\+20% to Maximum Quality" mod/.test(d));
  assert.ok(cat60 >= 0 && strip > cat60, "the final catalyst before the Essence of the Breach mod is stripped");
  assert.ok(!p.steps.slice(i + 1).some((s) => /-catalysing$/.test(s.method)), "no Catalysing slam after the final quality");
  assert.equal(p.steps.at(-1)!.after.quality, 60);
  assert.equal(p.steps.at(-1)!.after.catalyst, "reaver-catalyst");
  const ctx = ctxOf(cat, OWNER_POOL_RING({ kind: "clean" }, { catalyst: "reaver-catalyst", pct: 60 }));
  assert.ok(ctx.targets[0]!.alts.length === 4 && targetAffix("prefix", 0, "explicit", 0).alt === 0);
}

/** The buy link: a pool slot is a trade2 "count ≥ 1" group, a fractured mod searches the fractured twin, a stat trade2 lacks is reported. */
function testBaseLink(cat: CraftCatalog): void {
  const s = (id: string, text: string, group: string) => ({ id, text, group });
  const idx = statCatalogs(
    [s("explicit.stat_1", "Adds # to # Cold damage to Attacks", "explicit"), s("explicit.stat_2", "Adds # to # Fire damage to Attacks", "explicit"), s("explicit.stat_3", "+#% to Fire Resistance", "explicit")],
    [s("fractured.stat_1", "Adds # to # Cold damage to Attacks", "fractured"), s("fractured.stat_2", "Adds # to # Fire damage to Attacks", "fractured")],
  );
  const link = buildBaseLink(cat, idx, "Runes of Aldur", { itemClass: "Rings", base: "Breach Ring", ilvl: 82, rarity: "Rare", carried: [{ modIds: ["AddedColdDamage9", "AddedFireDamage9", "AddedLightningDamage9"], fractured: true }] });
  const q = JSON.parse(decodeURIComponent(link.url.split("?q=")[1]!)) as { query: { stats: Array<{ type: string; value?: { min: number }; filters: Array<{ id: string; value: { min?: number } }> }>; filters: { type_filters: { filters: { rarity: { option: string }; ilvl: { min: number } } } } } };
  assert.deepEqual(q.query.stats.map((g) => [g.type, g.value?.min, g.filters.map((f) => f.id)]), [["count", 1, ["fractured.stat_1", "fractured.stat_2"]]], "any one of the flats, fractured");
  assert.equal(q.query.stats[0]!.filters[0]!.value.min, 26.5, "the minimum tier's lowest roll, averaged like trade2 reads 'Adds # to #'");
  assert.deepEqual([q.query.filters.type_filters.filters.rarity.option, q.query.filters.type_filters.filters.ilvl.min], ["rare", 82]);
  assert.deepEqual(link.unmatched, ["fractured Adds (1-4) to (60-71) Lightning damage to Attacks"], "a stat trade2 lacks is named, not dropped");
  const magic = buildBaseLink(cat, idx, "Runes of Aldur", { itemClass: "Rings", base: "Ruby Ring", ilvl: 82, rarity: "Magic", carried: [{ modIds: ["FireResist7"], fractured: false }] });
  assert.ok(magic.url.includes(encodeURIComponent('"type":"and"')) && magic.url.includes("explicit.stat_3"), "a single carried mod is a plain filter");
}

export function runPoolCases(cat: CraftCatalog): void {
  testBaseLink(cat);
  testPoolFeasibility(cat);
  testRevealModel(cat);
  testOwnerMarketCase(cat);
  testBoughtGolden(cat);
  testQualityOrder(cat);
}
