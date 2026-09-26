/* GGG currency-exchange market model, fees, persistence and item mapping — PURE parts.
 * Run: npm run test:cx (src/scripts/runWithTestEnv.ts sets DB_PATH). NO NETWORK.
 * The storage/ingest half lives in testCxHistory.ts (same runner target). */
import assert from "node:assert/strict";
import { CX_HOUR_SECONDS } from "../api/cxClient";
import { config } from "../config/env";
import { goldFeeFor, goldToDivine, sumLegFees } from "../core/cx/cxFees";
import { hourEdges, hourRates, itemHourEdge, quotesByItem } from "../core/cx/cxMarketModel";
import { aggregateItem, median } from "../core/cx/cxPersistence";
import { mapToItemIds, statsFromRows } from "../core/cx/cxItemMarkets";
import { toMarketRow } from "../core/cx/cxIngest";
import { hourRoutes, persistentRoutes } from "../core/cx/cxRoutes";
import { resolveBaseItemNames } from "../core/cx/repoeNames";
import type { CxMarketRow } from "../db/cxMarketQueries";
import {
  CHAOS_PER_DIV,
  EX_PER_DIV,
  FR,
  H0,
  IDS,
  REAL_DIGEST,
  digestAt,
  hourId,
  market,
  near,
  omenMarkets,
  simulacrumMarkets,
  TEST_NAMES,
} from "./cxTestFixtures";

const GOLD = config.cx.goldPerExalt;

export function runCxModelTests(): void {
  testRowsNormalizeAndExactIds();
  testHourRatesFromRealFixture();
  testOmenVwapBandAndEdge();
  testTriangleFeesAndCompleteness();
  testGreaterExaltedIsNotExalted();
  testFeeTable();
  testPersistenceAndSpikes();
  testClosedRoutes();
  testMappingIsExactAndCounted();
  testRepoeCatalogNames();
  console.log("  ok — model, fees, persistence, routes, mapping");
}

function rowsOf(id: number, markets = REAL_DIGEST.markets, league = FR): CxMarketRow[] {
  return markets
    .filter((m) => m.league === league)
    .map((m) => toMarketRow(m, id))
    .filter((r): r is CxMarketRow => r != null);
}

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

function testHourRatesFromRealFixture(): void {
  const rates = hourRates(rowsOf(H0));
  assert.ok(near(rates.exaltPerDivine, EX_PER_DIV));
  assert.ok(near(rates.chaosPerDivine, CHAOS_PER_DIV));
}

function testOmenVwapBandAndEdge(): void {
  const rows = rowsOf(H0, [...REAL_DIGEST.markets, ...omenMarkets()]);
  const quotes = quotesByItem(rows, hourRates(rows)).get(IDS.omenOfLight) ?? [];
  const div = quotes.find((q) => q.quote === IDS.divine);
  const ex = quotes.find((q) => q.quote === IDS.exalted);
  assert.ok(div && ex);
  assert.ok(near(div.priceDiv, 8.4));
  assert.equal(div.lowQuote, 8);
  assert.equal(div.highQuote, 9);
  assert.ok(near(ex.priceQuote, 3920));
  assert.ok(near(ex.priceDiv, 3920 / EX_PER_DIV));
  assert.equal(ex.lowQuote, null, "no ratios published → no band");

  const edge = hourEdges(H0, rows, GOLD).get(IDS.omenOfLight);
  assert.ok(edge);
  // band beats cross here: tighter side = 1 − 8/8.4 (0.4 Div), half of it captured → 8.2 / 8.6
  assert.equal(edge.kind, "band");
  assert.ok(near(edge.buy.priceDiv, 8.2));
  assert.ok(near(edge.sell.priceDiv, 8.6));
  const feeDiv = (8.6 * 800) / (GOLD * EX_PER_DIV); // selling requests 8.6 Div at 800 gold each
  assert.ok(near(edge.feeDivPerUnit, feeDiv));
  assert.ok(near(edge.netPct, ((0.4 - feeDiv) / 8.2) * 100));
  const crossNet = ((3920 / EX_PER_DIV - 8.4 - (3920 * 120) / (GOLD * EX_PER_DIV)) / 8.4) * 100;
  assert.ok(edge.netPct > crossNet, "the better of the two edges is kept");
  assert.equal(edge.feeComplete, false, "Omen of Light's own fee is not in the table");
  assert.equal(edge.slowerUnits, 1000);
  assert.deepEqual(edge.bandDiv, { low: 8, high: 9 });
}

function testTriangleFeesAndCompleteness(): void {
  // Chaos as the ITEM: Div market vs Ex market is the Ex→Chaos→Div triangle.
  const rows = rowsOf(H0);
  const rates = hourRates(rows);
  const quotes = (quotesByItem(rows, rates).get(IDS.chaos) ?? []).map((q) => ({ ...q, lowQuote: null, highQuote: null }));
  const edge = itemHourEdge(IDS.chaos, H0, quotes, rates, GOLD);
  assert.ok(edge);
  assert.equal(edge.kind, "cross");
  const viaDiv = 241_502 / 2_241_349;
  const viaEx = 1_129_489 / 23_533 / EX_PER_DIV;
  assert.ok(near(edge.buy.priceDiv, viaDiv));
  assert.ok(near(edge.sell.priceDiv, viaEx));
  const gold = 160 + (1_129_489 / 23_533) * 120; // request 1 Chaos, then request the Ex it sells for
  assert.ok(near(edge.feeGoldPerUnit, gold));
  assert.equal(edge.feeComplete, true);
  assert.ok(near(edge.netDivPerUnit, viaEx - viaDiv - gold / (GOLD * EX_PER_DIV)));
  assert.ok(edge.grossPct > 1 && edge.netPct < 0, "a ~1% triangle does not survive the gold fees");
}

function testGreaterExaltedIsNotExalted(): void {
  // A digest whose only "exalted" market is the GREATER Exalt must not yield an Ex/Div rate.
  const markets = REAL_DIGEST.markets.map((m) =>
    m.league === FR && m.market_pair.includes(IDS.exalted) && m.market_pair.includes(IDS.divine)
      ? market(FR, IDS.greaterExalted, IDS.divine, 1000, 50)
      : m,
  );
  const rows = rowsOf(H0, markets);
  const rates = hourRates(rows);
  assert.equal(rates.exaltPerDivine, null);
  const quotes = quotesByItem(rows, rates);
  assert.ok(near(quotes.get(IDS.greaterExalted)?.[0]?.priceDiv, 0.05), "priced as an item of its own");
  assert.equal(goldFeeFor(IDS.greaterExalted, 1), null, "its fee is unknown, never the Exalt's 120");
  // Without an Ex/Div rate gold cannot be priced → the fee is unknown, not zero.
  const chaosEdge = hourEdges(H0, rows, GOLD).get(IDS.chaos);
  assert.equal(chaosEdge?.feeDivPerUnit, null);
  assert.equal(chaosEdge?.feeComplete, false);
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

function persistentAndSpikeRows(): CxMarketRow[] {
  const rows: CxMarketRow[] = [];
  for (let k = 0; k < 6; k++) {
    // Simulacrum holds a 12% gap in 5 of 6 hours (hour 3 collapses to 0%); Kulemak trades only
    // in the newest hour, at a 40% gap — the one-hour VWAP spike the median must see through.
    const extra = [...simulacrumMarkets(k === 3 ? 0 : 12)];
    if (k === 0) {
      extra.push(market(FR, IDS.kulemak, IDS.divine, 10, 20), market(FR, IDS.kulemak, IDS.exalted, 10, Math.round(28 * EX_PER_DIV)));
    }
    rows.push(...rowsOf(hourId(k), digestAt(hourId(k), extra).markets));
  }
  return rows;
}

function testPersistenceAndSpikes(): void {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  const stats = statsFromRows(persistentAndSpikeRows(), H0, GOLD, 5);
  const sim = stats.get(IDS.simulacrum);
  const kul = stats.get(IDS.kulemak);
  assert.ok(sim && kul);
  assert.equal(sim.kind, "cross");
  assert.equal(sim.persistence6, 5);
  assert.equal(sim.persistence24, 5);
  // 12% gross minus the Ex leg's gold (≈3.36 Div of Ex × 120 gold each at the configured value)
  const feeDiv = (3 * 1.12 * EX_PER_DIV * 120) / (GOLD * EX_PER_DIV);
  assert.ok(near(sim.edgePct, ((3 * 0.12 - feeDiv) / 3) * 100, 1e-4), `median net edge ${sim.edgePct}`);
  assert.equal(sim.feeComplete, false);
  assert.equal(kul.persistence6, 1, "a single-hour spike holds 1 of 6 hours");
  assert.ok(kul.edgeLatestPct != null && kul.edgeLatestPct > 30);
  // silent hours count as zero flow: 10 units in one of six hours
  assert.ok(near(kul.slowerUnitsPerHour, 10 / 6));
  // an item whose last trade is older than the 6h window has no current market
  const old = statsFromRows(persistentAndSpikeRows(), H0 + 6 * CX_HOUR_SECONDS, GOLD, 5);
  assert.equal(old.get(IDS.kulemak), undefined);
  assert.equal(aggregateItem([], H0, 5), null);
}

function testClosedRoutes(): void {
  const rows = rowsOf(H0, digestAt(H0, simulacrumMarkets(12)).markets);
  const sim = hourRoutes(H0, rows, GOLD).filter((r) => r.item === IDS.simulacrum);
  const divFirst = sim.find((r) => r.from === IDS.divine && r.to === IDS.exalted);
  const exFirst = sim.find((r) => r.from === IDS.exalted && r.to === IDS.divine);
  assert.ok(divFirst && exFirst);
  const sellEx = Math.round(100 * 3 * 1.12 * EX_PER_DIV) / 100; // Ex received per Simulacrum
  const backDiv = sellEx / EX_PER_DIV; // closing leg on the real Div/Ex market
  const gold = sellEx * 120 + backDiv * 800; // request the Ex, then request the Div back
  assert.ok(near(divFirst.netPct, ((backDiv - 3 - gold / (GOLD * EX_PER_DIV)) / 3) * 100));
  assert.equal(divFirst.feeComplete, false, "the Simulacrum leg's own fee is unknown");
  assert.equal(divFirst.capUnits, 100, "capped by the thinner item leg");
  assert.ok(exFirst.netPct < 0, "the reverse loop loses");

  const all = [0, 1, 2, 3, 4, 5].flatMap((k) =>
    hourRoutes(hourId(k), persistentAndSpikeRows().filter((r) => r.hour === hourId(k)), GOLD),
  );
  const listed = persistentRoutes(all, H0, 5, 4);
  assert.ok(listed.some((r) => r.item === IDS.simulacrum && r.from === IDS.divine && r.held6 === 5));
  assert.ok(!listed.some((r) => r.item === IDS.kulemak), "a one-hour route is never listed");
  assert.ok(listed.every((r, i) => i === 0 || listed[i - 1]!.medianNetPct >= r.medianNetPct));
}

function testMappingIsExactAndCounted(): void {
  const stats = statsFromRows(persistentAndSpikeRows(), H0, GOLD, 5);
  const names = new Map(TEST_NAMES);
  names.delete(IDS.exalted); // unnamed
  names.set(IDS.kulemak, "Simulacrum"); // two exchange ids, one name → ambiguous, both dropped
  const ninja = [
    { itemId: "simulacrum", itemName: "Simulacrum" },
    { itemId: "chaos", itemName: "Chaos Orb" },
    { itemId: "chaos-orb-typo", itemName: "chaos orb" }, // case differs: no fuzzy match
  ];
  const { byItemId, coverage } = mapToItemIds(stats, names, ninja);
  assert.deepEqual([...byItemId.keys()].sort(), ["chaos"]);
  assert.equal(coverage.unnamed, 1);
  assert.equal(coverage.ambiguous, 2);
  assert.equal(coverage.mapped, 1);
  assert.equal(coverage.unmatched, coverage.cxItems - coverage.unnamed - coverage.ambiguous - coverage.mapped);
}

function testRepoeCatalogNames(): void {
  const names = resolveBaseItemNames([IDS.divine, IDS.exalted, IDS.greaterExalted, IDS.omenOfLight, "Metadata/Nope"]);
  assert.equal(names.get(IDS.divine), "Divine Orb");
  assert.equal(names.get(IDS.exalted), "Exalted Orb");
  assert.equal(names.get(IDS.greaterExalted), "Greater Exalted Orb");
  assert.equal(names.get(IDS.omenOfLight), "Omen of Light");
  assert.equal(names.has("Metadata/Nope"), false);
  for (const [id, name] of TEST_NAMES) assert.equal(resolveBaseItemNames([id]).get(id), name, "fixture names match RePoE");
}
