/* Liquidate: exchange quote (denomination, cap, grid, fee, ETA), mixed-input plan, bundle text,
 * balance_items storage + latest read + retention + cascade, and the trade2 fixture → scanned
 * items with a value source. Run: npm run test:tools:liquidate */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type Database from "better-sqlite3";
import { scanListings, type ScannedItem } from "../../api/accountScan";
import { parseFetchResponse, type Listing } from "../../api/tradeListing";
import type { PricedItem } from "../../api/types";
import type { CxItemStats } from "../../core/cx/cxPersistence";
import { bundleText } from "../../core/tools/liquidate/bundle";
import { cxSellQuote } from "../../core/tools/liquidate/cxRoute";
import { groupStashItems, planLiquidation, type PlanContext } from "../../core/tools/liquidate/plan";
import { stashNote, tradeListingQuote } from "../../core/tools/liquidate/tradeRoute";
import { BALANCE_ITEMS_KEEP_SNAPSHOTS, insertBalanceItems, latestStashItems } from "../../db/balanceItemQueries";
import { liquidateRequestSchema } from "../../lib/tools/liquidateContract";
import { assertToolPanel, columnsOf, freshToolsDb, insertUser } from "./toolsTestKit";

const RATES = { exaltPerDivine: 400, chaosPerDivine: 20 };
const GOLD_PER_EX = 5000;
const near = (a: number, b: number, msg: string): void => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} ≠ ${b}`);

function cxStats(midDiv: number, marketUnitsPerHour: number): CxItemStats {
  return { newestHour: 1_790_000_000, midDiv, bandDiv: null, marketUnitsPerHour, edge: null, issue: null, rawNetPct: null };
}

function line(itemId: string, itemName: string, baseValue: number, volume: number): PricedItem {
  return { itemId, itemName, category: "Currency", baseValue, volume, change7d: null, spark7d: null, icon: `https://icon/${itemId}.png` };
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
  assert.equal(coarseDiv.feeComplete, true);
  near(coarseDiv.etaHours ?? NaN, 1 / (100 * 0.1), "ETA = qty / (flow × share)");
  assert.equal(coarseDiv.tier, "risky", "150 Div/h observed");
  assert.equal(coarseDiv.observed, true);
  assert.deepEqual(coarseDiv.warnings, []);
  // Both grids fine → the cheaper fee: 10 Div as 10 Divines (8,000 gold) beats 200 Chaos (32,000).
  assert.equal(quote(10, cxStats(10, 500), 1).denom.unit, "DIVINE");
  // Cap: 1,000 × 0.01 Div = 4,000 Ex received is over the 200-item cap even though Ex is cheapest in gold.
  const capped = quote(0.01, cxStats(0.01, 5000), 1000);
  assert.equal(capped.denom.unit, "DIVINE");
  near(capped.receiveUnits, 10, "receives 10 Divines");
  // Only Exalted keeps ≥ 1 whole unit, and its 1:3 grid is coarse → kept, but warned.
  const coarse = quote(3 / 400, cxStats(3 / 400, 2000), 5);
  assert.equal(coarse.denom.unit, "EXALT");
  assert.ok(coarse.gridStepPct > 30);
  assert.ok(coarse.warnings.some((w) => w.startsWith("coarse price grid")), coarse.warnings.join(" | "));
  // Huge order: 10,000 units at 5 units/h filled → days, and the treasury "split it" wording.
  const huge = quote(0.001, cxStats(0.001, 50), 10_000);
  near(huge.etaHours ?? NaN, 2000, "10000 / (50 × 10%)");
  assert.ok(huge.warnings.some((w) => w.includes("days to clear") && w.includes("split it, or take market")));
  // No exchange history: ninja mid, no ETA, flagged.
  const blind = quote(2, null, 3);
  assert.equal(blind.observed, false);
  assert.equal(blind.midSource, "ninja");
  assert.equal(blind.etaHours, null);
  assert.equal(blind.unitsPerHour, null);
  assert.ok(blind.warnings.some((w) => w.includes("no fresh exchange history")));
  // An unusable gold valuation makes the fee unknown — never 0.
  const unknownFee = quote(10, cxStats(10, 500), 1, 0);
  assert.equal(unknownFee.feeComplete, false);
  assert.equal(unknownFee.feeDivPerUnit, null);
  assert.ok(unknownFee.warnings.some((w) => w.includes("gold fee could not be priced")));
  near(quote(2, cxStats(2, 500), 1).fastDiv, 2 * 0.95, "fast = mid × recommendOffsets(500) discount");
}

function testTradeQuote(): void {
  const t = tradeListingQuote(2.5, 4, { listed: 45, sellThrough: 0.01, samples: 7 }, RATES);
  near(t.quickDiv, 2.25, "quick 0.9×");
  near(t.patientDiv, 2.75, "patient 1.1×");
  assert.equal(t.note, "~price 50 chaos", "2.5 Div = 1,000 Ex > cap → 50 Chaos (treasury denominate)");
  assert.ok(t.competitionNote?.includes("45 listed") && t.competitionNote.includes("slow sell-through"));
  assert.equal(stashNote(0.1, RATES).note, "~price 40 exalted", "0.1 Div = 40 Ex (under the 200 cap)");
  assert.equal(stashNote(4, RATES).note, "~price 80 chaos", "4 Div = 1,600 Ex > cap → 80 Chaos");
  assert.equal(stashNote(25, RATES).note, "~price 25 divine");
  assert.throws(() => tradeListingQuote(0, 1, null, RATES), /positive value/);
}

function planContext(): PlanContext {
  const kulemak = line("kulemak", "Kulemak's Invitation", 2.5, 800);
  const dust = line("dust", "Thin Dust", 0.05, 1);
  return {
    rates: RATES,
    ninjaByName: new Map([[kulemak.itemName.toLowerCase(), kulemak], [dust.itemName.toLowerCase(), dust]]),
    cxByItemId: new Map([["kulemak", cxStats(2.5, 1000)]]), // 2,500 Div/h → safe
    uniqueDiv: new Map([["headhunter", 40]]),
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
      { name: "Rune Loop", qty: 2, manualDiv: 3 },
      { name: "Thin Dust", qty: 10 },
      { name: "Kulemak's Invitation ", qty: 6, manualDiv: 9 },
    ],
    planContext(),
  );
  assert.deepEqual(plan.rows.map((r) => [r.name, r.qty, r.recommended, r.valueSource]), [
    ["Kulemak's Invitation", 10, "cx", "cx"],
    ["Headhunter", 1, "trade", "scout"],
    ["Doom Grip", 1, "manual", "none"],
    ["Rune Loop", 2, "trade", "manual"],
    ["Thin Dust", 10, "trade", "ninja"],
  ], "duplicates merge (case/space-insensitive), each input lands on its route");
  const kul = plan.rows[0]!;
  assert.ok(kul.warnings.some((w) => w.includes("ignored")), "a manual value on an exchange item is ignored loudly");
  assert.equal(plan.rows[1]!.icon, "https://icon/hh.png");
  assert.equal(plan.rows[1]!.trade?.competition?.listed, 12);
  assert.ok(plan.rows[4]!.reason.startsWith("exchange too thin"), "thin exchange market → trade");
  assert.ok(plan.rows[4]!.cx?.observed === false);
  const fee = kul.feeTotalDiv ?? NaN;
  near(kul.fastTotalDiv ?? NaN, kul.cx!.fastDiv * 10 - fee, "fast total is net of the fee");
  const t = plan.totals;
  assert.equal(t.unpricedCount, 1);
  assert.equal(t.feeIncompleteCount, 0);
  near(t.feeDiv, fee, "only the exchange row carries a fee");
  near(t.fastDiv, plan.rows.reduce((s, r) => s + (r.fastTotalDiv ?? 0), 0), "fast total sums the priced rows");

  const bundle = bundleText(plan, RATES);
  assert.equal(bundle.whisper, "WTS Headhunter @ 40 div · 2x Rune Loop @ 60 chaos (120 chaos) · 10x Thin Dust @ 20 ex (200 ex)");
  assert.deepEqual(bundle.notes, [
    { name: "Headhunter", note: "~price 40 divine" },
    { name: "Rune Loop", note: "~price 60 chaos" },
    { name: "Thin Dust", note: "~price 20 exalted" },
  ]);
  assert.deepEqual(bundleText({ rows: [kul], totals: t }, RATES), { whisper: "", notes: [] }, "exchange rows are not advertised");
  assert.equal(liquidateRequestSchema.safeParse({ items: [{ name: "x", qty: 0 }] }).success, false, "qty ≥ 1");
  assert.equal(liquidateRequestSchema.safeParse({ items: [] }).success, false, "at least one item");
}

function snapshotFor(db: Database.Database, userId: number, league: string, hoursAgo: number): number {
  const r = db
    .prepare(
      `INSERT INTO balance_snapshots (user_id, league, exalt_per_div, chaos_per_div, net_worth_div, source, listed_seen, fetched_at)
       VALUES (?, ?, 400, 20, 0, 'trade', 2, datetime('now', ?))`,
    )
    .run(userId, league, `-${hoursAgo} hours`);
  return Number(r.lastInsertRowid);
}

const scanned = (itemName: string, stackSize: number, marketDiv: number | null, source: ScannedItem["marketSource"]): ScannedItem => ({
  tab: "sell", itemName, baseType: itemName, rarity: null, stackSize, marketDiv, marketSource: source, ask: { amount: 2, currency: "divine" },
});

function testBalanceItems(): void {
  const db = freshToolsDb();
  assert.deepEqual(columnsOf(db, "balance_items"), [
    "id", "snapshot_id", "tab", "item_name", "base_type", "rarity", "stack_size",
    "market_div", "market_source", "ask_amount", "ask_currency",
  ]);
  const me = insertUser(db, "seller");
  const other = insertUser(db, "other");
  assert.deepEqual(latestStashItems(me, "L"), { snapshot: null, items: [] });
  const ids: number[] = [];
  for (let i = BALANCE_ITEMS_KEEP_SNAPSHOTS + 2; i >= 1; i--) {
    const id = snapshotFor(db, me, "L", i);
    insertBalanceItems(id, [scanned(`Item ${i}`, 3, 1.5, "ninja"), scanned("Divine Orb", 5, 5, "ladder")]);
    ids.push(id);
  }
  const theirs = snapshotFor(db, other, "L", 100);
  insertBalanceItems(theirs, [scanned("Their Item", 1, null, null)]);
  const latest = latestStashItems(me, "L");
  assert.equal(latest.snapshot?.id, ids[ids.length - 1], "newest trade read");
  assert.deepEqual(latest.items.map((r) => [r.item_name, r.stack_size, r.market_source, r.ask_amount]), [
    ["Item 1", 3, "ninja", 2], ["Divine Orb", 5, "ladder", 2],
  ]);
  const withItems = db.prepare("SELECT COUNT(DISTINCT snapshot_id) c FROM balance_items WHERE snapshot_id != ?").get(theirs) as { c: number };
  assert.equal(withItems.c, BALANCE_ITEMS_KEEP_SNAPSHOTS, "item rows of older reads are trimmed");
  assert.equal(latestStashItems(other, "L").items.length, 1, "another user's rows are never trimmed");
  db.prepare("DELETE FROM balance_snapshots WHERE id = ?").run(ids[ids.length - 1]);
  assert.equal(latestStashItems(me, "L").items[0]?.item_name, "Item 2", "a deleted snapshot takes its items with it (cascade)");
  const grouped = groupStashItems(latestStashItems(me, "L").items, RATES);
  assert.equal(grouped.skippedOrbs, 1, "raw orbs are never offered");
  assert.deepEqual(grouped.items, [
    { name: "Item 2", qty: 3, rarity: null, tabs: ["sell"], marketDiv: 1.5, marketSource: "ninja", askDiv: 2 / 3 },
  ]);
}

function fixtureListings(): Listing[] {
  const listings = parseFetchResponse(JSON.parse(readFileSync(resolve("src/scripts/fixtures/trade2-fetch-shape.json"), "utf8")));
  const orb: Listing = { ...listings[0]!, listingId: "fx-orbs", itemName: "Exalted Orb", baseType: "Exalted Orb", rarity: "Currency", stackSize: 800, price: null, stash: "currency" };
  return [...listings, orb];
}

function testAccountScanItems(): void {
  const valuer = { value: (name: string, stack: number) => (name === "Twin Grasp" ? { div: 5 * Math.max(1, stack), source: "scout" as const } : null) };
  const scan = scanListings(fixtureListings(), 9, RATES, valuer);
  assert.equal(scan.items.length, 6, "one item per listing read, orbs included");
  const by = (name: string): ScannedItem => {
    const it = scan.items.find((i) => i.itemName === name);
    if (!it) throw new Error(`scanned item ${name} missing`);
    return it;
  };
  assert.deepEqual([by("Twin Grasp").marketDiv, by("Twin Grasp").marketSource], [5, "scout"], "market value wins over the ask");
  assert.deepEqual([by("Doom Grip").marketDiv, by("Doom Grip").marketSource, by("Doom Grip").tab], [3, "ask", "sell"]);
  assert.deepEqual([by("Rune Loop").marketDiv, by("Rune Loop").marketSource, by("Rune Loop").ask], [null, null, null], "no price, no market → unpriced");
  assert.equal(by("Odd Price").marketSource, null, "an off-ladder ask is unpriced");
  assert.deepEqual([by("Exalted Orb").marketDiv, by("Exalted Orb").marketSource, by("Exalted Orb").stackSize], [2, "ladder", 800]);
  assert.equal(by("Doom Grip").stackSize, 1, "non-stackable listing counts as one");
  assert.equal(scan.exalted, 800);
  assert.equal(scan.unpriced, 2);
}

testCxQuote();
testTradeQuote();
testPlan();
testBalanceItems();
testAccountScanItems();
assertToolPanel("liquidate", "LiquidateTool");
console.log("ALL PASS — cx quote (denomination, cap, grid, fee, ETA), trade quote, plan + bundle, balance_items retention + cascade, trade2 fixture items, panel wiring");
