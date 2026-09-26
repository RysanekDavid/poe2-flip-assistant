/* Closed-loop route finder guards. Pure; run from testCxMarkets via npm run test:cx. NO NETWORK. */
import assert from "node:assert/strict";
import { hourRoutes, persistentRoutes } from "../core/cx/cxRoutes";
import {
  EX_PER_DIV,
  H0,
  IDS,
  PARAMS,
  crossMarkets,
  digestAt,
  hourId,
  implausibleMarkets,
  near,
  persistentAndSpikeRows,
  rowsOf,
  simulacrumMarkets,
  subExaltMarkets,
  thinRibMarkets,
} from "./cxTestFixtures";

const GOLD = PARAMS.goldPerExalt;

export function runCxRouteTests(): void {
  testDivExDivLoop();
  testGuardedHoursNeverExist();
  testOnlyPersistentRoutesAreListed();
}

function hourOf(extra: Parameters<typeof digestAt>[1]) {
  return hourRoutes(H0, rowsOf(H0, digestAt(H0, extra).markets), PARAMS);
}

function testDivExDivLoop(): void {
  const sim = hourOf(simulacrumMarkets(12)).filter((r) => r.item === IDS.simulacrum);
  const divFirst = sim.find((r) => r.from === IDS.divine && r.to === IDS.exalted);
  assert.ok(divFirst, "Div → Simulacrum → Ex → Div");
  const sellEx = Math.round(100 * 40 * 1.12 * EX_PER_DIV) / 100; // Ex received per Simulacrum
  const backDiv = sellEx / EX_PER_DIV; // closing leg on the real Div/Ex market
  const gold = sellEx * 120 + backDiv * 800; // request the Ex, then request the Div back
  assert.ok(near(divFirst.netPct, ((backDiv - 40 - gold / (GOLD * EX_PER_DIV)) / 40) * 100));
  assert.equal(divFirst.feeComplete, false, "the Simulacrum leg's own fee is unknown");
  assert.equal(divFirst.capUnits, 100, "capped by the thinner item leg");
  assert.equal(sim.find((r) => r.from === IDS.exalted), undefined, "the reverse loop is inside the grid / loses");
}

function testGuardedHoursNeverExist(): void {
  const routes = hourOf([...thinRibMarkets(), ...subExaltMarkets(), ...implausibleMarkets()]);
  // thin 1:1-Ex rib ("+127%"), sub-Exalt with unknown fee, +80% artefact: no hour at all
  for (const id of [IDS.preservedRib, IDS.gnawedRib, IDS.vaalSiphoner]) {
    assert.ok(!routes.some((r) => r.item === id), id);
  }
  // 10 Simulacra/h on the Div leg is below minLegUnits: the loop has no hour either
  assert.ok(!hourOf(crossMarkets(IDS.simulacrum, 40, 12, { div: 10, ex: 100 })).some((r) => r.item === IDS.simulacrum));
}

function testOnlyPersistentRoutesAreListed(): void {
  const rows = persistentAndSpikeRows();
  const all = [0, 1, 2, 3, 4, 5].flatMap((k) => hourRoutes(hourId(k), rows.filter((r) => r.hour === hourId(k)), PARAMS));
  const listed = persistentRoutes(all, H0, 5, 4);
  assert.ok(listed.some((r) => r.item === IDS.simulacrum && r.from === IDS.divine && r.held6 === 5));
  assert.ok(!listed.some((r) => r.item === IDS.kulemak), "a one-hour route is never listed");
  assert.ok(!listed.some((r) => r.item === IDS.preservedRib), "six hours of a thin artefact are never listed");
  assert.ok(!listed.some((r) => r.item === IDS.vaalSiphoner), "six hours of an implausible edge are never listed");
  assert.ok(listed.every((r, i) => i === 0 || listed[i - 1]!.medianNetPct >= r.medianNetPct));
}
