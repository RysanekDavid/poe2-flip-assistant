/* Craft › Planner UI logic that has no React in it: slot bookkeeping, the live check, the request
 * index of a slot, family names, the catalyst-override total, the plan-session id and the saved
 * session guard. Run: npm run test:tools:craft-planner */
import assert from "node:assert/strict";
import type { PlannerPool, PlanResponse } from "../../lib/tools/craftPlannerContract";
import { parseStoredScreen, serializeScreen } from "../../components/craft/guideSession";
import {
  adjustedTotal,
  carryQuality,
  emptySlots,
  genericText,
  liveCheck,
  picks,
  planSessionId,
  refitSlots,
  targetIndex,
  toRequest,
  type SlotPick,
  type Slots,
} from "../../components/craft/planner/plannerModel";

const p = (family: string, side: SlotPick["side"], minModId: string, source: SlotPick["source"] = "natural", fractured = false): SlotPick => ({ family, side, source, minModId, fractured });

const MANA = p("IncreasedMana", "prefix", "IncreasedMana12");
const ESS = p("MaximumManaIncreasePercent", "prefix", "EssenceIncreasedManaPercent1", "essence");
const FIRE = p("FireResistance", "suffix", "FireResist7");
const COLD = p("ColdResistance", "suffix", "ColdResist8");

function testSlots(): void {
  const slots: Slots = { prefix: [MANA, null, ESS], suffix: [null, FIRE, COLD] };
  assert.deepEqual(targetIndex(slots, "prefix", 0), 0);
  assert.deepEqual(targetIndex(slots, "prefix", 2), 1, "an empty slot before it does not count");
  assert.deepEqual(targetIndex(slots, "suffix", 1), 2, "suffix indices follow every filled prefix");
  assert.deepEqual(targetIndex(slots, "suffix", 2), 3);
  assert.equal(targetIndex(slots, "suffix", 0), null, "an empty slot has no target");
  assert.deepEqual(toRequest({ itemClass: "Rings", base: "Ruby Ring", ilvl: 82, slots, includeUnverified: false, quality: null }).targets.map((t) => t.minModId), [
    "IncreasedMana12",
    "EssenceIncreasedManaPercent1",
    "FireResist7",
    "ColdResist8",
  ]);
  // a Dusk Ring (4/2) → a Ruby Ring (3/3) keeps what fits, packed to the front
  const dusk: Slots = { prefix: [MANA, null, ESS, p("Life", "prefix", "IncreasedLife10")], suffix: [FIRE, COLD] };
  const ruby = refitSlots(dusk, { p: 3, s: 3 });
  assert.deepEqual(ruby.prefix, [MANA, ESS, dusk.prefix[3]]);
  assert.deepEqual(ruby.suffix, [FIRE, COLD, null]);
  assert.deepEqual(refitSlots(dusk, { p: 1, s: 5 }).prefix, [MANA], "a smaller cap drops the overflow");
  assert.equal(picks(emptySlots({ p: 2, s: 2 })).length, 0);
}

const POOL: PlannerPool = {
  kind: "pool",
  itemClass: "Rings",
  base: "Ruby Ring",
  families: [
    { family: "IncreasedMana", side: "prefix", source: "natural", faction: null, essences: [], tiers: [{ modId: "IncreasedMana11", level: 70, text: "+(150-164) to maximum Mana" }, { modId: "IncreasedMana12", level: 75, text: "+(165-179) to maximum Mana" }] },
    { family: "ColdResistance", side: "suffix", source: "natural", faction: null, essences: [], tiers: [{ modId: "ColdResist8", level: 82, text: "+(41-45)% to Cold Resistance" }] },
  ],
  bone: { id: "preserved-collarbone", label: "Preserved Collarbone", icon: null },
  patch: { data: "0.5.5b", repoe: "4.5.5.2" },
};

function testLiveCheck(): void {
  const slots: Slots = { prefix: [MANA, ESS, p("X", "prefix", "X1", "essence")], suffix: [COLD, p("D", "suffix", "D1", "desecrated", true), null] };
  const c = liveCheck(slots, { p: 3, s: 3 }, 76, POOL);
  assert.deepEqual([c.p.used, c.s.used, c.crafted, c.desecrated, c.fractured], [3, 2, 2, 1, 1]);
  assert.deepEqual(c.ilvlShort.map((x) => [x.pick.minModId, x.needs]), [["ColdResist8", 82]], "only the tier above ilvl 76 is short");
  assert.deepEqual(liveCheck(slots, { p: 3, s: 3 }, 76, null).ilvlShort, [], "no pool yet → no gate claims");
}

function testText(): void {
  assert.equal(genericText("+(165-179) to maximum Mana"), "+# to maximum Mana");
  assert.equal(genericText("Adds (6-9) to (11-15) Physical Damage to Attacks"), "Adds # to # Physical Damage to Attacks");
  assert.equal(genericText("(4-6)% increased maximum Mana"), "#% increased maximum Mana");
  assert.deepEqual(carryQuality({ catalyst: "xophs-catalyst", pct: 40 }, 20), { catalyst: "xophs-catalyst", pct: 20 }, "a lower cap clamps the goal");
  assert.equal(carryQuality({ catalyst: "xophs-catalyst", pct: 40 }, null), null, "no catalysts on this base");
}

function testTotals(): void {
  const plan = {
    totals: { div: { point: 10, low: 6, high: 20 }, exalt: null, basis: "estimate" as const },
    bill: [
      { id: "xophs-catalyst", label: "Xoph's Catalyst", group: "catalyst" as const, qty: { point: 40, low: 40, high: 40 }, unitDiv: 0.05, totalDiv: { point: 2, low: 2, high: 2 } },
      { id: "chaos", label: "Chaos Orb", group: "currency" as const, qty: { point: 200, low: 100, high: 400 }, unitDiv: 0.04, totalDiv: { point: 8, low: 4, high: 16 } },
    ],
  };
  assert.deepEqual(adjustedTotal(plan, {}), plan.totals.div);
  const t = adjustedTotal(plan, { "xophs-catalyst": 20 })!;
  assert.ok(Math.abs(t.point - 9) < 1e-9 && Math.abs(t.low - 5) < 1e-9 && Math.abs(t.high - 19) < 1e-9, "20 catalysts instead of 40 saves 1 div at every point of the band");
  assert.equal(adjustedTotal({ ...plan, totals: { ...plan.totals, div: null } }, { "xophs-catalyst": 1 }), null, "an unpriced plan stays unpriced");
}

function testSession(): void {
  const req = toRequest({ itemClass: "Rings", base: "Ruby Ring", ilvl: 82, slots: { prefix: [MANA], suffix: [FIRE] }, includeUnverified: false, quality: null });
  const guide: Pick<PlanResponse["guide"], "phases"> = { phases: [{ title: "A", steps: [{ do: "a" }] }, { title: "B", steps: [{ do: "b" }, { do: "c" }] }] };
  const id = planSessionId(req, guide);
  assert.equal(id, planSessionId(req, guide), "stable");
  assert.notEqual(id, planSessionId(req, { phases: [...guide.phases, { title: "C", steps: [{ do: "d" }] }] }), "a rewritten guide is a new session");
  assert.notEqual(id, planSessionId({ ...req, ilvl: 81 }, guide), "another request is a new session");
  const saved = serializeScreen(id, { kind: "step", idx: 2, failed: false });
  assert.deepEqual(parseStoredScreen(saved, id, 3), { ok: true, screen: { kind: "step", idx: 2, failed: false } });
  assert.deepEqual(parseStoredScreen(saved, "other", 3), { ok: true, screen: null }, "another plan's run is not restored");
  assert.equal(parseStoredScreen(saved, id, 2).ok, false, "a step past the guide's end is refused");
  assert.equal(parseStoredScreen("{oops", id, 3).ok, false, "unreadable JSON is refused, not thrown");
  assert.equal(parseStoredScreen(JSON.stringify({ key: id, screen: { kind: "step", idx: -1, failed: false } }), id, 3).ok, false, "a negative step is refused");
  assert.deepEqual(parseStoredScreen(null, id, 3), { ok: true, screen: null });
}

/** readStored over a stub localStorage: a stale step is logged and dropped, a valid one restored. */
async function testReadStored(): Promise<void> {
  const store = new Map<string, string>();
  const stub = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  Object.defineProperty(globalThis, "localStorage", { value: stub, configurable: true });
  const errors: unknown[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => void errors.push(args);
  try {
    const { readStored } = await import("../../components/craft/GuideRunner");
    store.set("craft-plan-session", serializeScreen("plan-x", { kind: "step", idx: 4, failed: true }));
    assert.deepEqual(readStored("craft-plan-session", "plan-x", 5), { kind: "step", idx: 4, failed: true });
    assert.equal(readStored("craft-plan-session", "plan-x", 4), null, "step 5 of a 4-step guide starts at the shop");
    assert.equal(errors.length, 1, "… and says why on the console");
    assert.equal(readStored("craft-plan-session", "plan-y", 5), null);
  } finally {
    console.error = realError;
  }
}

async function main(): Promise<void> {
  testSlots();
  testLiveCheck();
  testText();
  testTotals();
  testSession();
  await testReadStored();
  console.log("ALL PASS — planner UI logic: slots/targetIndex/refit, live check, family names, quality carry, catalyst-override total, session id + saved-step guard, readStored");
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
