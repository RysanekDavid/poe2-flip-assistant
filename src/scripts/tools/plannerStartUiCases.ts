/* Planner UI model for mod pools and the start choice (no React): the requests "Plan it" sends in
 * each start mode, pool slots and their request indices, pool mode on/off, the live check with pools,
 * the bought base's total and its trade-search body. Imported by testPlannerUi.ts. */
import assert from "node:assert/strict";
import { liveCheck, NO_POOLS, type PlannerInput, type SlotPick } from "../../components/craft/planner/plannerModel";
import { baseLinkRequest, carriedRef, compactNames, DEFAULT_START, poolFromSide, poolProblems, poolSlot0, requestsFor, totalWithBase, withPool } from "../../components/craft/planner/plannerStartModel";
import type { PlanResponse } from "../../lib/tools/craftPlannerContract";

const p = (family: string, side: SlotPick["side"], minModId: string, source: SlotPick["source"] = "natural"): SlotPick => ({ family, side, source, minModId, fractured: false });
const COLD = p("ColdDamage", "prefix", "AddedColdDamage7");
const FIRE = p("FireDamage", "prefix", "AddedFireDamage7");
const LIGHT = p("LightningDamage", "prefix", "AddedLightningDamage7");
const RARITY = p("ItemFoundRarityIncrease", "suffix", "ItemFoundRarityIncrease3");

const ring = (patch: Partial<PlannerInput> = {}): PlannerInput => ({
  itemClass: "Rings",
  base: "Breach Ring",
  ilvl: 82,
  slots: { prefix: [COLD, FIRE, null], suffix: [RARITY, null, null] },
  includeUnverified: false,
  quality: null,
  pools: NO_POOLS,
  start: DEFAULT_START,
  ...patch,
});

function testPoolMode(): void {
  const on = withPool(ring(), "prefix", poolFromSide(ring().slots, "prefix"), 3);
  assert.deepEqual(on.pools.prefix, { candidates: [COLD, FIRE], need: 2 }, "pool mode moves the side's ordinary picks in, needing as many");
  assert.deepEqual(on.slots.prefix, [null], "one single-mod prefix slot is left (cap 3 − need 2)");
  const grown = withPool(on, "prefix", { candidates: [COLD, FIRE, LIGHT], need: 3 }, 3);
  assert.deepEqual(grown.slots.prefix, [], "need 3 takes every prefix slot");
  const off = withPool(grown, "prefix", null, 3);
  assert.deepEqual([off.pools.prefix, off.slots.prefix], [null, [null, null, null]], "pool off: three empty slots again");
  assert.deepEqual(poolProblems({ prefix: { candidates: [COLD], need: 1 }, suffix: null }), ["the prefix pool needs at least two mods"]);
  const c = liveCheck(grown.slots, { p: 3, s: 3 }, 50, null, grown.pools);
  assert.deepEqual([c.p.used, c.s.used], [3, 1], "pool slots count toward the side");
}

function testRequests(): void {
  const input = withPool(ring(), "prefix", { candidates: [COLD, FIRE, LIGHT], need: 2 }, 3);
  const cmp = requestsFor(input);
  assert.deepEqual(cmp.primary.targets.map((t) => t.minModId), ["ItemFoundRarityIncrease3"], "the single rarity stays a target");
  assert.deepEqual(cmp.primary.groups, [{ side: "prefix", need: 2, candidates: [COLD, FIRE, LIGHT].map((x) => ({ family: x.family, minModId: x.minModId })) }]);
  assert.equal(cmp.primary.start, undefined, "comparing: the primary plan starts clean");
  assert.deepEqual(cmp.bought?.start, { kind: "bought", carried: null, askDiv: null }, "…and the bought one lets the planner pick (no price sent)");
  assert.equal(requestsFor({ ...input, start: { ...DEFAULT_START, mode: "clean" } }).bought, null);
  assert.equal(poolSlot0(input.slots, input.pools, "prefix"), 1, "pool slots come after the single targets");
  const bought = { ...input, start: { mode: "bought" as const, carried: [{ kind: "pool" as const, side: "prefix" as const }], fractured: true, askDiv: 70 } };
  assert.deepEqual(requestsFor(bought).primary.start, { kind: "bought", carried: [{ ref: 1, fractured: true }], askDiv: null }, "a carried pool = its first slot");
  assert.equal(carriedRef(input.slots, input.pools, { kind: "slot", side: "suffix", slot: 1 }), null, "an empty slot carries nothing");
}

function testTotals(): void {
  const plan = {
    totals: { div: { point: 40, low: 20, high: 90 }, exalt: null, basis: "estimate" as const },
    start: { kind: "bought" as const, rarity: "Rare" as const, carried: [{ ref: 0, fractured: true, modIds: ["AddedColdDamage7", "AddedFireDamage7"], text: "any of: …" }], askDiv: null, buys: { point: 1, low: 1, high: 1 } },
    base: { name: "Breach Ring", itemClass: "Rings" as const, ilvl: 82 },
  };
  assert.deepEqual(totalWithBase(plan, 65), { point: 105, low: 85, high: 155 });
  assert.equal(totalWithBase(plan, null), null, "no price: the total waits for it");
  assert.equal(totalWithBase({ ...plan, start: { kind: "clean" } }, 65), null);
  assert.deepEqual(baseLinkRequest(plan as unknown as PlanResponse), { itemClass: "Rings", base: "Breach Ring", ilvl: 82, rarity: "Rare", carried: [{ modIds: ["AddedColdDamage7", "AddedFireDamage7"], fractured: true }] });
}

function testNames(): void {
  assert.equal(compactNames(["Adds # to # Cold damage to Attacks", "Adds # to # Fire damage to Attacks", "Adds # to # Physical Damage to Attacks"]), "Adds # to # Cold · Fire · Physical damage to Attacks");
  assert.equal(compactNames(["+#% to Fire Resistance", "+#% to all Elemental Resistances"]), "+#% to Fire Resistance · all Elemental Resistances");
  assert.equal(compactNames(["+# to Strength", "#% increased Rarity of Items found"]), "+# to Strength · #% increased Rarity of Items found");
}

export function runStartUiCases(): void {
  testNames();
  testPoolMode();
  testRequests();
  testTotals();
}
