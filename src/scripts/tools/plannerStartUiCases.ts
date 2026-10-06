/* Planner UI model for mod pools and the start choice (no React): the requests "Plan it" sends in
 * each start mode, pool slots and their request indices, pool mode on/off, the live check with pools,
 * the bought base's total and its trade-search body. Imported by testPlannerUi.ts. */
import assert from "node:assert/strict";
import { liveCheck, NO_POOLS, type PlannerInput, type SlotPick } from "../../components/craft/planner/plannerModel";
import { withAlternative } from "../../components/craft/planner/alternativesModel";
import {
  baseLinkRequest,
  CARRIED_CLEARED_NOTE,
  carriedRef,
  cheaperPlan,
  compactNames,
  DEFAULT_START,
  poolFromSide,
  poolProblems,
  poolSlot0,
  requestsFor,
  totalWithBase,
  withPool,
  withSlots,
} from "../../components/craft/planner/plannerStartModel";
import type { AlternativeView, PlanResponse } from "../../lib/tools/craftPlannerContract";

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
  const bought = { ...input, start: { mode: "bought" as const, carried: [{ kind: "pool" as const, side: "prefix" as const }], fractured: true, askDiv: 70, note: null } };
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

/** A carried chip whose slot empties or takes another mod is dropped with a note; a tier change keeps it. */
function testStaleCarried(): void {
  const start = { ...DEFAULT_START, mode: "bought" as const, fractured: false, carried: [{ kind: "slot" as const, side: "prefix" as const, slot: 0 }, { kind: "slot" as const, side: "suffix" as const, slot: 0 }] };
  const input = ring({ start });
  const emptied = withSlots(input, { ...input.slots, prefix: [null, FIRE, null] });
  assert.deepEqual(emptied.start.carried, [start.carried[1]], "the emptied slot's chip goes");
  assert.equal(emptied.start.note, CARRIED_CLEARED_NOTE, "…and the player is told");
  assert.deepEqual(requestsFor(emptied).primary.start, { kind: "bought", carried: [{ ref: 1, fractured: false }], askDiv: null }, "the remaining chip still reaches the server");
  const swapped = withSlots(input, { ...input.slots, prefix: [LIGHT, FIRE, null] });
  assert.deepEqual(swapped.start.carried, [start.carried[1]], "another mod in the slot is not the carried one");
  const tier = withSlots(input, { ...input.slots, prefix: [{ ...COLD, minModId: "AddedColdDamage6" }, FIRE, null] });
  assert.equal(tier.start, input.start, "a tier change keeps the chip, no note");
  const alt: AlternativeView = {
    changes: [{ kind: "drop", target: 0, side: "prefix", family: COLD.family, from: { modId: COLD.minModId, text: "Adds # to # Cold damage to Attacks", level: 60, k: 7, n: 9 } }],
    targets: [FIRE, RARITY].map((x) => ({ family: x.family, side: x.side, minModId: x.minModId, fractured: false })),
    totals: { div: null, basis: "estimate" },
    impractical: false,
  };
  const next = withAlternative(input, alt);
  assert.deepEqual([next.start.carried, next.start.note], [[start.carried[1]], CARRIED_CLEARED_NOTE], "a cheaper-targets chip that drops the carried mod clears its pick");
  assert.deepEqual(requestsFor(next).primary.start, { kind: "bought", carried: [{ ref: 1, fractured: false }], askDiv: null }, "rarity is now target 1");
}

/** The "cheaper" badge only compares totals that both count the base. */
function testCheaperBadge(): void {
  const totals = (point: number) => ({ div: { point, low: point, high: point }, exalt: null, basis: "estimate" as const });
  const bought = (point: number) => ({ totals: totals(point), start: { kind: "bought" as const, rarity: "Rare" as const, carried: [], askDiv: null, buys: { point: 1, low: 1, high: 1 } } });
  const clean = { totals: totals(10), start: { kind: "clean" as const } };
  assert.equal(cheaperPlan(clean, bought(5), 100), null, "a clean total without its base is no match for one with it");
  assert.equal(cheaperPlan(clean, bought(5), null), null);
  assert.equal(cheaperPlan(bought(30), bought(5), 10), "bought", "both with the base: the cheaper wins");
  assert.equal(cheaperPlan(bought(5), bought(5), 10), null, "a tie earns no badge");
  assert.equal(cheaperPlan(bought(30), bought(5), null), null, "no price: neither total is whole");
}

export function runStartUiCases(): void {
  testStaleCarried();
  testCheaperBadge();
  testNames();
  testPoolMode();
  testRequests();
  testTotals();
}
