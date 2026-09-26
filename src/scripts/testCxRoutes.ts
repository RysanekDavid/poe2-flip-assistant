/* Closed-loop route finder guards. Pure; run from testCxMarkets via npm run test:cx. NO NETWORK. */
import assert from "node:assert/strict";
import { config } from "../config/env";
import { hourRoutes, persistentRoutes, type RouteHour } from "../core/cx/cxRoutes";
import {
  EX_PER_DIV,
  H0,
  IDS,
  PARAMS,
  crossMarkets,
  digestAt,
  hourId,
  hoursOf,
  implausibleMarkets,
  near,
  persistentAndSpikeRows,
  rowsOf,
  simulacrumMarkets,
  subExaltMarkets,
  thinRibMarkets,
} from "./cxTestFixtures";

const GOLD = PARAMS.goldPerExalt;
/** The same liquidity gate a Top Flips row must pass to be ranked. */
const RISKY = config.cx.liquidityRiskyDivH;

export function runCxRouteTests(): void {
  testDivExDivLoop();
  testGuardedHoursAreNeverValid();
  testOnlyPersistentRoutesAreListed();
  testWindowRules();
  testCapacityGate();
}

/**
 * Live repro: loops held 5/6 with every hour over the 20 Div/h leg floor, yet a window mean far
 * under the rank gate (Liquid Verisium 26.7 Div/h, Perfect Exalted Orb 88.8 Div/h) showed as
 * green route chips while the table called the same items NOT RANKED. Routes use the same gate.
 */
function testCapacityGate(): void {
  // 0.05 Div items, 400/h per leg (20 Div/h each: just quotable), 20% gap, 5 of 6 hours.
  const trickle = allHours(hoursOf(6, (k) => (k < 5 ? crossMarkets(IDS.simulacrum, 0.05, 20, { div: 400, ex: 400 }) : [])));
  const ungated = persistentRoutes(trickle, H0, 5, 0).find((r) => r.item === IDS.simulacrum && r.from === IDS.divine);
  assert.ok(ungated != null && ungated.held6 === 5, "the loop itself is valid and persistent");
  assert.ok(near(ungated.capDivPerHour, (5 * 400 * 0.05) / 6, 1e-6), `cx-priced capacity ${ungated.capDivPerHour}`);
  assert.equal(
    persistentRoutes(trickle, H0, 5, RISKY).some((r) => r.item === IDS.simulacrum),
    false,
    "≈17 Div/h window mean < the 100 Div/h rank gate → not listed",
  );
  // A liquid loop passes, and its capacity is priced from the exchange (100 units × 40 Div, 5/6 hours).
  const liquid = persistentRoutes(allHours(persistentAndSpikeRows()), H0, 5, RISKY).find((r) => r.item === IDS.simulacrum);
  assert.ok(liquid != null && near(liquid.capDivPerHour, (5 * 100 * 40) / 6, 1e-6));
}

function hourOf(extra: Parameters<typeof digestAt>[1]): RouteHour[] {
  return hourRoutes(H0, rowsOf(H0, digestAt(H0, extra).markets), PARAMS);
}

/** Route hours of the six-hour rows, every hour judged. */
function allHours(rows: ReturnType<typeof hoursOf>): RouteHour[] {
  return [0, 1, 2, 3, 4, 5].flatMap((k) => hourRoutes(hourId(k), rows.filter((r) => r.hour === hourId(k)), PARAMS));
}

function testDivExDivLoop(): void {
  const sim = hourOf(simulacrumMarkets(12)).filter((r) => r.item === IDS.simulacrum);
  const divFirst = sim.find((r) => r.from === IDS.divine && r.to === IDS.exalted);
  assert.ok(divFirst, "Div → Simulacrum → Ex → Div");
  assert.equal(divFirst.status, "valid");
  const sellEx = Math.round(100 * 40 * 1.12 * EX_PER_DIV) / 100; // Ex received per Simulacrum
  const backDiv = sellEx / EX_PER_DIV; // closing leg on the real Div/Ex market
  const gold = sellEx * 120 + backDiv * 800; // request the Ex, then request the Div back
  assert.ok(near(divFirst.netPct, ((backDiv - 40 - gold / (GOLD * EX_PER_DIV)) / 40) * 100));
  assert.equal(divFirst.feeComplete, false, "the Simulacrum leg's own fee is unknown");
  assert.equal(divFirst.capUnits, 100, "capped by the thinner item leg");
  assert.notEqual(sim.find((r) => r.from === IDS.exalted)?.status, "valid", "the reverse loop loses");
}

function testGuardedHoursAreNeverValid(): void {
  const routes = hourOf([...thinRibMarkets(), ...subExaltMarkets(), ...implausibleMarkets()]);
  // thin 1:1-Ex rib ("+127%"), sub-Exalt with unknown fee, +80% artefact: never a valid hour
  for (const id of [IDS.preservedRib, IDS.gnawedRib, IDS.vaalSiphoner]) {
    assert.ok(!routes.some((r) => r.item === id && r.status === "valid"), id);
  }
  assert.ok(routes.some((r) => r.item === IDS.vaalSiphoner && r.status === "implausible"));
  // 10 Simulacra/h on the Div leg is below minLegUnits: the loop has no hour at all
  assert.ok(!hourOf(crossMarkets(IDS.simulacrum, 40, 12, { div: 10, ex: 100 })).some((r) => r.item === IDS.simulacrum));
}

function testOnlyPersistentRoutesAreListed(): void {
  const listed = persistentRoutes(allHours(persistentAndSpikeRows()), H0, 5, RISKY);
  const sim = listed.find((r) => r.item === IDS.simulacrum && r.from === IDS.divine);
  assert.ok(sim != null && sim.held6 === 5);
  assert.ok(!listed.some((r) => r.item === IDS.kulemak), "a one-hour route is never listed");
  assert.ok(!listed.some((r) => r.item === IDS.preservedRib), "six hours of a thin artefact are never listed");
  assert.ok(!listed.some((r) => r.item === IDS.vaalSiphoner), "six hours of an implausible edge are never listed");
  assert.ok(listed.every((r, i) => i === 0 || listed[i - 1]!.medianNetPct >= r.medianNetPct));
}

function testWindowRules(): void {
  // A route that is a clean 25% in half the hours and implausible in the rest: the item-hours with
  // only implausible loops taint the window, so nothing is listed.
  const tainted = persistentRoutes(allHours(hoursOf(6, (k) => crossMarkets(IDS.simulacrum, 40, k % 2 === 0 ? 25 : 60))), H0, 5, RISKY);
  assert.deepEqual(tainted, []);
  // Four valid hours of 20% and two silent: the median runs over all 6 slots.
  const four = persistentRoutes(allHours(hoursOf(6, (k) => (k < 4 ? crossMarkets(IDS.simulacrum, 40, 20) : []))), H0, 5, RISKY);
  const route = four.find((r) => r.item === IDS.simulacrum && r.from === IDS.divine);
  assert.ok(route != null && route.held6 === 4);
  const oneHour = hourOf(crossMarkets(IDS.simulacrum, 40, 20)).find((r) => r.item === IDS.simulacrum && r.from === IDS.divine)!.netPct;
  assert.ok(near(route.medianNetPct, oneHour), `slots [v,v,v,v,0,0] → median v: ${route.medianNetPct} vs ${oneHour}`);
  // Three valid hours: below the 4/6 bar.
  const three = persistentRoutes(allHours(hoursOf(6, (k) => (k < 3 ? crossMarkets(IDS.simulacrum, 40, 20) : []))), H0, 5, RISKY);
  assert.deepEqual(three, []);
}
