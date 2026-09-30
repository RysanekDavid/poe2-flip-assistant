/* trade2 fallback pricing for boss uniques poe2scout does not price — the pure half and the job:
 * price aggregation (bait, outliers, small n, unrated, never 0), candidate selection, the hourly
 * search cap (charged only for requests actually sent), the job's failure handling, the wire body,
 * the owner-cred/contact/expired-cookie rules and the source wording.
 * Imported by testBossEv.ts (npm run test:tools:boss-ev). */
import assert from "node:assert/strict";
import { TradeAuthError, TradeHttpError, TradeRateLimitedError } from "../../api/tradeErrors";
import type { Listing } from "../../api/tradeListing";
import type { UniqueOption } from "../../api/tradeMeta";
import type { FailureWrite, ObservationWrite, UniqueTradeRow } from "../../db/uniqueTradeQueries";
import { buildTradeQuery, type TradeQuery } from "../../lib/tradeLink";
import { scanCred } from "../../core/uniqueTrade/live";
import {
  curatedTradeNames, perTickOf, pickCandidates, searchSlots, TRADE_MIN_SAMPLES, TRADE_RETRY_AFTER_ERROR_MS, tradePriceFrom, tradeUniqueFor, uniqueTradeQuery,
} from "../../core/uniqueTrade/plan";
import { runUniqueTrade, uniqueTradeProblem, type UniqueTradeDeps } from "../../core/uniqueTrade/run";
import { fmtAgeHours, TRADE_DEFAULT_LEAGUE_ONLY, tradeSourceLabel, tradeSourceTitle, tradeUnpricedNote } from "../../core/tools/bossEv/tradeText";
import type { BossLootFile } from "../../core/tools/bossEv/schema";

const H = 3_600_000;
const NOW = Date.parse("2026-09-30T12:00:00Z");
const RATES = { exaltPerDivine: 400, chaosPerDivine: 20 };

let seq = 0;
/** An instant-buyout listing of `amount` `currency` (per item). */
export function tradeListing(amount: number | null, currency = "divine", over: Partial<Listing> = {}): Listing {
  seq += 1;
  return {
    listingId: `l${seq}`, price: amount == null ? null : { amount, currency }, account: "A", online: false, instantBuyout: true, indexed: null, whisper: null,
    itemName: "Sadist's Mercy", baseType: "Ring", rarity: "Unique", itemLevel: 80, corrupted: false, desecrated: false, mirrored: false, icon: null,
    stackSize: 0, mods: [], modLines: [], unreadableMods: 0, stash: null, ...over,
  };
}

function testAggregation(): void {
  const market = [5, 5.5, 6, 6, 6.5, 7, 8, 9, 12].map((d) => tradeListing(d));
  const clean = tradePriceFrom(market, 42, RATES);
  assert.deepEqual([clean.div, clean.listed, clean.samples, clean.dropped], [6.5, 42, 9, 0], "median of the cheapest listings, total from the search");
  const baited = tradePriceFrom([tradeListing(1, "exalted"), tradeListing(0.2), ...market], 44, RATES);
  assert.equal(baited.dropped, 2, "a 1-ex bait and a 0.2 div bait under 30% of the rest's median are dropped");
  assert.equal(baited.div, 6.5, "bait never drags the price down");
  const flood = tradePriceFrom([1, 1, 1, 1, 1, 6, 6, 7].map((d) => tradeListing(d)), 8, RATES);
  assert.deepEqual([flood.div, flood.dropped], [1, 0], "a floor of many cheap asks IS the market, not bait");
  assert.equal(tradePriceFrom([tradeListing(3), tradeListing(4)], 2, RATES).div, null, `fewer than ${TRADE_MIN_SAMPLES} usable listings: no price`);
  assert.deepEqual(tradePriceFrom([tradeListing(3), tradeListing(4)], 2, RATES).samples, 2);
  const empty = tradePriceFrom([], 0, RATES);
  assert.deepEqual([empty.div, empty.listed, empty.samples], [null, 0, 0], "nothing listed: null, never 0");
  const unrated = tradePriceFrom([tradeListing(3, "mirror"), tradeListing(4, "annul"), tradeListing(5), tradeListing(null)], 4, RATES);
  assert.deepEqual([unrated.div, unrated.samples], [null, 1], "off-ladder currencies and unpriced listings do not count");
  const unbuyable = [2, 3, 4].map((d) => tradeListing(d, "divine", { instantBuyout: false, online: false }));
  assert.equal(tradePriceFrom(unbuyable, 3, RATES).div, null, "offline, non-instant listings are not buyable comparables");
  assert.equal(tradePriceFrom([tradeListing(1600, "exalted"), tradeListing(1700, "exalted"), tradeListing(8)], 3, RATES).div, 4.25, "exalted asks convert at the league rate");
  assert.equal(tradePriceFrom([2, 3, 4].map((d) => tradeListing(d, "divine", { mirrored: true })), 3, RATES).div, null, "mirrored copies are a different product");
}


type StoredPick = Pick<UniqueTradeRow, "checkedAtMs" | "searchedAtMs" | "error">;
/** A stored attempt; `spent` = it sent a search request (a catalog miss does not). */
const row = (checkedAtMs: number, error: string | null = null, spent = true): StoredPick => ({ checkedAtMs, searchedAtMs: spent ? checkedAtMs : null, error });

function testCandidates(file: BossLootFile): void {
  const names = curatedTradeNames(file);
  for (const n of ["Sadist's Mercy", "The Auspex", "Prism of Belief", "Decree of Loyalty", "Olrovasara", "Beyond Reach"]) assert.ok(names.includes(n), `${n} is a trade candidate`);
  const lineage = file.bosses.flatMap((b) => b.tiers.flatMap((t) => t.loot.filter((l) => l.lineage).map((l) => l.name)));
  assert.ok(lineage.length > 0 && lineage.every((n) => !names.includes(n)), "lineage gems stay out: scout's lineage list prices them");
  assert.equal(new Set(names).size, names.length, "one entry per unique even when several bosses drop it");

  const refresh = 24 * H;
  const list = ["A", "B", "C", "D", "E", "F"];
  const stored = new Map([
    ["b", row(NOW - 30 * H)], // stale success: due
    ["c", row(NOW - 3 * H)], // fresh success: not due
    ["d", row(NOW - 3 * H, "trade2 503")], // failed search 3h ago: retried after 2h
    ["e", row(NOW - 1 * H, "trade2 503")], // failed search 1h ago: not yet
    ["f", row(NOW - 3 * H, `"F" is not in trade2's unique catalog`, false)], // catalog miss: waits the full refresh
  ]);
  assert.deepEqual(pickCandidates(list, new Set(["a"]), stored, NOW, refresh), ["B", "D"], "scout-priced and fresh names skipped; oldest attempt first");
  assert.deepEqual(pickCandidates(["F"], new Set(), new Map([["f", row(NOW - 25 * H, "miss", false)]]), NOW, refresh), ["F"], "a catalog miss is retried after a refresh");
  assert.deepEqual(pickCandidates(["Z", "B", "Y"], new Set(), stored, NOW, refresh), ["Z", "Y", "B"], "never-searched names come before any repeat");
  assert.deepEqual(pickCandidates(["Sadist’s Mercy"], new Set(["sadist's mercy"]), new Map(), NOW, refresh), [], "scout match is apostrophe-insensitive");
  assert.equal(TRADE_RETRY_AFTER_ERROR_MS, 2 * H);
}

function testBudget(): void {
  const ago = (min: number): number => NOW - min * 60_000;
  assert.equal(searchSlots([], NOW, 6, 1), 1, "one search per tick");
  assert.equal(searchSlots([ago(5), ago(15), ago(25), ago(35), ago(45)], NOW, 6, 1), 1, "five in the last hour: one slot left");
  assert.equal(searchSlots([ago(5), ago(15), ago(25), ago(35), ago(45), ago(55)], NOW, 6, 1), 0, "six in the last hour: cap reached");
  assert.equal(searchSlots([ago(61), ago(90)], NOW, 6, 1), 1, "older than an hour no longer counts");
  assert.equal(searchSlots([ago(1), ago(2)], NOW, 6, 5), 4, "a bigger tick share is still bounded by the cap");
  assert.equal(perTickOf(6, 10), 1, "6/h over 10-minute ticks = 1 per tick");
  assert.equal(perTickOf(12, 10), 2);
}

const CATALOG: UniqueOption[] = [
  { name: "Sadist's Mercy", type: "Ring" },
  { name: "The Auspex", type: "Amulet" },
  { name: "Twin", type: "Ring" },
  { name: "Twin", type: "Amulet" },
];

function testQuery(): void {
  assert.deepEqual(tradeUniqueFor("Sadist’s Mercy", CATALOG), { name: "Sadist's Mercy", type: "Ring" }, "trade2's own spelling and base");
  assert.deepEqual(tradeUniqueFor("Twin", CATALOG), { name: "Twin", type: "" }, "several bases: search by name alone");
  assert.equal(tradeUniqueFor("Nobody", CATALOG), null);
  assert.deepEqual(uniqueTradeQuery({ name: "The Auspex", type: "Amulet" }), { name: "The Auspex", type: "Amulet", rarity: "unique", instantBuyout: true, corrupted: false });
  assert.equal(uniqueTradeQuery({ name: "Twin", type: "" }).type, undefined);
  // the body trade2 actually receives: instant buyout, priced (PoE2's sale_type), uncorrupted
  const wire = buildTradeQuery(uniqueTradeQuery({ name: "The Auspex", type: "Amulet" }));
  assert.deepEqual(wire.status, { option: "securable" }, "instant buyout = status securable");
  assert.deepEqual(wire.filters, {
    type_filters: { filters: { rarity: { option: "unique" } } },
    misc_filters: { filters: { corrupted: { option: "false" } } },
    trade_filters: { filters: { sale_type: { option: "priced" } } },
  });
  assert.deepEqual([wire.name, wire.type, wire.stats], ["The Auspex", "Amulet", []]);
}

interface Fake {
  deps: UniqueTradeDeps;
  searched: TradeQuery[];
  observed: ObservationWrite[];
  failed: FailureWrite[];
}

type Answer = (q: TradeQuery) => Promise<{ total: number; listings: Listing[] }>;
const THREE_LISTINGS: Answer = async () => ({ total: 12, listings: [4, 5, 6].map((d) => tradeListing(d)) });

function fake(over: Partial<UniqueTradeDeps> = {}, answer: Answer = THREE_LISTINGS): Fake {
  const searched: TradeQuery[] = [];
  const observed: ObservationWrite[] = [];
  const failed: FailureWrite[] = [];
  const deps: UniqueTradeDeps = {
    league: "L", nowMs: NOW, names: ["Sadist's Mercy", "The Auspex", "Twin"], scoutPriced: new Set(), stored: new Map(), recentSearchesMs: [],
    capPerHour: 6, perTick: 1, refreshMs: 24 * H, rates: RATES, catalog: async () => CATALOG,
    search: (q) => {
      searched.push(q);
      return answer(q);
    },
    observe: (w) => void observed.push(w),
    fail: (w) => void failed.push(w),
    ...over,
  };
  return { deps, searched, observed, failed };
}

const AT = new Date(NOW).toISOString();

async function testRun(): Promise<void> {
  const one = fake();
  const r = await runUniqueTrade(one.deps);
  assert.equal(one.searched.length, 1, "one slot → exactly one search, however many are due");
  assert.equal(r.candidates, 3);
  assert.deepEqual(one.observed, [{ nameKey: "sadist's mercy", div: 5, listed: 12, samples: 3, at: AT }]);
  assert.deepEqual(r.priced, ["Sadist's Mercy"]);
  const capped = fake({ recentSearchesMs: Array.from({ length: 6 }, (_, i) => NOW - i * 60_000) });
  const cr = await runUniqueTrade(capped.deps);
  assert.deepEqual([capped.searched.length, cr.slots], [0, 0], "the rolling-hour cap blocks the tick");
  assert.equal(uniqueTradeProblem(cr), null, "a spent cap is pacing, not a failure");

  const missing = fake({ names: ["Nobody", "Ghost", "The Auspex"], perTick: 1 });
  const mr = await runUniqueTrade(missing.deps);
  assert.deepEqual(missing.failed, [
    { nameKey: "nobody", error: `"Nobody" is not in trade2's unique catalog`, at: AT, spent: false },
    { nameKey: "ghost", error: `"Ghost" is not in trade2's unique catalog`, at: AT, spent: false },
  ], "names trade2 does not know are recorded as no-spend attempts");
  assert.deepEqual([missing.searched.map((q) => q.name), mr.searches, mr.priced], [["The Auspex"], 1, ["The Auspex"]], "…costing no slot: the one slot still searches The Auspex");
  assert.equal(uniqueTradeProblem(mr), "not in trade2's unique catalog (fix the curated name): Nobody, Ghost", "misses turn the tick red, named, even though it priced");

  const thin = fake({}, async () => ({ total: 1, listings: [tradeListing(4)] }));
  const tr = await runUniqueTrade(thin.deps);
  assert.deepEqual([thin.observed[0]?.div, thin.observed[0]?.listed, tr.tooFew], [null, 1, ["Sadist's Mercy"]], "a thin market is stored as null, never 0");
  await testRunFailures();
}

async function testRunFailures(): Promise<void> {
  const flaky = fake({ perTick: 2 }, async (q) => {
    if (q.name === "Sadist's Mercy") throw new TradeHttpError("trade2 POST failed (503)", 503);
    return { total: 5, listings: [4, 5, 6].map((d) => tradeListing(d)) };
  });
  const fr = await runUniqueTrade(flaky.deps);
  assert.deepEqual(flaky.failed, [{ nameKey: "sadist's mercy", error: "trade2 POST failed (503)", at: AT, spent: true }], "a failed search is recorded on its row and charged");
  assert.deepEqual(fr.priced, ["The Auspex"], "…and the next unique is still tried");
  assert.equal(uniqueTradeProblem(fr), null, "a tick that priced something is not red");
  for (const err of [new TradeAuthError("post", "/search"), new TradeHttpError("trade2 rate-limited (429).", 429)]) {
    const dead = fake({ perTick: 3 }, async () => Promise.reject(err));
    const dr = await runUniqueTrade(dead.deps);
    assert.equal(dead.searched.length, 1, `${err.name}: the run stops — every further search would fail the same way`);
    assert.deepEqual(dead.failed.map((f) => [f.nameKey, f.spent]), [["sadist's mercy", true]], `${err.name}: the request went out, so it is charged to the ledger`);
    assert.match(uniqueTradeProblem(dr) ?? "", /^stopped — Sadist's Mercy/, `${err.name}: red`);
  }
  const busy = fake({ perTick: 3 }, async () => Promise.reject(new TradeRateLimitedError("search", 90_000)));
  const br = await runUniqueTrade(busy.deps);
  assert.deepEqual([busy.searched.length, busy.failed.length], [1, 0], "refused before sending: free, no row, the unique stays due");
  assert.deepEqual([br.deferred?.startsWith("Sadist's Mercy: trade2 search budget is busy"), uniqueTradeProblem(br)], [true, null], "a busy shared budget is pacing: retried next tick, not red");
  const allFail = fake({}, async () => Promise.reject(new TradeHttpError("trade2 400", 400)));
  assert.match(uniqueTradeProblem(await runUniqueTrade(allFail.deps)) ?? "", /1 unique\(s\) failed — Sadist's Mercy: trade2 400/, "only failures: red");
  const none = fake({ names: [] });
  assert.equal((await runUniqueTrade(none.deps)).candidates, 0);
  assert.equal(none.searched.length, 0, "nothing due: no catalog read, no search");
}

function testScanCred(): void {
  const stored = { id: 1, cred: { poesessid: "x", contact: "someone@personal.example", account: "Acc", source: "stored" as const } };
  assert.deepEqual(scanCred(stored, "ops@coach.example", "ok"), { cred: { poesessid: "x", source: "stored", contact: "ops@coach.example" } }, "the UA carries the operator contact, never the user's own");
  const noContact = scanCred(stored, " ", "ok");
  assert.ok("skip" in noContact && /DATA_SOURCE_CONTACT/.test(noContact.skip), "no operator contact: no request");
  assert.deepEqual(scanCred({ id: 1, cred: null }, "ops@coach.example", "unknown"), { skip: "owner has no POESESSID stored — no trade2 searches until one is saved in Settings" });
  const expired = scanCred(stored, "ops@coach.example", "expired");
  assert.ok("skip" in expired && /expired \(trade2 answered 403\).*save a fresh one/.test(expired.skip), "a stored cookie trade2 rejected is not tried again");
  assert.ok("cred" in scanCred(stored, "ops@coach.example", "unknown"), "a newly saved cookie (state reset to unknown) re-arms the job");
  const env = { id: 1, cred: { poesessid: "y", source: "env" as const } };
  assert.ok("cred" in scanCred(env, "ops@coach.example", "expired"), "the recorded state belongs to the stored cookie, not the .env one");
}

function testWording(): void {
  assert.deepEqual([fmtAgeHours(0.2), fmtAgeHours(7.4), fmtAgeHours(72)], ["<1h", "7h", "3d"]);
  assert.equal(tradeSourceLabel({ listed: 1234, ageHours: 3 }), "trade listings · 1,234 listed · 3h");
  assert.match(tradeSourceTitle({ listed: 14, samples: 9, ageHours: 3 }), /poe2scout has no price.*\n.*9 listing\(s\) behind it, 14 listed, searched 3h ago/);
  const at = NOW - 5 * H;
  const note = (over: Partial<UniqueTradeRow>): string => tradeUnpricedNote({ nameKey: "x", observed: null, checkedAtMs: at, searchedAtMs: at, error: null, ...over }, NOW);
  assert.equal(tradeUnpricedNote(null, NOW), "not searched on trade yet");
  assert.equal(note({ error: "trade2 503" }), "trade search failed 5h ago: trade2 503");
  assert.equal(note({ observed: { div: null, listed: 0, samples: 0, atMs: at } }), "no instant-buyout listings on trade (searched 5h ago)");
  assert.equal(note({ observed: { div: null, listed: 2, samples: 2, atMs: at } }), "only 2 usable of 2 trade listing(s), too few to price (searched 5h ago)");
  assert.throws(() => note({}), /no observation and no error/);
  assert.equal(TRADE_DEFAULT_LEAGUE_ONLY, "trade prices are gathered for the default league only");
}

export async function runUniqueTradeCases(file: BossLootFile): Promise<void> {
  testAggregation();
  testCandidates(file);
  testBudget();
  testQuery();
  await testRun();
  testScanCred();
  testWording();
}
