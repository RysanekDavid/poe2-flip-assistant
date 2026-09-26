/* Top Flips scoring on observed exchange data vs the labelled estimate, throughput units, and the
 * TREND/SPIKE transition de-spam — against a TEMP DB.
 * Run: npm run test:flips (src/scripts/runWithTestEnv.ts sets DB_PATH). NO NETWORK. */
import assert from "node:assert/strict";
import type { PricedItem } from "../api/types";
import { config } from "../config/env";
import type { CxItemStats } from "../core/cx/cxPersistence";
import { scoreItem } from "../core/flipModel";
import type { ExchangeRates } from "../core/priceEngine";
import { advanceTrend, isTransition, trendAlertState } from "../core/trendAlerts";
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
  testEstimatedRowIsLabelledAndUnitCorrect();
  testObservedRowUsesTheExchange();
  testPersistenceDrivesTheScore();
  testManualModeKeepsItsMargin();
  testTrendStateMachine();
  testTrendTransitionsAgainstTheDb();
  db.close();
  console.log("ALL PASS — flip scoring on exchange data, estimate fallback, throughput units, trend de-spam");
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
    volume: 1000, // Div per hour (poe.ninja volumePrimaryValue)
    change7d: 5,
    spark7d: null,
    icon: null,
    ...over,
  };
}

function stats(over: Partial<CxItemStats> = {}): CxItemStats {
  return {
    newestHour: 1_789_570_800,
    kind: "cross",
    edgePct: 8,
    edgeLatestPct: 9,
    edgeMedian24Pct: 7,
    persistence6: 6,
    persistence24: 20,
    netDivPerUnit: 0.16,
    slowerUnitsPerHour: 300,
    midDiv: 2,
    bandDiv: { low: 1.9, high: 2.1 },
    buy: { quote: IDS.divine, priceQuote: 2, priceDiv: 2 },
    sell: { quote: IDS.exalted, priceQuote: 880, priceDiv: 2.2 },
    feeGoldPerUnit: 105_600,
    feeDivPerUnit: 0.04,
    feeComplete: false,
    ...over,
  };
}


function testEstimatedRowIsLabelledAndUnitCorrect(): void {
  const row = scoreItem(item(), RATES);
  assert.equal(row.source, "estimated");
  assert.equal(row.mode, "RECO");
  assert.equal(row.edgeKind, null);
  assert.equal(row.persistence6, null);
  assert.equal(row.feeComplete, false);
  // recommendOffsets(1000) → ±7% around a 2 Div mid → 0.28 Div per unit
  assert.ok(near(row.profitDiv, 2 * 1.07 - 2 * 0.93));
  // 1000 Div/h ÷ 2 Div = 500 units/h; the old bug multiplied by 1000 (Div) instead
  assert.ok(near(row.throughputDivDay, row.profitDiv * 500 * SHARE * 24), `throughput ${row.throughputDivDay}`);
  assert.equal(row.slowerLegDivPerHour, 1000);
  // The volume-lookup margin is not an observation, so it adds nothing to the score: liquidity
  // only (no sparkline → no oscillation), at the estimate's half confidence.
  assert.equal(row.worthScore, Math.round(100 * 0.4 * (Math.log10(1001) / Math.log10(50000)) * 0.5));
  assert.equal(row.liquidityTier, "safe");
  const hint = row.timeToSellHint;
  assert.ok(hint != null);
  assert.equal(hint.sizeUnits, Math.round(config.cx.hintPositionDiv / (2 * 1.07)), "units of a 10 Div position");
  assert.ok(near(hint.hours, hint.sizeUnits / (500 * SHARE)));
}

function testObservedRowUsesTheExchange(): void {
  const cx = stats();
  const row = scoreItem(item(), RATES, null, null, cx);
  assert.equal(row.source, "cx");
  assert.equal(row.edgePct, 8);
  assert.equal(row.marginPct, 8, "no synthetic RECO margin when the exchange has data");
  assert.equal(row.marketMarginPct, 8);
  assert.equal(row.profitDiv, 0.16);
  assert.ok(near(row.throughputDivDay, 0.16 * 300 * SHARE * 24));
  assert.deepEqual(row.buyDisp, { amount: 2, unit: "DIVINE" }, "legs shown in the currency they trade in");
  assert.deepEqual(row.sellDisp, { amount: 880, unit: "EXALT" });
  assert.equal(row.persistence6, 6);
  assert.equal(row.edgeKind, "cross");
  assert.deepEqual(row.band, { lowDiv: 1.9, highDiv: 2.1 });
  assert.equal(row.feeDiv, 0.04);
  assert.ok(near(row.slowerLegDivPerHour, 600));
  assert.equal(row.liquidityTier, "risky", "300 units/h × 2 Div = 600 Div/h on the slower leg");
  assert.throws(() => scoreItem(item(), RATES, null, null, stats({ buy: { quote: IDS.greaterExalted, priceQuote: 1, priceDiv: 1 } })));
}

function testPersistenceDrivesTheScore(): void {
  const held = scoreItem(item(), RATES, null, null, stats({ persistence6: 6 })).worthScore;
  const spike = scoreItem(item(), RATES, null, null, stats({ persistence6: 1 })).worthScore;
  assert.ok(held > spike * 2, `held ${held} vs one-hour spike ${spike}`);
  // The same margin/liquidity as an estimate ranks at half confidence.
  const estimated = scoreItem(item({ volume: 600 }), RATES).worthScore;
  assert.ok(estimated < held, `estimate ${estimated} must not outrank an observed, persistent edge ${held}`);
}

function testManualModeKeepsItsMargin(): void {
  const row = scoreItem(item(), RATES, { amount: 800, ccy: "EXALT" }, { amount: 25, ccy: "CHAOS" }, stats());
  assert.equal(row.mode, "REAL");
  assert.ok(near(row.marginPct, (2.5 / 2 - 1) * 100));
  assert.equal(row.marketMarginPct, 8, "the market line shows the observed edge");
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
