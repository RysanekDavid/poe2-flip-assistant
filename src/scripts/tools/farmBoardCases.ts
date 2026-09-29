/* Farm board: floor / chase / chase odds / P(losing kill) / entry liquidity on a synthetic tier,
 * board ordering (mechanics first, bosses by net, partly unpriced entries last), mechanic art and
 * the /api/farm contract round-trip. Imported by testBossEv.ts. */
import assert from "node:assert/strict";
import type { PricedItem } from "../../api/types";
import { buildFarmBoard, isBossRow, isMechanicRow, mechanicIcons, netGroup, type MechanicInput } from "../../core/farm/farmBoard";
import type { FarmRank } from "../../core/farmAdvisor";
import type { BossArt } from "../../core/tools/bossEv/art";
import { bossEv } from "../../core/tools/bossEv/ev";
import { priceLookup, type PriceInputs } from "../../core/tools/bossEv/pricing";
import type { Tier } from "../../core/tools/bossEv/schema";
import { farmResponseSchema } from "../../lib/farmContract";
import type { BossView } from "../../lib/tools/bossEvContract";

export type Inputs = (overrides?: Partial<Record<string, number>>) => PriceInputs;

const ART: BossArt = new Map();

const close = (actual: number | null, expected: number, what: string): void =>
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-9, `${what}: expected ${expected}, got ${actual}`);

function testMetrics(tier: Tier, inputs: Inputs): void {
  const r = bossEv(tier, priceLookup(inputs()), ART);
  // lo ≥ 1/10: G 1 (guaranteed) + P 10×0.1 + M 2×0.25; X and Pool are unpriced and add nothing.
  close(r.floorDiv, 2.5, "floor = guaranteed + common priced lines");
  close(r.chaseDiv, 40 * 0.01, "chase = rare lines at their low end (R 1–5%)");
  close(r.chaseOneIn, 100, "chase odds = 1 / Σ known rare p (R at 1%; U has no rate)");
  // Entry 4 − guaranteed 1 = 3 uncovered: P (10, 10%), R (40, 1%), U (100, unknown → 0).
  close(r.pLosingRun, 0.9 * 0.99, "P(lose) = Π(1 − p) over priced drops ≥ the uncovered entry");
  assert.equal(r.losingRunUnknownRates, 1, "U covers the entry but has no rate");

  const covered = bossEv({ ...tier, entry: [{ itemId: "a", qty: 0.5 }] }, priceLookup(inputs()), ART);
  assert.equal(covered.pLosingRun, 0, "guaranteed loot ≥ entry → a kill never loses");

  const missing = inputs();
  (missing.ninja as Map<string, unknown>).delete("a");
  assert.equal(bossEv(tier, priceLookup(missing), ART).pLosingRun, null, "partly unpriced entry → P(lose) unknowable, not optimistic");

  const liquid = bossEv(tier, priceLookup(inputs({ b: 1.5 })), ART);
  assert.equal(liquid.entryVolume, 1 * 10, "volume of the priciest entry line (A: 2 div beats B bought at 1.5)");
  // Only U (unknown rate) could cover the entry: zero information, never a confident 100%.
  const onlyUnknown = bossEv({ ...tier, loot: tier.loot.filter((l) => l.name === "G" || l.name === "U") }, priceLookup(inputs()), ART);
  assert.equal(onlyUnknown.pLosingRun, null, "no covering drop with a known rate → P(lose) unknown");
  assert.equal(onlyUnknown.losingRunUnknownRates, 1);
  // Every drop priced and rated, none worth the uncovered entry: a loss IS certain.
  const cheap = bossEv({ ...tier, loot: tier.loot.filter((l) => l.name === "G" || l.name === "M") }, priceLookup(inputs()), ART);
  assert.equal(cheap.pLosingRun, 1, "fully priced + rated and nothing covers → a genuine 100%");
  const noChase = bossEv({ ...tier, loot: tier.loot.filter((l) => l.rate.kind !== "range") }, priceLookup(inputs()), ART);
  assert.equal(noChase.chaseOneIn, null, "no known-rate rare line → no chase odds");
  assert.equal(noChase.chaseDiv, 0);
}

export const rank = (category: string, change: number, driver: string): FarmRank => ({
  category, label: category, hint: "", signal: change >= 30 ? "HOT" : "COLD", wAvgChange7d: change, basketValueDiv: 1, itemCount: 1,
  drivers: [{ item: driver, change7d: change, valueDiv: 1, volume: 100 }],
});

export function view(id: string, tier: Tier, inputs: PriceInputs): BossView {
  return { id, name: id, mechanic: "M", accessChain: "x", icon: null, sources: [], tiers: [bossEv(tier, priceLookup(inputs), ART)] };
}

function testBoard(tier: Tier, inputs: Inputs): void {
  const snap: PricedItem[] = [{ itemId: "d1", itemName: "Driver One", category: "Abyss", baseValue: 1, volume: 100, change7d: 40, spark7d: null, icon: "https://x/d1.png" }];
  const ranks = [rank("Abyss", 40, "Driver One"), rank("Breach", 5, "Nobody")];
  const icons = mechanicIcons(ranks, snap);
  assert.deepEqual([icons.get("Abyss"), icons.get("Breach")], ["https://x/d1.png", null], "mechanic art = its top driver's icon");
  const mechanics: MechanicInput[] = ranks.map((r) => ({ ...r, icon: icons.get(r.category) ?? null }));

  const missing = inputs();
  (missing.ninja as Map<string, unknown>).delete("a");
  const rich = view("rich", { ...tier, entry: [{ itemId: "a", qty: 0.5 }] }, inputs());
  const poor = view("poor", tier, inputs());
  const partial = view("partial", tier, missing);
  // every drop priced and rated → an exact (certain) loss of 4 − (1 + 1) = 2
  const ratedLoss = view("ratedLoss", { ...tier, loot: tier.loot.filter((l) => l.name === "G" || l.name === "P") }, inputs());
  const rows = buildFarmBoard(mechanics, [poor, partial, ratedLoss, rich], 400);
  assert.deepEqual(
    rows.map((r) => (isMechanicRow(r) ? r.category : r.id)),
    ["Abyss", "Breach", "rich", "ratedLoss", "poor", "partial"],
    "mechanics by heat; bosses: sure nets, then negative lower bounds (rates unknown), then partial entries",
  );
  const bossRows = rows.filter(isBossRow);
  assert.deepEqual(bossRows.map((r) => r.netBound), ["lower", "exact", "lower", "unknown"]);
  assert.deepEqual(bossRows.map(netGroup), [0, 0, 1, 2]);
  assert.equal(bossRows[2]!.uncountedDrops, 3, "U (no rate), X and Pool (no price) are left out of EV");
  assert.ok(bossRows[2]!.netDiv < 0 && netGroup(bossRows[2]!) === 1, "a negative lower bound is not ranked as a sure loss");
  assert.equal(bossRows[3]!.entryComplete, false);
  assert.equal(bossRows[0]!.unpricedLineage, 0);
  assert.equal(bossRows[0]!.confidence, "unverified", "EV carried by an unverified range line → weakest label");
  farmResponseSchema.parse({
    computedLeague: "L", mechanics: rows.filter(isMechanicRow), bosses: bossRows, details: [rich, poor, partial], rates: null,
    pricesFetchedAt: null, scoutAgeHours: null, dataAsOf: "2026-09-29", patch: "0.5.5", patchWarning: null,
  });
}

/**
 * Confidence-aware ranking, a guaranteed-only 0% P(lose) that inherits its data's confidence, the
 * floor's drop list, and an unmodelled entry cost (a Stronghold's waystones) making net an upper bound.
 */
function testConfidenceAndUnmodelled(tier: Tier, inputs: Inputs): void {
  const G = tier.loot.find((l) => l.name === "G")!;
  const sure: Tier = { ...tier, entry: [{ itemId: "a", qty: 0.5 }], loot: [G] };
  const single = view("single", { ...sure, loot: [{ ...G, confidence: "single-source" }] }, inputs({ g: 3 }));
  const confirmed = view("confirmed", sure, inputs());
  const r = single.tiers[0]!;
  assert.deepEqual([r.pLosingRun, r.losingRunConfidence], [0, "single-source"], "a 0% resting on one guide's guaranteed drop says so");
  assert.deepEqual(r.floorDrops.map((d) => [d.name, d.evDiv]), [["G", 3]], "the floor lists the drops it sums");
  const rows = buildFarmBoard([], [single, confirmed], 400).filter(isBossRow);
  assert.deepEqual(rows.map((x) => x.id), ["confirmed", "single"], "a confirmed exact net outranks a bigger single-source one");
  const stronghold = view("stronghold", { ...sure, unmodelledEntry: { label: "N× Waystone", note: "maps" } }, inputs());
  const row = buildFarmBoard([], [stronghold], 400).filter(isBossRow)[0]!;
  assert.deepEqual([row.netBound, netGroup(row), row.unmodelledEntry?.label], ["upper", 2, "N× Waystone"], "an unmodelled entry cost makes net an upper bound, ranked last");
  assert.match(row.headline.text, /^upper bound — entry leaves out N× Waystone/, "no 'guaranteed loot covers entry' verdict on a partial entry");
}

export function runFarmBoardCases(tier: Tier, inputs: Inputs): void {
  testMetrics(tier, inputs);
  testBoard(tier, inputs);
  testConfidenceAndUnmodelled(tier, inputs);
}
