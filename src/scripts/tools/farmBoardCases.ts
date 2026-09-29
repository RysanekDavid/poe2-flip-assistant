/* Farm board: floor / chase / chase odds / P(losing kill) / entry liquidity on a synthetic tier,
 * board ordering (mechanics first, bosses by net, partly unpriced entries last), mechanic art and
 * the /api/farm contract round-trip. Imported by testBossEv.ts. */
import assert from "node:assert/strict";
import type { PricedItem } from "../../api/types";
import { buildFarmBoard, isBossRow, isMechanicRow, mechanicIcons, type MechanicInput } from "../../core/farm/farmBoard";
import type { FarmRank } from "../../core/farmAdvisor";
import { bossEv } from "../../core/tools/bossEv/ev";
import { priceLookup, type PriceInputs } from "../../core/tools/bossEv/pricing";
import type { Tier } from "../../core/tools/bossEv/schema";
import { farmResponseSchema } from "../../lib/farmContract";
import type { BossView } from "../../lib/tools/bossEvContract";

type Inputs = (overrides?: Partial<Record<string, number>>) => PriceInputs;

const close = (actual: number | null, expected: number, what: string): void =>
  assert.ok(actual != null && Math.abs(actual - expected) < 1e-9, `${what}: expected ${expected}, got ${actual}`);

function testMetrics(tier: Tier, inputs: Inputs): void {
  const r = bossEv(tier, priceLookup(inputs()));
  // lo ≥ 1/10: G 1 (guaranteed) + P 10×0.1 + M 2×0.25; X and Pool are unpriced and add nothing.
  close(r.floorDiv, 2.5, "floor = guaranteed + common priced lines");
  close(r.chaseDiv, 40 * 0.01, "chase = rare lines at their low end (R 1–5%)");
  close(r.chaseOneIn, 100, "chase odds = 1 / Σ known rare p (R at 1%; U has no rate)");
  // Entry 4 − guaranteed 1 = 3 uncovered: P (10, 10%), R (40, 1%), U (100, unknown → 0).
  close(r.pLosingRun, 0.9 * 0.99, "P(lose) = Π(1 − p) over priced drops ≥ the uncovered entry");
  assert.equal(r.losingRunUnknownRates, 1, "U covers the entry but has no rate");

  const covered = bossEv({ ...tier, entry: [{ itemId: "a", qty: 0.5 }] }, priceLookup(inputs()));
  assert.equal(covered.pLosingRun, 0, "guaranteed loot ≥ entry → a kill never loses");

  const missing = inputs();
  (missing.ninja as Map<string, unknown>).delete("a");
  assert.equal(bossEv(tier, priceLookup(missing)).pLosingRun, null, "partly unpriced entry → P(lose) unknowable, not optimistic");

  const liquid = bossEv(tier, priceLookup(inputs({ b: 1.5 })));
  assert.equal(liquid.entryVolume, 1 * 10, "volume of the priciest entry line (A: 2 div beats B bought at 1.5)");
  const noChase = bossEv({ ...tier, loot: tier.loot.filter((l) => l.rate.kind !== "range") }, priceLookup(inputs()));
  assert.equal(noChase.chaseOneIn, null, "no known-rate rare line → no chase odds");
  assert.equal(noChase.chaseDiv, 0);
}

const rank = (category: string, change: number, driver: string): FarmRank => ({
  category, label: category, hint: "", signal: change >= 30 ? "HOT" : "COLD", wAvgChange7d: change, basketValueDiv: 1, itemCount: 1,
  drivers: [{ item: driver, change7d: change, valueDiv: 1, volume: 100 }],
});

function view(id: string, tier: Tier, inputs: PriceInputs): BossView {
  return { id, name: id, mechanic: "M", accessChain: "x", icon: null, sources: [], tiers: [bossEv(tier, priceLookup(inputs))] };
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
  const rows = buildFarmBoard(mechanics, [poor, partial, rich], 400);
  assert.deepEqual(rows.map((r) => (isMechanicRow(r) ? r.category : r.id)), ["Abyss", "Breach", "rich", "poor", "partial"], "mechanics by heat, bosses by net, partial entry last");
  const bossRows = rows.filter(isBossRow);
  assert.ok(bossRows[0]!.netDiv > bossRows[1]!.netDiv);
  assert.equal(bossRows[2]!.entryComplete, false);
  assert.equal(bossRows[0]!.unpricedLineage, 0);
  assert.equal(bossRows[0]!.confidence, "unverified", "EV carried by an unverified range line → weakest label");
  farmResponseSchema.parse({
    computedLeague: "L", mechanics: rows.filter(isMechanicRow), bosses: bossRows, details: [rich, poor, partial], rates: null,
    pricesFetchedAt: null, scoutAgeHours: null, dataAsOf: "2026-09-29", patch: "0.5.5", patchWarning: null,
  });
}

export function runFarmBoardCases(tier: Tier, inputs: Inputs): void {
  testMetrics(tier, inputs);
  testBoard(tier, inputs);
}
