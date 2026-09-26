/* Top Flips scoring on observed exchange data vs the labelled estimate, throughput units, and the
 * TREND/SPIKE transition de-spam — against a TEMP DB.
 * Run: npm run test:flips (src/scripts/runWithTestEnv.ts sets DB_PATH). NO NETWORK. */
import assert from "node:assert/strict";
import type { PricedItem } from "../api/types";
import { config } from "../config/env";
import type { CxEdgeStats, CxItemStats } from "../core/cx/cxPersistence";
import { scoreItem } from "../core/flipModel";
import type { ExchangeRates } from "../core/priceEngine";
import { advanceTrend, advanceTrends, isTransition, trendAlertState } from "../core/trendAlerts";
import type { TrendSignal } from "../core/trendDetector";
import { getDb } from "../db/database";
import { getTrendState } from "../db/trendStateQueries";
import { IDS, near } from "./cxTestFixtures";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

const db = getDb();
db.exec("DELETE FROM trend_state; DELETE FROM price_snapshots;");

const RATES: ExchangeRates = { exaltPerDivine: 400, chaosPerDivine: 10 };
const SHARE = config.cx.flowSharePct / 100;
const LEAGUE = "Flip Test League";

try {
  testEstimatedRowIsLabelledAndUnitUncertain();
  testObservedRowUsesTheExchange();
  testPersistenceDrivesTheScore();
  testThinFakeEdgeNeverOutranksALiquidOne();
  testGuardedMarketFallsBackWithItsReason();
  testManualModeKeepsItsMargin();
  testTrendStateMachine();
  testTrendTransitionsAgainstTheDb();
  testEveryItemAdvancesNotOnlyWatchedOnes();
  db.close();
  console.log("ALL PASS — flip scoring on exchange data, guards in ranking, estimate fallback, throughput units, trend de-spam");
} catch (error: unknown) {
  db.close();
  console.error(error);
  process.exit(1);
}

function item(over: Partial<PricedItem> = {}): PricedItem {
  return {
    itemId: "omen-of-light",
    itemName: "Omen of Light",
    category: "Ritual",
    baseValue: 2,
    volume: 1000, // poe.ninja volumePrimaryValue (Div-denominated, time unit unverified)
    change7d: 5,
    spark7d: null,
    icon: null,
    ...over,
  };
}

function edge(over: Partial<CxEdgeStats> = {}): CxEdgeStats {
  return {
    kind: "cross",
    edgePct: 8,
    edgeLatestPct: 9,
    edgeMedian24Pct: 7,
    persistence6: 6,
    persistence24: 20,
    validHours6: 6,
    netDivPerUnit: 0.16,
    slowerUnitsPerHour: 300,
    buy: { quote: IDS.divine, priceQuote: 2, priceDiv: 2 },
    sell: { quote: IDS.exalted, priceQuote: 880, priceDiv: 2.2 },
    legsHour: 1_789_570_800,
    feeGoldPerUnit: 105_600,
    feeDivPerUnit: 0.04,
    feeComplete: false,
    ...over,
  };
}

function stats(e: CxEdgeStats | null = edge(), over: Partial<CxItemStats> = {}): CxItemStats {
  return {
    newestHour: 1_789_570_800,
    midDiv: 2,
    bandDiv: { low: 1.9, high: 2.1 },
    marketUnitsPerHour: 500,
    edge: e,
    issue: e == null ? "coarse" : null,
    rawNetPct: e == null ? 6 : null,
    ...over,
  };
}

function testEstimatedRowIsLabelledAndUnitUncertain(): void {
  const row = scoreItem(item(), RATES);
  assert.equal(row.source, "estimated");
  assert.equal(row.mode, "RECO");
  assert.equal(row.edgeKind, null);
  assert.equal(row.persistence6, null);
  assert.equal(row.cxIssue, null, "no exchange market at all");
  assert.equal(row.flowObserved, false, "ninja volume: unit not established");
  assert.equal(row.ranked, true);
  // recommendOffsets(1000) → ±7% around a 2 Div mid → 0.28 Div per unit
  assert.ok(near(row.profitDiv, 2 * 1.07 - 2 * 0.93));
  // units = volume ÷ price, never Div/unit × a Div volume (the old unit error)
  assert.ok(near(row.throughputDivDay, row.profitDiv * 500 * SHARE * 24), `throughput ${row.throughputDivDay}`);
  // No margin credit for a volume lookup: liquidity only, ×0.5 estimate confidence, gate saturated.
  assert.equal(row.worthScore, Math.round(100 * 0.4 * (Math.log10(1001) / Math.log10(50000)) * 0.5));
}

function testObservedRowUsesTheExchange(): void {
  const row = scoreItem(item(), RATES, null, null, stats());
  assert.equal(row.source, "cx");
  assert.equal(row.edgePct, 8);
  assert.equal(row.marginPct, 8, "no synthetic RECO margin when the exchange has an edge");
  assert.equal(row.profitDiv, 0.16);
  assert.ok(near(row.throughputDivDay, 0.16 * 300 * SHARE * 24));
  assert.deepEqual(row.buyDisp, { amount: 2, unit: "DIVINE" }, "legs shown in the currency they trade in");
  assert.deepEqual(row.sellDisp, { amount: 880, unit: "EXALT" });
  assert.equal(row.legsHour, 1_789_570_800, "the UI labels these legs as the last hour's");
  assert.equal(row.flowObserved, true);
  assert.deepEqual(row.band, { lowDiv: 1.9, highDiv: 2.1 });
  assert.ok(near(row.slowerLegDivPerHour, 600));
  assert.equal(row.liquidityTier, "risky", "300 units/h × 2 Div = 600 Div/h on the slower leg");
  const hint = row.timeToSellHint;
  assert.ok(hint != null);
  assert.equal(hint.sizeUnits, Math.round(config.cx.hintPositionDiv / 2.2));
  assert.ok(near(hint.hours, hint.sizeUnits / (300 * SHARE)));
  const bogusQuote = edge({ buy: { quote: IDS.greaterExalted, priceQuote: 1, priceDiv: 1 } });
  assert.throws(() => scoreItem(item(), RATES, null, null, stats(bogusQuote)));
}

function testPersistenceDrivesTheScore(): void {
  const held = scoreItem(item(), RATES, null, null, stats(edge({ persistence6: 6 }))).worthScore;
  const four = scoreItem(item(), RATES, null, null, stats(edge({ persistence6: 4 }))).worthScore;
  assert.ok(held > four && four > 0, `6/6 ${held} > 4/6 ${four} > 0`);
  // Below 4/6 an observed edge is shown but not ranked (probe C).
  const three = scoreItem(item(), RATES, null, null, stats(edge({ persistence6: 3 })));
  assert.equal(three.ranked, false);
  assert.equal(three.worthScore, 0);
  assert.equal(three.source, "cx", "…its numbers are still observed, just not ranked");
  const estimated = scoreItem(item({ volume: 600 }), RATES).worthScore;
  assert.ok(estimated < held, `estimate ${estimated} must not outrank an observed, persistent edge ${held}`);
}

/** The reviewer's repro: a fat edge on a 0.003 Div/h leg outscored a real 8% edge at 600 Div/h. */
function testThinFakeEdgeNeverOutranksALiquidOne(): void {
  const liquid = scoreItem(item(), RATES, null, null, stats()).worthScore;
  const thinEdge = edge({ edgePct: 45, netDivPerUnit: 0.00045, slowerUnitsPerHour: 3 });
  const thin = scoreItem(item({ itemId: "preserved-rib", baseValue: 0.001 }), RATES, null, null, stats(thinEdge, { midDiv: 0.001 }));
  assert.equal(thin.liquidityTier, "thin");
  assert.ok(thin.worthScore < liquid, `thin ${thin.worthScore} must score below liquid ${liquid}`);
  assert.equal(thin.ranked, false, "hard gate: slower leg under the risky tier (100 Div/h) never ranks");
  assert.equal(thin.worthScore, 0);
  // Just under the gate (99 Div/h) is still out; at 100 it ranks.
  const at = (divH: number) => scoreItem(item(), RATES, null, null, stats(edge({ slowerUnitsPerHour: divH / 2 }))).ranked;
  assert.equal(at(99), false);
  assert.equal(at(100), true);
}

function testGuardedMarketFallsBackWithItsReason(): void {
  // An exchange market whose edge failed a guard: estimated legs, OBSERVED flow, reason attached.
  const coarse = scoreItem(item(), RATES, null, null, stats(null));
  assert.equal(coarse.source, "estimated");
  assert.equal(coarse.cxIssue, "coarse");
  assert.equal(coarse.cxRawNetPct, 6);
  assert.equal(coarse.flowObserved, true);
  assert.ok(near(coarse.slowerLegDivPerHour, 500 * 2), "the market's own flow, not ninja's");
  assert.equal(coarse.ranked, true);
  // Implausible data is shown but never ranked.
  const artefact = scoreItem(item(), RATES, null, null, stats(null, { issue: "implausible", rawNetPct: 364 }));
  assert.equal(artefact.ranked, false);
  assert.equal(artefact.worthScore, 0);
  // …unless you entered your own prices: your REAL margin is still yours.
  const manual = scoreItem(item(), RATES, { amount: 800, ccy: "EXALT" }, { amount: 25, ccy: "CHAOS" }, stats(null, { issue: "implausible" }));
  assert.equal(manual.ranked, true);
  assert.ok(manual.worthScore > 0);
}

function testManualModeKeepsItsMargin(): void {
  const row = scoreItem(item(), RATES, { amount: 800, ccy: "EXALT" }, { amount: 25, ccy: "CHAOS" }, stats());
  assert.equal(row.mode, "REAL");
  assert.ok(near(row.marginPct, (2.5 / 2 - 1) * 100));
  assert.equal(row.edgePct, 8, "the market line shows the observed edge");
  assert.equal(row.source, "cx");
  assert.ok(near(row.throughputDivDay, 0.5 * 300 * SHARE * 24), "your own profit × the slower leg's fillable flow");
}

function signal(s: TrendSignal["signal"]): TrendSignal {
  return { item: "x", change7d: 80, change24h: 1, volumeRatio: 1, signal: s, reason: "r" };
}

function testTrendStateMachine(): void {
  assert.equal(trendAlertState(signal("BUY"), 80, 50), "BUY");
  assert.equal(trendAlertState(signal("SELL"), 150, 50), "SELL");
  assert.equal(trendAlertState(signal("WATCH"), 80, 50), "SPIKE");
  assert.equal(trendAlertState(signal("WATCH"), 40, 50), "NONE");
  assert.equal(isTransition(null, "BUY"), true);
  assert.equal(isTransition("BUY", "BUY"), false, "a held signal is silent");
  assert.equal(isTransition("SPIKE", "BUY"), true);
  assert.equal(isTransition("BUY", "NONE"), false, "leaving a state is not news");
  assert.equal(isTransition("NONE", "BUY"), true, "…but it re-arms the next entry");
}

function testTrendTransitionsAgainstTheDb(): void {
  const spiking = item({ itemId: "kulemak", change7d: 80 });
  const first = advanceTrend(LEAGUE, "kulemak", "Kulemak's Invitation", spiking);
  assert.equal(first?.type, "SPIKE");
  for (let cycle = 0; cycle < 12; cycle++) {
    assert.equal(advanceTrend(LEAGUE, "kulemak", "Kulemak's Invitation", spiking), null, "no re-alert while it holds");
  }
  assert.equal(getTrendState(LEAGUE, "kulemak"), "SPIKE");
  assert.equal(advanceTrend(LEAGUE, "kulemak", "Kulemak's Invitation", { ...spiking, change7d: 10 }), null);
  assert.equal(getTrendState(LEAGUE, "kulemak"), "NONE");
  assert.equal(advanceTrend(LEAGUE, "kulemak", "Kulemak's Invitation", spiking)?.type, "SPIKE", "re-entry alerts again");
  // State is per league: the same item in another league has its own history.
  assert.equal(advanceTrend("Other League", "kulemak", "Kulemak's Invitation", spiking)?.type, "SPIKE");
  db.prepare("INSERT OR REPLACE INTO trend_state (league, item_id, state) VALUES (?, ?, 'BOGUS')").run(LEAGUE, "kulemak");
  assert.throws(() => advanceTrend(LEAGUE, "kulemak", "Kulemak's Invitation", spiking), /unknown state/);
}

/**
 * Every market item advances each sweep, watched or not: an item that entered SPIKE while nobody
 * watched it is already SPIKE when someone starts watching — no stale "new" alert, and its real
 * next transition still fires.
 */
function testEveryItemAdvancesNotOnlyWatchedOnes(): void {
  const league = "Sweep League";
  const market = [item({ itemId: "a", change7d: 80 }), item({ itemId: "b", change7d: 5 }), item({ itemId: "c", change7d: 90 })];
  const first = advanceTrends(league, market);
  assert.deepEqual([...first.keys()].sort(), ["a", "c"]);
  assert.equal(getTrendState(league, "b"), "NONE", "quiet items are recorded too");
  assert.equal(advanceTrends(league, market).size, 0, "a second sweep of the same market is silent");
  const later = advanceTrends(league, [item({ itemId: "a", change7d: 80 }), item({ itemId: "b", change7d: 70 })]);
  assert.deepEqual([...later.keys()], ["b"], "only the real transition fires");
}
