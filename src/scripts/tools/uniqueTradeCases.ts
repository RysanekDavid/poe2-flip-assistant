/* trade2 fallback pricing for boss uniques poe2scout does not price — the pure half and the job:
 * price aggregation (bait, outliers, small n, unrated, never 0), candidate selection, the hourly
 * search cap, the job's failure handling, the owner-cred/contact rules and the source wording.
 * Imported by testBossEv.ts (npm run test:tools:boss-ev). */
import assert from "node:assert/strict";
import { TradeAuthError, TradeHttpError, TradeRateLimitedError } from "../../api/tradeErrors";
import type { Listing } from "../../api/tradeListing";
import type { UniqueOption } from "../../api/tradeMeta";
import type { ObservationWrite, UniqueTradeRow } from "../../db/uniqueTradeQueries";
import type { TradeQuery } from "../../lib/tradeLink";
import { scanCred } from "../../core/uniqueTrade/live";
import {
  curatedTradeNames, perTickOf, pickCandidates, searchSlots, TRADE_MIN_SAMPLES, TRADE_RETRY_AFTER_ERROR_MS, tradePriceFrom, tradeUniqueFor, uniqueTradeQuery,
} from "../../core/uniqueTrade/plan";
import { runUniqueTrade, uniqueTradeProblem, type UniqueTradeDeps } from "../../core/uniqueTrade/run";
import { fmtAgeHours, tradeSourceLabel, tradeSourceTitle, tradeUnpricedNote } from "../../core/tools/bossEv/tradeText";
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

const row = (checkedAtMs: number, error: string | null = null): Pick<UniqueTradeRow, "checkedAtMs" | "error"> => ({ checkedAtMs, error });

function testCandidates(file: BossLootFile): void {
  const names = curatedTradeNames(file);
  for (const n of ["Sadist's Mercy", "The Auspex", "Prism of Belief", "Decree of Loyalty", "Olrovasara", "Beyond Reach"]) assert.ok(names.includes(n), `${n} is a trade candidate`);
  const lineage = file.bosses.flatMap((b) => b.tiers.flatMap((t) => t.loot.filter((l) => l.lineage).map((l) => l.name)));
  assert.ok(lineage.length > 0 && lineage.every((n) => !names.includes(n)), "lineage gems stay out: scout's lineage list prices them");
  assert.equal(new Set(names).size, names.length, "one entry per unique even when several bosses drop it");

  const refresh = 24 * H;
  const list = ["A", "B", "C", "D", "E"];
  const stored = new Map([
    ["b", row(NOW - 30 * H)], // stale success: due
    ["c", row(NOW - 3 * H)], // fresh success: not due
    ["d", row(NOW - 3 * H, "trade2 503")], // failed 3h ago: retried after 2h
    ["e", row(NOW - 1 * H, "trade2 503")], // failed 1h ago: not yet
  ]);
  assert.deepEqual(pickCandidates(list, new Set(["a"]), stored, NOW, refresh), ["B", "D"], "scout-priced and fresh names skipped; oldest attempt first");
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
}

interface Fake {
  deps: UniqueTradeDeps;
  searched: TradeQuery[];
  observed: ObservationWrite[];
  failed: Array<{ nameKey: string; error: string }>;
}

type Answer = (q: TradeQuery) => Promise<{ total: number; listings: Listing[] }>;
const THREE_LISTINGS: Answer = async () => ({ total: 12, listings: [4, 5, 6].map((d) => tradeListing(d)) });

function fake(over: Partial<UniqueTradeDeps> = {}, answer: Answer = THREE_LISTINGS): Fake {
  const searched: TradeQuery[] = [];
  const observed: ObservationWrite[] = [];
  const failed: Fake["failed"] = [];
  const deps: UniqueTradeDeps = {
    league: "L", nowMs: NOW, names: ["Sadist's Mercy", "The Auspex", "Twin"], scoutPriced: new Set(), stored: new Map(), recentChecksMs: [],
    capPerHour: 6, perTick: 1, refreshMs: 24 * H, rates: RATES, catalog: async () => CATALOG,
    search: (q) => {
      searched.push(q);
      return answer(q);
    },
    observe: (w) => void observed.push(w),
    fail: (nameKey, error) => void failed.push({ nameKey, error }),
    ...over,
  };
  return { deps, searched, observed, failed };
}

async function testRun(): Promise<void> {
  const one = fake();
  const r = await runUniqueTrade(one.deps);
  assert.equal(one.searched.length, 1, "one slot → exactly one search, however many are due");
  assert.equal(r.candidates, 3);
  assert.deepEqual(one.observed, [{ nameKey: "sadist's mercy", div: 5, listed: 12, samples: 3, at: new Date(NOW).toISOString() }]);
  assert.deepEqual(r.priced, ["Sadist's Mercy"]);
  const capped = fake({ recentChecksMs: Array.from({ length: 6 }, (_, i) => NOW - i * 60_000) });
  const cr = await runUniqueTrade(capped.deps);
  assert.deepEqual([capped.searched.length, cr.slots], [0, 0], "the rolling-hour cap blocks the tick");
  assert.equal(uniqueTradeProblem(cr), null, "a spent cap is pacing, not a failure");

  const missing = fake({ names: ["Nobody", "The Auspex"], perTick: 1 });
  const mr = await runUniqueTrade(missing.deps);
  assert.deepEqual(missing.failed.map((x) => x.nameKey), ["nobody"], "a name trade2 does not know is recorded without spending a search");
  assert.equal(missing.searched[0]?.name, "The Auspex", "…and the slot goes to the next candidate");
  assert.equal(mr.errors.length, 1);

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
  assert.deepEqual(flaky.failed, [{ nameKey: "sadist's mercy", error: "trade2 POST failed (503)" }], "a per-unique failure is recorded on its row");
  assert.deepEqual(fr.priced, ["The Auspex"], "…and the next unique is still tried");
  assert.equal(uniqueTradeProblem(fr), null, "a tick that priced something is not red");
  for (const err of [new TradeAuthError("post", "/search"), new TradeRateLimitedError("search", 90_000), new TradeHttpError("429", 429)]) {
    const dead = fake({ perTick: 3 }, async () => Promise.reject(err));
    const dr = await runUniqueTrade(dead.deps);
    assert.equal(dead.searched.length, 1, `${err.name}: the run stops — every further search would fail the same way`);
    assert.equal(dead.failed.length, 0, "a refused or rejected search leaves the row due");
    if (err instanceof TradeRateLimitedError) {
      assert.deepEqual([dr.deferred?.startsWith("Sadist's Mercy: trade2 search budget is busy"), uniqueTradeProblem(dr)], [true, null], "a busy shared budget is pacing: retried next tick, not red");
    } else {
      assert.match(uniqueTradeProblem(dr) ?? "", /^stopped — Sadist's Mercy/, `${err.name}: red`);
    }
  }
  const allFail = fake({}, async () => Promise.reject(new TradeHttpError("trade2 400", 400)));
  assert.match(uniqueTradeProblem(await runUniqueTrade(allFail.deps)) ?? "", /1 unique\(s\) failed — Sadist's Mercy: trade2 400/, "only failures: red");
  const none = fake({ names: [] });
  assert.equal((await runUniqueTrade(none.deps)).candidates, 0);
  assert.equal(none.searched.length, 0, "nothing due: no catalog read, no search");
}

function testCredAndWording(): void {
  const owner = { id: 1, cred: { poesessid: "x", contact: "someone@personal.example", account: "Acc", source: "stored" as const } };
  assert.deepEqual(scanCred(owner, "ops@coach.example"), { cred: { poesessid: "x", source: "stored", contact: "ops@coach.example" } }, "the UA carries the operator contact, never the user's own");
  const noContact = scanCred(owner, " ");
  assert.ok("skip" in noContact && /DATA_SOURCE_CONTACT/.test(noContact.skip), "no operator contact: no request");
  assert.deepEqual(scanCred({ id: 1, cred: null }, "ops@coach.example"), { skip: "owner has no POESESSID stored — no trade2 searches until one is saved in Settings" });

  assert.deepEqual([fmtAgeHours(0.2), fmtAgeHours(7.4), fmtAgeHours(72)], ["<1h", "7h", "3d"]);
  assert.equal(tradeSourceLabel({ listed: 1234, ageHours: 3 }), "trade listings · 1,234 listed · 3h");
  assert.match(tradeSourceTitle({ listed: 14, samples: 9, ageHours: 3 }), /poe2scout has no price.*\n.*9 listing\(s\) behind it, 14 listed, searched 3h ago/);
  const at = NOW - 5 * H;
  assert.equal(tradeUnpricedNote(null, NOW), "not searched on trade yet");
  assert.equal(tradeUnpricedNote({ nameKey: "x", observed: null, checkedAtMs: at, error: "trade2 503" }, NOW), "trade search failed 5h ago: trade2 503");
  assert.equal(tradeUnpricedNote({ nameKey: "x", observed: { div: null, listed: 0, samples: 0, atMs: at }, checkedAtMs: at, error: null }, NOW), "no instant-buyout listings on trade (searched 5h ago)");
  assert.equal(
    tradeUnpricedNote({ nameKey: "x", observed: { div: null, listed: 2, samples: 2, atMs: at }, checkedAtMs: at, error: null }, NOW),
    "only 2 usable of 2 trade listing(s), too few to price (searched 5h ago)",
  );
  assert.throws(() => tradeUnpricedNote({ nameKey: "x", observed: null, checkedAtMs: at, error: null }, NOW), /no observation and no error/);
}

export async function runUniqueTradeCases(file: BossLootFile): Promise<void> {
  testAggregation();
  testCandidates(file);
  testBudget();
  testQuery();
  await testRun();
  testCredAndWording();
}
