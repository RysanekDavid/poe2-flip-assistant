/* GGG currency-exchange market model, guards, fees, persistence and item mapping — PURE parts.
 * Run: npm run test:cx (src/scripts/runWithTestEnv.ts sets DB_PATH). NO NETWORK.
 * The storage/ingest half lives in testCxHistory.ts (same runner target). */
import assert from "node:assert/strict";
import { CX_HOUR_SECONDS } from "../api/cxClient";
import { goldFeeFor, goldToDivine, sumLegFees } from "../core/cx/cxFees";
import { hourEdges, itemHour } from "../core/cx/cxEdges";
import { baseMarkets, gridStepPct, hourRates, quotesByItem } from "../core/cx/cxMarketModel";
import { aggregateItem, median } from "../core/cx/cxPersistence";
import { mapToItemIds, statsFromRows } from "../core/cx/cxItemMarkets";
import { toMarketRow } from "../core/cx/cxIngest";
import {
  CHAOS_PER_DIV,
  EX_PER_DIV,
  FR,
  H0,
  IDS,
  PARAMS,
  REAL_DIGEST,
  crossMarkets,
  persistentAndSpikeRows,
  rowsOf,
  digestAt,
  implausibleMarkets,
  market,
  near,
  omenMarkets,
  simulacrumMarkets,
  subExaltMarkets,
  thinRibMarkets,
  TEST_NAMES,
} from "./cxTestFixtures";
import { runCxProbeTests } from "./testCxProbes";
import { runCxRouteTests } from "./testCxRoutes";

const GOLD = PARAMS.goldPerExalt;

export function runCxModelTests(): void {
  testRowsNormalizeAndExactIds();
  testHourRatesAndGrid();
  testValidCrossEdge();
  testGuards();
  testBandEdgesAreGatedOff();
  testGreaterExaltedIsNotExalted();
  testFeeTable();
  testPersistenceAndSpikes();
  testMappingIsExactAndCounted();
  runCxProbeTests();
  runCxRouteTests();
  console.log("  ok — model, guards, fees, persistence, review probes A–C, routes, mapping");
}

const edgesAt = (extra: Parameters<typeof digestAt>[1], p = PARAMS) => hourEdges(H0, rowsOf(H0, digestAt(H0, extra).markets), p);

function testRowsNormalizeAndExactIds(): void {
  const [row] = rowsOf(H0, omenMarkets());
  assert.ok(row);
  // quote was listed first by GGG; storage orders by id so one market is always one key
  assert.ok(row.item_a < row.item_b);
  assert.equal(row.item_a, IDS.divine);
  assert.equal(row.volume_a, 8400);
  assert.equal(row.volume_b, 1000);
  assert.equal(row.low_stock_b, 10);
  assert.equal(toMarketRow({ ...omenMarkets()[0]!, volume_traded: {} }, H0), null);
}

function testHourRatesAndGrid(): void {
  const rates = hourRates(baseMarkets(rowsOf(H0)));
  assert.ok(near(rates.exaltPerDivine, EX_PER_DIV));
  assert.ok(near(rates.chaosPerDivine, CHAOS_PER_DIV));
  // N:1 grid: 150 → ~0.67%, 2 (1:2 vs 1:1 / 1:3) → 50%, and the mirror side below 1
  assert.ok(near(gridStepPct(150), 100 / 150));
  assert.equal(gridStepPct(2), 50);
  assert.equal(gridStepPct(0.5), 50);
  assert.equal(gridStepPct(1), 100);
}

function testValidCrossEdge(): void {
  const edge = edgesAt(simulacrumMarkets(12)).get(IDS.simulacrum)?.edge;
  assert.ok(edge, "40 Div item, 100–200 units/h, 12% gap → a real edge");
  assert.equal(edge.kind, "cross");
  assert.ok(near(edge.buy.priceDiv, 40));
  const sellEx = Math.round(100 * 40 * 1.12 * EX_PER_DIV) / 100;
  assert.ok(near(edge.sell.priceQuote, sellEx));
  const feeDiv = (sellEx * 120) / (GOLD * EX_PER_DIV); // selling requests the Ex, 120 gold each
  assert.ok(near(edge.feeDivPerUnit, feeDiv));
  assert.ok(near(edge.netPct, ((sellEx / EX_PER_DIV - 40 - feeDiv) / 40) * 100));
  assert.equal(edge.feeComplete, false, "Simulacrum's own fee is not in the table");
  assert.equal(edge.slowerUnits, 100);
}

function testGuards(): void {
  const all = edgesAt([...thinRibMarkets(), ...omenMarkets(), ...subExaltMarkets(), ...implausibleMarkets()]);
  // The live failure: 3 ribs at 1:1 Ex vs 1000 ribs for 1 Div read "+127%" — both legs are thin.
  const rib = all.get(IDS.preservedRib);
  assert.equal(rib?.edge, null);
  assert.equal(rib?.issue, "thin");
  // 8.4 Div fills only at 8:1 / 9:1 — an 11.9% grid, over the 10% leg limit: not even quotable.
  const omen = all.get(IDS.omenOfLight);
  assert.equal(omen?.edge, null);
  assert.equal(omen?.issue, "coarse");
  // Quotable legs (40 Div → 2.5% grid) but a 4% gap is inside 2 × the combined grid.
  const narrow = edgesAt(crossMarkets(IDS.simulacrum, 40, 4)).get(IDS.simulacrum);
  assert.equal(narrow?.issue, "coarse");
  assert.ok(narrow?.rawNetPct != null && narrow.rawNetPct > 0, "the rejected number stays visible for the tooltip");
  // Liquid and fine-grained, but worth < 1 Ex with an unknown per-item gold fee.
  assert.equal(all.get(IDS.gnawedRib)?.issue, "fee-unknown");
  // Liquid, fine-grained, +80%: never a real edge.
  const vaal = all.get(IDS.vaalSiphoner);
  assert.equal(vaal?.issue, "implausible");
  assert.ok(vaal?.rawNetPct != null && vaal.rawNetPct > PARAMS.maxPlausibleEdgePct);
  // The base currencies' own triangles are inside their ratio grids too.
  for (const id of [IDS.chaos, IDS.exalted, IDS.divine]) assert.equal(all.get(id)?.issue, "coarse", id);
  // Quotes carry their own leg verdicts.
  const rates = hourRates(baseMarkets(rowsOf(H0)));
  const ribQuotes = quotesByItem(rowsOf(H0, thinRibMarkets()), rates, PARAMS).get(IDS.preservedRib) ?? [];
  assert.deepEqual(ribQuotes.map((q) => q.issue), ["thin", "thin"]);
  const twoEx = quotesByItem(rowsOf(H0, [market(FR, IDS.kulemak, IDS.exalted, 5000, 10000)]), rates, PARAMS);
  assert.equal(twoEx.get(IDS.kulemak)?.[0]?.issue, "coarse", "2 Ex each: 1:1 / 1:2 / 1:3 grid");
}

function testBandEdgesAreGatedOff(): void {
  const single = [market(FR, IDS.kulemak, IDS.divine, 200, 8000, { low: [1, 36], high: [1, 44] })];
  assert.equal(edgesAt(single).get(IDS.kulemak)?.issue, "single-market", "ratio extremes are not fills — off by default");
  const on = edgesAt(single, { ...PARAMS, bandEdges: true }).get(IDS.kulemak)?.edge;
  assert.ok(on);
  assert.equal(on.kind, "band");
  // half the tighter side (4 of 40) each way → 38 / 42 Div
  assert.ok(near(on.buy.priceDiv, 38));
  assert.ok(near(on.sell.priceDiv, 42));
}

function testGreaterExaltedIsNotExalted(): void {
  const markets = REAL_DIGEST.markets.map((m) =>
    m.league === FR && m.market_pair.includes(IDS.exalted) && m.market_pair.includes(IDS.divine)
      ? market(FR, IDS.greaterExalted, IDS.divine, 1000, 50)
      : m,
  );
  const rows = rowsOf(H0, [...markets, ...simulacrumMarkets(12)]);
  const rates = hourRates(baseMarkets(rows));
  assert.equal(rates.exaltPerDivine, null, "only the GREATER Exalt traded against Div");
  assert.ok(near(quotesByItem(rows, rates, PARAMS).get(IDS.greaterExalted)?.[0]?.priceDiv, 0.05), "priced as an item");
  assert.equal(goldFeeFor(IDS.greaterExalted, 1), null, "its fee is unknown, never the Exalt's 120");
  // No Ex/Div rate → no Ex quote at all → Simulacrum has only its Div market left.
  assert.equal(hourEdges(H0, rows, PARAMS).get(IDS.simulacrum)?.issue, "single-market");
}

function testFeeTable(): void {
  assert.equal(goldFeeFor(IDS.exalted, 10), 1200);
  assert.equal(goldFeeFor(IDS.chaos, 2), 320);
  assert.equal(goldFeeFor(IDS.divine, 1.5), 1200);
  assert.equal(goldFeeFor(IDS.omenOfLight, 1), null);
  assert.deepEqual(sumLegFees([{ baseId: IDS.divine, units: 1 }, { baseId: IDS.omenOfLight, units: 1 }]), {
    knownGold: 800,
    complete: false,
  });
  assert.ok(near(goldToDivine(800, 400, 5000), 800 / 2_000_000));
  assert.equal(goldToDivine(800, null, 5000), null);
  assert.equal(goldToDivine(800, 400, 0), null);
}

function testPersistenceAndSpikes(): void {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  const stats = statsFromRows(persistentAndSpikeRows(), H0, PARAMS, 5);
  const sim = stats.get(IDS.simulacrum)?.edge;
  assert.ok(sim);
  assert.equal(sim.persistence6, 5, "the 0% hour fails the grid guard → a miss, not a hit");
  assert.equal(sim.validHours6, 5);
  assert.equal(sim.legsHour, H0, "legs come from the newest valid hour");
  assert.ok(near(sim.slowerUnitsPerHour, (5 * 100) / 6), "the invalid hour counts as zero flow");
  // One valid print in six hours is not a market: no edge at all (probe C).
  const kul = stats.get(IDS.kulemak);
  assert.equal(kul?.edge, null);
  assert.equal(kul?.issue, "sporadic");
  assert.equal(stats.get(IDS.vaalSiphoner)?.issue, "implausible");
  const rib = stats.get(IDS.preservedRib);
  assert.ok(rib != null && rib.edge == null, "six hours of a thin +127% never become an edge");
  assert.equal(rib.issue, "thin");
  const later = statsFromRows(persistentAndSpikeRows(), H0 + 6 * CX_HOUR_SECONDS, PARAMS, 5);
  assert.equal(later.get(IDS.kulemak), undefined, "no trade inside the 6h window → no current market");
  assert.equal(aggregateItem([], H0, 5), null);
  const lone = itemHour(IDS.kulemak, H0, [], hourRates(baseMarkets(rowsOf(H0))), PARAMS);
  assert.equal(lone, null);
}

function testMappingIsExactAndCounted(): void {
  const stats = statsFromRows(persistentAndSpikeRows(), H0, PARAMS, 5);
  const names = new Map(TEST_NAMES);
  names.delete(IDS.exalted); // unnamed
  // A name two exchange ids share ANYWHERE in cx_items is ambiguous, even if only one trades now.
  names.set("Metadata/Items/QuestItems/Abyss/AbyssPinnacleKeyQuest", "Kulemak's Invitation");
  const ninja = [
    { itemId: "simulacrum", itemName: "Simulacrum" },
    { itemId: "kulemaks-invitation", itemName: "Kulemak's Invitation" },
    { itemId: "chaos", itemName: "Chaos Orb" },
    { itemId: "chaos-orb-typo", itemName: "chaos orb" }, // case differs: no fuzzy match
  ];
  const { byItemId, coverage } = mapToItemIds(stats, names, ninja);
  assert.deepEqual([...byItemId.keys()].sort(), ["chaos", "simulacrum"]);
  assert.equal(coverage.unnamed, 1);
  assert.equal(coverage.ambiguous, 1);
  assert.equal(coverage.mapped, 2);
  assert.equal(coverage.unmatched, coverage.cxItems - coverage.unnamed - coverage.ambiguous - coverage.mapped);
}
