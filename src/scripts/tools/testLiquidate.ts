/* Wealth › Sell (npm name kept: test:tools:liquidate): exchange + trade quotes, the stash planner,
 * sellVerdict fixtures, sold-since-snapshot, session delta, then the DB half (wealthDbTests: storage,
 * migrations, comps, reprice queue + budget, cred state, response contract). */
import assert from "node:assert/strict";
import type { PricedItem } from "../../api/types";
import type { CxItemStats } from "../../core/cx/cxPersistence";
import { cxSellQuote } from "../../core/wealth/cxRoute";
import { planLiquidation, type PlanContext } from "../../core/wealth/plan";
import { sellVerdict, type VerdictInput } from "../../core/wealth/sellVerdict";
import { sessionDelta } from "../../core/wealth/sessionDelta";
import { soldSince, type ReadListing } from "../../core/wealth/soldSince";
import { stashNote, tradeListingQuote } from "../../core/wealth/tradeRoute";
import type { ListingComp, PlanRow } from "../../lib/wealthContract";
import { assertPanelExport } from "./toolsTestKit";
import { runWealthDbTests } from "./wealthDbTests";

const RATES = { exaltPerDivine: 400, chaosPerDivine: 20 };
const GOLD_PER_EX = 5000;
const near = (a: number, b: number, msg: string): void => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);

function cxStats(midDiv: number, marketUnitsPerHour: number): CxItemStats {
  return { newestHour: 1_790_000_000, midDiv, bandDiv: null, marketUnitsPerHour, edge: null, issue: null, rawNetPct: null };
}

function line(itemId: string, itemName: string, baseValue: number, volume: number, change7d: number | null = null): PricedItem {
  return { itemId, itemName, category: "Currency", baseValue, volume, change7d, spark7d: null, icon: `https://icon/${itemId}.png` };
}

const quote = (baseValue: number, cx: CxItemStats | null, qty: number, goldPerEx = GOLD_PER_EX) =>
  cxSellQuote({ baseValue, volume: 500 }, cx, qty, RATES, goldPerEx, 10, 10);

function testCxQuote(): void {
  // 1.5 Div in Div sits on a 1-or-2 grid (67%) — Chaos (30 per unit, 3% grid) wins despite a dearer fee.
  const coarseDiv = quote(1.5, cxStats(1.5, 100), 1);
  assert.equal(coarseDiv.denom.unit, "CHAOS");
  near(coarseDiv.denom.amount, 30, "priced 30 chaos each");
  assert.equal(coarseDiv.feeGold, 30 * 160, "fee is charged per chaos received");
  near(coarseDiv.feeDivPerUnit ?? NaN, 4800 / (GOLD_PER_EX * 400), "fee in Div at the gold valuation");
  near(coarseDiv.etaHours ?? NaN, 1 / (100 * 0.1), "ETA = qty / (flow × share)");
  assert.equal(coarseDiv.tier, "risky", "150 Div/h observed");
  assert.equal(quote(10, cxStats(10, 500), 1).denom.unit, "DIVINE", "both grids fine → the cheaper fee");
  const capped = quote(0.01, cxStats(0.01, 5000), 1000);
  assert.equal(capped.denom.unit, "DIVINE");
  near(capped.receiveUnits, 10, "receives 10 Divines (4,000 Ex is over the 200-item cap)");
  const huge = quote(0.001, cxStats(0.001, 50), 10_000);
  assert.ok(huge.warnings.some((w) => w.includes("days to clear") && w.includes("split it, or take market")));
  const blind = quote(2, null, 3);
  assert.deepEqual([blind.observed, blind.midSource, blind.etaHours], [false, "ninja", null], "no exchange history → ninja mid, no ETA");
  const unknownFee = quote(10, cxStats(10, 500), 1, 0);
  assert.deepEqual([unknownFee.feeComplete, unknownFee.feeDivPerUnit], [false, null], "an unpriceable gold fee is unknown, never 0");
  const ratio = quote(0.00001, cxStats(0.00001, 100_000), 100_000);
  assert.equal(ratio.denom.unit, "CHAOS", "100,000:1 Divine is past the 65000:1 clamp");
}

function testTradeQuote(): void {
  const t = tradeListingQuote(2.5, 4, { listed: 45, sellThrough: 0.01, samples: 7 }, RATES);
  near(t.quickDiv, 2.25, "quick 0.9×");
  near(t.patientDiv, 2.75, "patient 1.1×");
  assert.equal(t.note, "~price 50 chaos", "2.5 Div = 1,000 Ex > cap → 50 Chaos");
  assert.ok(t.competitionNote?.includes("45 listed") && t.competitionNote.includes("slow sell-through"));
  assert.equal(stashNote(0.1, RATES).note, "~price 40 exalted");
  assert.equal(stashNote(25, RATES).note, "~price 25 divine");
  assert.equal(stashNote(3.24, RATES).note, "~price 65 chaos", "3.24 Div → 64.8 chaos, rounded to whole orbs");
  assert.throws(() => tradeListingQuote(0, 1, null, RATES), /positive value/);
}

function planContext(compDiv: ReadonlyMap<string, number> = new Map()): PlanContext {
  const kulemak = line("kulemak", "Kulemak's Invitation", 2.5, 800, 31);
  const dust = line("dust", "Thin Dust", 0.05, 1);
  return {
    rates: RATES,
    ninjaByName: new Map([[kulemak.itemName.toLowerCase(), kulemak], [dust.itemName.toLowerCase(), dust]]),
    cxByItemId: new Map([["kulemak", cxStats(2.5, 1000)]]), // 2,500 Div/h → safe
    uniqueDiv: new Map([["headhunter", 40], ["mageblood", 90]]),
    compDiv,
    competition: new Map([["headhunter", { competition: { listed: 12, sellThrough: 0.3, samples: 9 }, icon: "https://icon/hh.png" }]]),
    params: { goldPerExalt: GOLD_PER_EX, flowSharePct: 10, maxGridStepPct: 10 },
  };
}

function testPlan(): void {
  const plan = planLiquidation(
    [
      { name: "kulemak's invitation", qty: 4 },
      { name: "Headhunter", qty: 1 },
      { name: "Doom Grip", qty: 1 },
      { name: "Thin Dust", qty: 10 },
      { name: "Mageblood", qty: 1 },
      { name: "Kulemak's Invitation ", qty: 6 },
    ],
    planContext(new Map([["mageblood", 70]])),
  );
  assert.deepEqual(plan.rows.map((r) => [r.name, r.qty, r.recommended, r.valueSource, r.unitDiv]), [
    ["Kulemak's Invitation", 10, "cx", "cx", 2.5],
    ["Headhunter", 1, "trade", "scout", 40],
    ["Doom Grip", 1, "unpriced", "none", null],
    ["Thin Dust", 10, "trade", "ninja", 0.05],
    ["Mageblood", 1, "trade", "trade", 70],
  ], "duplicates merge; comps beat poe2scout; no value → unpriced (null, never 0)");
  assert.equal(plan.rows[1]!.trade?.competition?.listed, 12);
  assert.ok(plan.rows[3]!.reason.startsWith("exchange too thin"), "thin exchange market → trade");
  const kul = plan.rows[0]!;
  near(kul.fastTotalDiv ?? NaN, kul.cx!.fastDiv * 10 - (kul.feeTotalDiv ?? NaN), "fast total is net of the fee");
  assert.equal(plan.rows[2]!.fastTotalDiv, null, "an unpriced row has no total");
  assert.equal(plan.totals.unpricedCount, 1);
}

const comp = (fairDiv: number | null, cheapestDiv: number | null): ListingComp => ({
  listingId: "L1", fairDiv, cheapestDiv, samples: 8, searchUrl: null, checkedAt: "2026-09-29T10:00:00.000Z",
});

/** Verdict fixtures — one per rule, plus the boundaries between them. */
function testSellVerdict(): void {
  const rows = planLiquidation(
    [{ name: "Kulemak's Invitation", qty: 2 }, { name: "Headhunter", qty: 1 }, { name: "Doom Grip", qty: 1 }, { name: "Mageblood", qty: 1 }],
    planContext(new Map([["mageblood", 3.2]])),
  ).rows;
  const byName = (n: string): PlanRow => rows.find((r) => r.name === n)!;
  const v = (row: PlanRow, over: Partial<VerdictInput> = {}) =>
    sellVerdict({ row, askDiv: null, change7d: null, volume: null, comp: null, exPerDiv: 400, ...over });

  assert.deepEqual(v(byName("Doom Grip")), { verdict: "unpriced", targetDiv: null, reason: "no market price — run a reprice check" });
  const hold = v(byName("Kulemak's Invitation"), { change7d: 31, volume: 80 });
  assert.deepEqual([hold.verdict, hold.targetDiv, hold.reason], ["hold", null, "+31% 7d, rising — hold"]);
  assert.equal(v(byName("Kulemak's Invitation"), { change7d: 31, volume: 49 }).verdict, "sell-cx", "rising but illiquid → no hold");
  assert.equal(v(byName("Kulemak's Invitation"), { change7d: 24.9, volume: 500 }).verdict, "sell-cx", "+24.9% is under the hold bar");
  const cx = v(byName("Kulemak's Invitation"));
  assert.deepEqual([cx.verdict, cx.targetDiv], ["sell-cx", 2.5]);
  assert.match(cx.reason, /^safe exchange at 2\.5 div · ~<1h to fill$/);
  const listNew = v(byName("Headhunter"));
  assert.deepEqual(listNew, { verdict: "list", targetDiv: 40, reason: "list at 40 div (fair)" });
  assert.equal(v(byName("Headhunter"), { askDiv: 46 }).verdict, "list", "46 ≤ 40 × 1.15 → keep listing");
  assert.deepEqual(v(byName("Headhunter"), { askDiv: 11 }), { verdict: "list", targetDiv: 40, reason: "yours 11 div is 73% under 40 div fair" }, "an under-fair ask is flagged, never called fair");
  const over = v(byName("Headhunter"), { askDiv: 46.1 });
  assert.deepEqual([over.verdict, over.targetDiv, over.reason], ["reprice", 40, "yours 46.1 div is 15% over 40 div fair"]);
  const stuck = v(byName("Mageblood"), { askDiv: 5, comp: comp(3.2, 3.1) });
  assert.deepEqual(stuck, { verdict: "reprice", targetDiv: 3.2, reason: "cheapest 3.1 div · yours 5 div → reprice to 3.2 div" });
  const subDiv = v(byName("Mageblood"), { askDiv: 5, comp: comp(3.2, 0.5) });
  assert.match(subDiv.reason, /^cheapest 200 ex · /, "sub-Div amounts read in ex, never '0.5 div'");
  for (const r of rows) assert.ok(v(r, { askDiv: 999, comp: comp(1, 0.001), change7d: 1 }).reason.length <= 80, `${r.name}: reason ≤ 80 chars`);
}

function testSoldSince(): void {
  const L = (listingId: string | null, name: string, askDiv: number | null): ReadListing => ({ listingId, name, askDiv });
  const prev = [L("a", "Headhunter", 40), L("b", "Doom Grip", 3), L("c", "Rune", 0.2), L("d", "Rune", 0.2), L("e", "Omen", null)];
  const now = [L("a", "Headhunter", 40), L("d2", "Rune", 0.2), L("d", "Rune", 0.2)];
  const r = soldSince(prev, now, false);
  assert.deepEqual(r, { count: 2, askDiv: 3, names: ["Doom Grip", "Omen"] }, "a relisted Rune (new id, same count) is not a sale");
  const cut = soldSince(prev, [L("a", "Headhunter", 40)], true);
  assert.deepEqual(cut?.names, [], "truncated read: anything at/under the cheapest seen ask (40) may just be unread");
  const cutLow = soldSince([L("x", "Big", 50), L("y", "Small", 1)], [L("z", "Mid", 10)], true);
  assert.deepEqual(cutLow?.names, ["Big"], "only listings above the truncation floor count");
  assert.equal(soldSince([L(null, "Old", 5)], [], false), null, "pre-capture rows (no ids) → unknown, not 0");
  assert.deepEqual(soldSince([L("a", "X", null)], [], false), { count: 1, askDiv: null, names: ["X"] }, "no ask → askDiv null, never 0");
}

function testSessionDelta(): void {
  const s = (fetched_at: string, net_worth_div: number, source = "trade") => ({ fetched_at, net_worth_div, source });
  const snaps = [
    s("2026-09-29 08:00:00", 90), // yesterday's session, 7h before the next read
    s("2026-09-29 15:00:00", 100),
    s("2026-09-29 17:00:00", 50, "manual"), // other source — ignored, and does not bridge a gap
    s("2026-09-29 17:30:00", 105),
    s("2026-09-29 19:40:00", 112.4),
  ];
  const d = sessionDelta(snaps);
  assert.ok(d != null);
  assert.equal(d.startAt, "2026-09-29 15:00:00", "the 7h silence before 15:00 started this session");
  near(d.deltaDiv, 12.4, "112.4 − 100");
  near(d.deltaPct ?? NaN, 12.4, "12.4%");
  assert.equal(sessionDelta([s("2026-09-29 19:40:00", 5)]), null, "one read → no session delta yet");
  assert.equal(sessionDelta([s("2026-09-29 10:00:00", 5), s("2026-09-29 19:40:00", 9)]), null, "a 9h gap → a fresh session of one read");
  assert.equal(sessionDelta([s("2026-09-29 18:00:00", 0), s("2026-09-29 19:00:00", 9)])?.deltaPct, null, "from 0 Div → pct null");
  const manualLatest = sessionDelta([...snaps, s("2026-09-29 19:45:00", 60, "manual")]);
  assert.equal(manualLatest?.startAt, "2026-09-29 17:00:00", "like-with-like: a manual latest compares with manual entries only");
  assert.throws(() => sessionDelta([s("yesterday", 1)]), /unparseable/);
}

async function main(): Promise<void> {
  testCxQuote();
  testTradeQuote();
  testPlan();
  testSellVerdict();
  testSoldSince();
  testSessionDelta();
  await runWealthDbTests();
  assertPanelExport("src/components/wealth/SellPanel.tsx", "SellPanel", "src/components/shell/tabs/WealthTab.tsx");
  assertPanelExport("src/components/wealth/BalancePanel.tsx", "BalancePanel", "src/components/shell/tabs/WealthTab.tsx");
  console.log(
    "ALL PASS — cx + trade quotes, stash plan (comps > scout, unpriced null), sellVerdict fixtures, sold-since (relist, truncation), " +
      "session delta, balance_items + migrations, comps retention, reprice queue/cooldown/budget, cred state, sell contract, panel wiring",
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
