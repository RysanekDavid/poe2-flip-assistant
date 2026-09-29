/* trade2 fallback prices in the DB and the boss EV reader: scout first (uniques, then lineage),
 * trade2 only after both; a failed re-search keeps the last price at its true age; a thin market
 * stays unpriced with an accurate reason; the scout refresh still works beside trade rows.
 * Imported by testBossEv.ts; needs the temp DB (run after freshToolsDb). */
import assert from "node:assert/strict";
import { evaluateBosses } from "../../core/tools/bossEv/ev";
import { loadPriceInputs, priceLookup, referencedNinjaIds, resolvePrice } from "../../core/tools/bossEv/pricing";
import type { BossLootFile } from "../../core/tools/bossEv/schema";
import { scoutRows, storeScoutRows } from "../../core/valuation";
import { SCOUT_UNIQUE_SOURCE, scoutZeroKeys, upsertItemValues } from "../../db/marketQueries";
import { recordUniqueTradeFailure, recordUniqueTradeObservation, uniqueTradeChecksSince, uniqueTradeValues } from "../../db/uniqueTradeQueries";
import { bossViewSchema, resolvedPriceSchema, type LootLineView } from "../../lib/tools/bossEvContract";
import { scoutKey } from "../../lib/scoutKey";

const H = 3_600_000;
const NOW = Date.parse("2026-09-30T12:00:00Z");
const LEAGUE = "TRADE";
const iso = (hoursAgo: number): string => new Date(NOW - hoursAgo * H).toISOString();
const observe = (name: string, div: number | null, listed: number, samples: number, hoursAgo: number): void =>
  recordUniqueTradeObservation(LEAGUE, { nameKey: scoutKey(name), div, listed, samples, at: iso(hoursAgo) });

function seed(): void {
  // scout lists Sadist's Mercy at 0 and prices Decree of Loyalty; trade2 has both
  upsertItemValues(LEAGUE, [
    { nameKey: "sadist's mercy", div: 0, source: SCOUT_UNIQUE_SOURCE },
    { nameKey: "decree of loyalty", div: 3, source: SCOUT_UNIQUE_SOURCE },
  ]);
  observe("Sadist's Mercy", 5, 12, 9, 3);
  observe("Decree of Loyalty", 9, 20, 10, 1);
  observe("Olrovasara", 2, 30, 10, 20);
  recordUniqueTradeFailure(LEAGUE, scoutKey("Olrovasara"), "trade2 POST failed (503)", iso(1)); // keeps the 20h-old price
  recordUniqueTradeFailure(LEAGUE, scoutKey("The Auspex"), "trade2 POST failed (503)", iso(4)); // never observed
  observe("Prism of Belief", null, 2, 2, 6); // thin market
  observe("Beyond Reach", null, 0, 0, 2); // nothing listed
}

function lootLine(file: BossLootFile, name: string): LootLineView {
  const bosses = evaluateBosses(file, priceLookup(loadPriceInputs(LEAGUE, referencedNinjaIds(file), NOW)), new Map());
  const line = bosses.flatMap((b) => b.tiers.flatMap((t) => t.loot)).find((l) => l.name === name);
  assert.ok(line, `curated loot has ${name}`);
  for (const b of bosses) bossViewSchema.parse(b); // the client contract accepts trade prices
  return line;
}

function testReaders(file: BossLootFile): void {
  const sadist = lootLine(file, "Sadist's Mercy");
  assert.deepEqual(sadist.price, { div: 5, source: "trade", ageHours: 3, listed: 12, samples: 9 }, "scout at 0 → the trade2 price, with its listing count and age");
  assert.equal(sadist.unpricedReason, null);
  assert.equal(resolvedPriceSchema.parse(sadist.price).source, "trade");
  const decree = lootLine(file, "Decree of Loyalty").price;
  assert.deepEqual([decree?.div, decree?.source], [3, "scout"], "a positive scout price always wins over trade");
  const olro = lootLine(file, "Olrovasara");
  assert.deepEqual([olro.price?.div, olro.price?.source, olro.price?.ageHours], [2, "trade", 20], "a failed re-search keeps the last price at its true age");
  const auspex = lootLine(file, "The Auspex");
  assert.deepEqual([auspex.price, auspex.evDiv], [null, null], "failed and never observed: unpriced, never 0");
  assert.equal(auspex.unpricedReason, "not listed by poe2scout; trade search failed 4h ago: trade2 POST failed (503)");
  assert.equal(lootLine(file, "Prism of Belief").unpricedReason, "not listed by poe2scout; only 2 usable of 2 trade listing(s), too few to price (searched 6h ago)");
  assert.equal(lootLine(file, "Beyond Reach").unpricedReason, "not listed by poe2scout; no instant-buyout listings on trade (searched 2h ago)");
  assert.equal(lootLine(file, "Veilpiercer").unpricedReason, "not listed by poe2scout; not searched on trade yet");
}

function testPrecedence(): void {
  const trade = uniqueTradeValues(LEAGUE);
  const base = { ninja: new Map(), scout: new Map<string, number>(), scoutAgeHours: 5, lineage: new Map<string, number>(), lineageAgeHours: 7, scoutZero: new Set<string>(), trade, nowMs: NOW };
  const ref = { kind: "scout" as const, name: "Sadist’s Mercy" };
  assert.equal(resolvePrice(ref, base)?.source, "trade", "trade2 fills the gap (curly apostrophe still matches)");
  assert.deepEqual(resolvePrice(ref, { ...base, lineage: new Map([["sadist's mercy", 4]]) }), { div: 4, source: "scout", ageHours: 7 }, "the lineage list beats trade");
  assert.deepEqual(resolvePrice(ref, { ...base, scout: new Map([["sadist's mercy", 6]]) }), { div: 6, source: "scout", ageHours: 5 }, "scout uniques beat trade");
  assert.equal(resolvePrice({ kind: "scout", name: "Prism of Belief" }, base), null, "a stored null is no price");
}

function testStore(): void {
  assert.throws(() => recordUniqueTradeObservation(LEAGUE, { nameKey: "x", div: 0, listed: 3, samples: 3, at: iso(0) }), /non-positive price/, "0 is never stored as a price");
  const rows = uniqueTradeValues(LEAGUE);
  assert.deepEqual(rows.get("olrovasara")?.error, "trade2 POST failed (503)");
  assert.equal(rows.get("olrovasara")?.checkedAtMs, NOW - H, "the failed attempt moves checked_at");
  assert.equal(uniqueTradeChecksSince(NOW - 1.5 * H).length, 2, "rolling-hour ledger: attempts newer than the window (Decree 1h, Olrovasara 1h)");
  // the old item_values plan would have collided here: scout rewrites its 0 row beside the trade rows
  const r = storeScoutRows(LEAGUE, SCOUT_UNIQUE_SOURCE, scoutRows([{ name: "Sadist's Mercy", priceExalt: 0 }], 400, SCOUT_UNIQUE_SOURCE));
  assert.deepEqual(r, { written: 1, collided: [] }, "the scout refresh is unaffected by trade rows");
  assert.ok(scoutZeroKeys(LEAGUE).has("sadist's mercy"), "scout's 'listed at 0' fact survives");
}

export function runUniqueTradeDbCases(file: BossLootFile): void {
  seed();
  testReaders(file);
  testPrecedence();
  testStore();
}
