/* trade2 fallback prices in the DB and the boss EV reader: scout first (uniques, then lineage),
 * trade2 only after both; a failed re-search keeps the last price at its true age; a thin market
 * stays unpriced with an accurate reason; the search ledger counts only requests actually sent;
 * other leagues say the fallback is default-league only; the scout refresh still works beside
 * trade rows. Imported by testBossEv.ts; needs the temp DB (run after freshToolsDb). */
import assert from "node:assert/strict";
import { getDefaultLeague } from "../../core/leagueState";
import { evaluateBosses } from "../../core/tools/bossEv/ev";
import { loadPriceInputs, priceLookup, referencedNinjaIds, resolvePrice } from "../../core/tools/bossEv/pricing";
import type { BossLootFile } from "../../core/tools/bossEv/schema";
import { scoutRows, storeScoutRows } from "../../core/valuation";
import { SCOUT_UNIQUE_SOURCE, scoutZeroKeys, upsertItemValues } from "../../db/marketQueries";
import { recordUniqueTradeFailure, recordUniqueTradeObservation, uniqueTradeSearchesSince, uniqueTradeValues } from "../../db/uniqueTradeQueries";
import { bossViewSchema, resolvedPriceSchema, type LootLineView } from "../../lib/tools/bossEvContract";
import { scoutKey } from "../../lib/scoutKey";

const H = 3_600_000;
const NOW = Date.parse("2026-09-30T12:00:00Z");
const iso = (hoursAgo: number): string => new Date(NOW - hoursAgo * H).toISOString();

/** The trade2 job stores prices for the app's default league only, so the reader tests use it. */
function seed(league: string): void {
  const observe = (name: string, div: number | null, listed: number, samples: number, hoursAgo: number): void =>
    recordUniqueTradeObservation(league, { nameKey: scoutKey(name), div, listed, samples, at: iso(hoursAgo) });
  const fail = (name: string, error: string, hoursAgo: number, spent: boolean): void =>
    recordUniqueTradeFailure(league, { nameKey: scoutKey(name), error, at: iso(hoursAgo), spent });
  // scout lists Sadist's Mercy at 0 and prices Decree of Loyalty; trade2 has both
  upsertItemValues(league, [
    { nameKey: "sadist's mercy", div: 0, source: SCOUT_UNIQUE_SOURCE },
    { nameKey: "decree of loyalty", div: 3, source: SCOUT_UNIQUE_SOURCE },
  ]);
  observe("Sadist's Mercy", 5, 12, 9, 3);
  observe("Decree of Loyalty", 9, 20, 10, 1);
  observe("Olrovasara", 2, 30, 10, 20);
  fail("Olrovasara", "trade2 POST failed (503)", 0.5, true); // keeps the 20h-old price
  fail("The Auspex", "trade2 POST failed (503)", 4, true); // never observed
  fail("Svalinn", `"Svalinn" is not in trade2's unique catalog`, 0.25, false); // a catalog miss sent nothing
  observe("Prism of Belief", null, 2, 2, 6); // thin market
  observe("Beyond Reach", null, 0, 0, 2); // nothing listed
}

function lootLine(file: BossLootFile, league: string, name: string): LootLineView {
  const bosses = evaluateBosses(file, priceLookup(loadPriceInputs(league, referencedNinjaIds(file), NOW)), new Map());
  const line = bosses.flatMap((b) => b.tiers.flatMap((t) => t.loot)).find((l) => l.name === name);
  assert.ok(line, `curated loot has ${name}`);
  for (const b of bosses) bossViewSchema.parse(b); // the client contract accepts trade prices
  return line;
}

function testReaders(file: BossLootFile, league: string): void {
  const sadist = lootLine(file, league, "Sadist's Mercy");
  assert.deepEqual(sadist.price, { div: 5, source: "trade", ageHours: 3, listed: 12, samples: 9 }, "scout at 0 → the trade2 price, with its listing count and age");
  assert.equal(sadist.unpricedReason, null);
  assert.equal(resolvedPriceSchema.parse(sadist.price).source, "trade");
  const decree = lootLine(file, league, "Decree of Loyalty").price;
  assert.deepEqual([decree?.div, decree?.source], [3, "scout"], "a positive scout price always wins over trade");
  const olro = lootLine(file, league, "Olrovasara");
  assert.deepEqual([olro.price?.div, olro.price?.source, olro.price?.ageHours], [2, "trade", 20], "a failed re-search keeps the last price at its true age");
  const auspex = lootLine(file, league, "The Auspex");
  assert.deepEqual([auspex.price, auspex.evDiv], [null, null], "failed and never observed: unpriced, never 0");
  assert.equal(auspex.unpricedReason, "not listed by poe2scout; trade search failed 4h ago: trade2 POST failed (503)");
  assert.equal(lootLine(file, league, "Svalinn").unpricedReason, `not listed by poe2scout; not searchable on trade (checked <1h ago): "Svalinn" is not in trade2's unique catalog`);
  assert.equal(lootLine(file, league, "Prism of Belief").unpricedReason, "not listed by poe2scout; only 2 usable of 2 trade listing(s), too few to price (searched 6h ago)");
  assert.equal(lootLine(file, league, "Beyond Reach").unpricedReason, "not listed by poe2scout; no instant-buyout listings on trade (searched 2h ago)");
  assert.equal(lootLine(file, league, "Veilpiercer").unpricedReason, "not listed by poe2scout; not searched on trade yet");
}

/** A user pinned to another league: rows stored there (a former default) are not read, and the reason says why. */
function testOtherLeague(file: BossLootFile): void {
  const other = `${getDefaultLeague()} (pinned elsewhere)`;
  recordUniqueTradeObservation(other, { nameKey: "sadist's mercy", div: 5, listed: 12, samples: 9, at: iso(3) });
  const line = lootLine(file, other, "Sadist's Mercy");
  assert.equal(line.price, null, "no trade fallback outside the default league");
  assert.equal(line.unpricedReason, "not listed by poe2scout; trade prices are gathered for the default league only");
  assert.equal(loadPriceInputs(other, new Set(), NOW).tradeFallback, false);
}

function testPrecedence(league: string): void {
  const trade = uniqueTradeValues(league);
  const base = {
    ninja: new Map(), scout: new Map<string, number>(), scoutAgeHours: 5, lineage: new Map<string, number>(), lineageAgeHours: 7, scoutZero: new Set<string>(), trade, tradeFallback: true, nowMs: NOW,
  };
  const ref = { kind: "scout" as const, name: "Sadist’s Mercy" };
  assert.equal(resolvePrice(ref, base)?.source, "trade", "trade2 fills the gap (curly apostrophe still matches)");
  assert.deepEqual(resolvePrice(ref, { ...base, lineage: new Map([["sadist's mercy", 4]]) }), { div: 4, source: "scout", ageHours: 7 }, "the lineage list beats trade");
  assert.deepEqual(resolvePrice(ref, { ...base, scout: new Map([["sadist's mercy", 6]]) }), { div: 6, source: "scout", ageHours: 5 }, "scout uniques beat trade");
  assert.equal(resolvePrice({ kind: "scout", name: "Prism of Belief" }, base), null, "a stored null is no price");
  assert.equal(resolvePrice(ref, { ...base, tradeFallback: false }), null, "the flag gates the fallback even when rows exist");
}

function testLedger(league: string): void {
  assert.throws(() => recordUniqueTradeObservation(league, { nameKey: "x", div: 0, listed: 3, samples: 3, at: iso(0) }), /non-positive price/, "0 is never stored as a price");
  const rows = uniqueTradeValues(league);
  assert.equal(rows.get("olrovasara")?.error, "trade2 POST failed (503)");
  assert.deepEqual([rows.get("olrovasara")?.checkedAtMs, rows.get("olrovasara")?.searchedAtMs], [NOW - 0.5 * H, NOW - 0.5 * H], "a failed search is an attempt AND a spend");
  assert.deepEqual([rows.get("svalinn")?.checkedAtMs, rows.get("svalinn")?.searchedAtMs], [NOW - 0.25 * H, null], "a catalog miss is an attempt, never a spend");
  // Decree 1h + Olrovasara 0.5h; the Svalinn miss (0.25h) sent nothing and is not charged
  assert.deepEqual(uniqueTradeSearchesSince(NOW - 1.5 * H).sort(), [NOW - H, NOW - 0.5 * H], "the cap counts requests actually sent");
  recordUniqueTradeFailure(league, { nameKey: "olrovasara", error: `"Olrovasara" gone from the catalog`, at: iso(0.1), spent: false });
  assert.equal(uniqueTradeValues(league).get("olrovasara")?.searchedAtMs, NOW - 0.5 * H, "a later no-spend attempt keeps the last real spend");
  // the old item_values plan would have collided here: scout rewrites its 0 row beside the trade rows
  const r = storeScoutRows(league, SCOUT_UNIQUE_SOURCE, scoutRows([{ name: "Sadist's Mercy", priceExalt: 0 }], 400, SCOUT_UNIQUE_SOURCE));
  assert.deepEqual(r, { written: 1, collided: [] }, "the scout refresh is unaffected by trade rows");
  assert.ok(scoutZeroKeys(league).has("sadist's mercy"), "scout's 'listed at 0' fact survives");
}

export function runUniqueTradeDbCases(file: BossLootFile): void {
  const league = getDefaultLeague();
  seed(league);
  testReaders(file, league);
  testOtherLeague(file);
  testPrecedence(league);
  testLedger(league);
}
