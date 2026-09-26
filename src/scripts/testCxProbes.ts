/* The delta review's probes A–C and the tightened thresholds, as assertions. Pure; run from
 * testCxMarkets via npm run test:cx. NO NETWORK. */
import assert from "node:assert/strict";
import { config } from "../config/env";
import { hourEdges } from "../core/cx/cxEdges";
import { statsFromRows } from "../core/cx/cxItemMarkets";
import { isPublishable, MIN_HELD_HOURS, MIN_VALID_HOURS } from "../core/cx/cxPersistence";
import {
  CHAOS_PER_DIV,
  EX_PER_DIV,
  FR,
  H0,
  IDS,
  PARAMS,
  crossMarkets,
  digestAt,
  hoursOf,
  market,
  near,
  rowsOf,
} from "./cxTestFixtures";

const THRESHOLD = config.cx.edgeThresholdPct;
const RISKY = config.cx.liquidityRiskyDivH;
const sim = IDS.simulacrum;

export function runCxProbeTests(): void {
  testThresholds();
  probeA_badHoursAreNeverCensored();
  probeB_everyPairIsJudged();
  probeC_sporadicAndTheRankGate();
}

function testThresholds(): void {
  assert.equal(PARAMS.maxGridStepPct, 10, "each leg ≥ 10 quote units per item or ≥ 10 items per quote unit");
  assert.equal(PARAMS.maxPlausibleEdgePct, 30);
  assert.equal(PARAMS.minLegDivPerHour, 20);
  assert.equal(RISKY, 100);
  // 12 Div per item: 8.3% grid — quotable; 8 Div: 12.5% — not.
  const quotes = (divEach: number) => hourEdges(H0, rowsOf(H0, digestAt(H0, crossMarkets(sim, divEach, 40)).markets), PARAMS).get(sim);
  assert.notEqual(quotes(12)?.issue, "coarse");
  assert.equal(quotes(8)?.issue, "coarse");
  // Legs at 0.05 Div (fine 5% grid): 380 units/h is 19 Div/h — thin; 400 units/h is 20 — quotable.
  const legs = (units: number) =>
    hourEdges(H0, rowsOf(H0, digestAt(H0, crossMarkets(sim, 0.05, 20, { div: units, ex: units })).markets), PARAMS).get(sim);
  assert.equal(legs(380)?.issue, "thin");
  assert.ok(legs(400)?.edge != null, `400 units/h: ${legs(400)?.issue}`);
}

/**
 * Probe A: hours alternating 45% / 70% on a liquid item published "+41.5%, 6/6-ish, ranked".
 * Any implausible hour now taints the window; and invalid hours are zeros in the median, never
 * silently dropped.
 */
function probeA_badHoursAreNeverCensored(): void {
  const alternating = (a: number, b: number) =>
    statsFromRows(hoursOf(6, (k) => crossMarkets(sim, 40, k % 2 === 0 ? a : b)), H0, PARAMS, THRESHOLD).get(sim);
  const probe = alternating(45, 70);
  assert.equal(probe?.edge, null);
  assert.equal(probe?.issue, "implausible");
  // Even when half the hours would be a clean 25%, a 40% hour in the window taints it.
  assert.equal(alternating(25, 40)?.issue, "implausible");
  // 3 valid 20% hours + 3 coarse (1%) hours: the median counts the bad hours as 0.
  const halfBad = statsFromRows(hoursOf(6, (k) => crossMarkets(sim, 40, k % 2 === 0 ? 20 : 1)), H0, PARAMS, THRESHOLD).get(sim);
  const edge = halfBad?.edge;
  assert.ok(edge != null);
  assert.equal(edge.validHours6, 3);
  const valid20 = hourEdges(H0, rowsOf(H0, digestAt(H0, crossMarkets(sim, 40, 20)).markets), PARAMS).get(sim)?.edge?.netPct;
  assert.ok(valid20 != null && near(edge.edgePct, valid20 / 2, 1e-9), `median over 6 slots: ${edge.edgePct} vs ${valid20}/2`);
  assert.equal(edge.persistence6, 3);
}

/**
 * Probe B: the Div market is dumped (+60% vs fair), Ex is fair, Chaos is +8%. Only judging the
 * widest pair saw an implausible 60% and lost the clean 8% Ex → Chaos edge.
 */
function probeB_everyPairIsJudged(): void {
  const fair = 40;
  const markets = [
    market(FR, sim, IDS.divine, 200, 200 * fair * 1.6),
    market(FR, sim, IDS.exalted, 100, Math.round(100 * fair * EX_PER_DIV)),
    market(FR, sim, IDS.chaos, 100, Math.round(100 * fair * 1.08 * CHAOS_PER_DIV)),
  ];
  const result = hourEdges(H0, rowsOf(H0, digestAt(H0, markets).markets), PARAMS).get(sim);
  const edge = result?.edge;
  assert.ok(edge != null, `expected the Ex → Chaos edge, got ${result?.issue}`);
  assert.equal(edge.buy.quote, IDS.exalted);
  assert.equal(edge.sell.quote, IDS.chaos);
  assert.ok(edge.grossPct > 7.9 && edge.grossPct < 8.1, `gross ${edge.grossPct}`);
  assert.ok(edge.netPct > 7 && edge.netPct < PARAMS.maxPlausibleEdgePct);
  // With the clean pair removed, the hour is implausible — only because NO pair was valid.
  const dumpOnly = hourEdges(H0, rowsOf(H0, digestAt(H0, markets.slice(0, 2)).markets), PARAMS).get(sim);
  assert.equal(dumpOnly?.issue, "implausible");
}

/** Probe C: one or two valid hours are not a "6h median"; three are an edge but not a ranked one. */
function probeC_sporadicAndTheRankGate(): void {
  const withValid = (n: number, divEach = 40, units = { div: 200, ex: 100 }) =>
    statsFromRows(hoursOf(6, (k) => (k < n ? crossMarkets(sim, divEach, 20, units) : [])), H0, PARAMS, THRESHOLD).get(sim);
  for (const n of [1, MIN_VALID_HOURS - 1]) {
    const s = withValid(n);
    assert.equal(s?.edge, null, `${n} valid hour(s)`);
    assert.equal(s?.issue, "sporadic");
  }
  const three = withValid(MIN_VALID_HOURS);
  assert.ok(three?.edge != null);
  assert.equal(isPublishable(three, RISKY), false, "held 3/6 < MIN_HELD_HOURS");
  const four = withValid(MIN_HELD_HOURS);
  assert.ok(four != null && isPublishable(four, RISKY), "4/6 on a liquid market is published");
  // 4/6 held, but the slower leg averages ~13 Div/h over the window: below the rank gate.
  const trickle = withValid(MIN_HELD_HOURS, 0.05, { div: 400, ex: 400 });
  assert.ok(trickle?.edge != null, `trickle should still compute: ${trickle?.issue}`);
  assert.equal(isPublishable(trickle, RISKY), false);
}
