/* Currency-exchange rate derivation, storage and the resolution ladder, against a TEMP DB.
 * Run: npm run test:rates (src/scripts/runWithTestEnv.ts sets DB_PATH).
 *
 * NO NETWORK: every digest comes from the captured fixture, every client is stubbed. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "../db/database";
import { config } from "../config/env";
import {
  CX_CURRENCY_IDS,
  cxLeagues,
  deriveCxRates,
  isPrivateLeague,
  parseCxDigest,
  previousCompletedHour,
  type CxDigest,
} from "../api/cxClient";
import { insertSnapshots } from "../db/marketQueries";
import { latestRates, timestampAgeMs, upsertCurrencyRates } from "../db/ratesQueries";
import { resolveRates } from "../core/rates";
import { bootstrapRatesForLeague, refreshCxRatesIfStale, type RateSources } from "../core/rateSync";
import type { LeagueOption } from "../api/types";
import type { PricedItem } from "../api/types";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

/** Captured live 2026-09-16: Forbidden Rites + Standard core pairs and two private leagues. */
const FIXTURE: unknown = JSON.parse(readFileSync(join(process.cwd(), "src/data/test/cx-digest.fixture.json"), "utf8"));

const FR = "Forbidden Rites";
const HOUR = 3600;

/**
 * "Now", anchored to the captured digest's own hour. cx freshness is measured from the hour the
 * digest COVERS, so asserting against wall-clock time would make these checks pass today and
 * fail tomorrow as the fixture ages past the 2h window.
 */
const FIXTURE_NOW = 1_789_570_800 * 1000 + 10 * 60_000;

const db = getDb();
db.exec("DELETE FROM currency_rates; DELETE FROM price_snapshots; DELETE FROM item_spark;");

main()
  .then(() => {
    db.close();
    console.log("ALL PASS — cx digest parsing, exact-id rates, storage and the resolution ladder");
  })
  .catch((error: unknown) => {
    db.close();
    console.error(error);
    process.exit(1);
  });

async function main(): Promise<void> {
  testDigestParsing();
  testDerivedRatesMatchTheVerifiedMarket();
  testExactCurrencyIdMatching();
  testLeaguesWithoutCorePairs();
  testHourSelection();
  testStorageRoundTrip();
  testResolutionLadder();
  testStaleNinjaLosesToFreshScout();
  await testBootstrap();
  await testPollerRefresh();
}

function digest(): CxDigest {
  return parseCxDigest(FIXTURE);
}

function testDigestParsing(): void {
  const d = digest();
  assert.equal(d.next_change_id, 1_789_570_800);
  assert.equal(d.markets.length, 8);
  // Extra keys (lowest_stock/highest_stock) must survive rather than fail the parse.
  assert.ok("lowest_stock" in d.markets[0]!);
  assert.throws(() => parseCxDigest({ markets: [] }), /shape mismatch/);
  assert.throws(() => parseCxDigest("<html>403</html>"), /shape mismatch/);
}

/**
 * Ground truth verified against the live endpoint: 440.2 ex/div (band 405–461), 9.28 chaos/div,
 * 48.0 ex/chaos. These are volume-weighted effective rates, not quotes.
 */
function testDerivedRatesMatchTheVerifiedMarket(): void {
  const rates = deriveCxRates(digest(), FR);
  assert.ok(rates != null);
  assert.equal(rates.hour, 1_789_570_800);
  assert.equal(round(rates.exaltPerDivine, 1), 440.2);
  assert.equal(round(rates.chaosPerDivine, 2), 9.28);
  assert.equal(round(rates.exaltPerChaos, 1), 48.0);
  assert.equal(rates.volumeDivine, 12_400);

  const exDiv = rates.pairs.find((p) => p.pair === "exalt_per_divine");
  assert.equal(exDiv?.rateLow, 405);
  assert.equal(exDiv?.rateHigh, 461);
  assert.equal(exDiv?.sampleVolume, 12_400);
  assert.equal(rates.pairs.length, 3);

  // Standard trades the same three pairs at its own, very different rates.
  const std = deriveCxRates(digest(), "Standard");
  assert.ok(std != null);
  assert.equal(round(std.chaosPerDivine, 2), 2.49);
  assert.notEqual(round(std.exaltPerDivine, 1), round(rates.exaltPerDivine, 1));
}

/**
 * `CurrencyAddModToRare2` is the GREATER Exalted Orb — a different item at a different price.
 * A substring/prefix match would value the entire app in the wrong currency, so the id compare
 * must be exact. Here a fake Greater-Exalt market with 1000× the volume sits next to the real
 * one; the derived rate must be unchanged.
 */
function testExactCurrencyIdMatching(): void {
  const greater = "Metadata/Items/Currency/CurrencyAddModToRare2";
  const poisoned = digest();
  poisoned.markets.push({
    league: FR,
    market_id: `${CX_CURRENCY_IDS.divine}|${greater}`,
    market_pair: [CX_CURRENCY_IDS.divine, greater],
    volume_traded: { [CX_CURRENCY_IDS.divine]: 1, [greater]: 999_999 },
    lowest_ratio: { [CX_CURRENCY_IDS.divine]: 1, [greater]: 999_999 },
    highest_ratio: { [CX_CURRENCY_IDS.divine]: 1, [greater]: 999_999 },
  });

  const rates = deriveCxRates(poisoned, FR);
  assert.ok(rates != null);
  assert.equal(round(rates.exaltPerDivine, 1), 440.2, "Greater Exalted must never satisfy the Exalted pair");

  // And a league whose ONLY exalt-ish market is the Greater variant has no usable rate at all.
  const onlyGreater: CxDigest = {
    next_change_id: 1_789_570_800,
    markets: poisoned.markets.filter((m) => m.league === FR && m.market_pair.includes(greater)),
  };
  assert.equal(deriveCxRates(onlyGreater, FR), null);
}

function testLeaguesWithoutCorePairs(): void {
  // Private leagues ship in the same public payload and must never reach a league listing.
  assert.ok(isPrivateLeague("HC FRites League by Cardiff (PL86503)"));
  assert.ok(!isPrivateLeague("Forbidden Rites"));
  assert.deepEqual(cxLeagues(digest()).sort(), ["Forbidden Rites", "Standard"]);

  // Unknown, private and freshly-created leagues all resolve to null rather than a fake rate.
  assert.equal(deriveCxRates(digest(), "No Such League"), null);
  assert.equal(deriveCxRates(digest(), "HC FRites League by Cardiff (PL86503)"), null);
}

/** Without an explicit hour the endpoint serves Dec 2024, so a recent hour is always requested. */
function testHourSelection(): void {
  const noon = Date.UTC(2026, 8, 16, 12, 34, 56);
  const hour = previousCompletedHour(noon);
  assert.equal(hour % HOUR, 0);
  assert.equal(hour, Date.UTC(2026, 8, 16, 11, 0, 0) / 1000);
  assert.ok(hour * 1000 < noon);
}

function testStorageRoundTrip(): void {
  const rates = deriveCxRates(digest(), FR);
  assert.ok(rates != null);
  upsertCurrencyRates(
    FR,
    rates.pairs.map((p) => ({
      pair: p.pair,
      rate: p.rate,
      rateLow: p.rateLow,
      rateHigh: p.rateHigh,
      sampleVolume: p.sampleVolume,
      hour: rates.hour,
    })),
    "cx",
  );

  const stored = latestRates(FR);
  assert.equal(stored.length, 3);
  const exDiv = stored.find((r) => r.pair === "exalt_per_divine");
  assert.equal(round(exDiv?.rate ?? 0, 1), 440.2);
  assert.equal(exDiv?.rate_low, 405);
  assert.equal(exDiv?.source, "cx");
  assert.equal(exDiv?.hour, 1_789_570_800);

  // (league, pair, source) is the key: a second write replaces, it does not accumulate.
  upsertCurrencyRates(FR, [{ pair: "exalt_per_divine", rate: 500 }], "cx");
  assert.equal(latestRates(FR).length, 3);
  assert.equal(latestRates(FR).find((r) => r.pair === "exalt_per_divine")?.rate, 500);

  // A different source coexists with cx rather than overwriting it.
  upsertCurrencyRates(FR, [{ pair: "exalt_per_divine", rate: 453 }], "scout");
  assert.equal(latestRates(FR).length, 4);

  // Garbage is refused at the door, not stored and filtered later.
  upsertCurrencyRates(FR, [{ pair: "chaos_per_divine", rate: 0 }], "cx");
  assert.notEqual(latestRates(FR).find((r) => r.pair === "chaos_per_divine")?.rate, 0);

  // CURRENT_TIMESTAMP has no zone marker; reading it as local time would be an hours-wide bug.
  assert.ok(Math.abs(timestampAgeMs(exDiv!.fetched_at)) < 60_000);
  assert.throws(() => timestampAgeMs("not a date"), /unparseable timestamp/);
}

/** cx (≤2h) → ninja (our own snapshots) → scout (≤24h) → nothing. */
function testResolutionLadder(): void {
  const league = "Ladder League";
  const now = Date.now();
  assert.equal(resolveRates(league, now), null, "no source, no rates — never a fabricated number");

  // scout alone, within its 24h window.
  upsertCurrencyRates(
    league,
    [
      { pair: "exalt_per_divine", rate: 100 },
      { pair: "chaos_per_divine", rate: 10 },
    ],
    "scout",
  );
  assert.equal(resolveRates(league, now)?.source, "scout");
  assert.equal(resolveRates(league, now)?.rates.exaltPerDivine, 100);

  // our own snapshots outrank scout.
  insertSnapshots(league, [priced("exalted", 1 / 200), priced("chaos", 1 / 20)]);
  const ninja = resolveRates(league, now);
  assert.equal(ninja?.source, "ninja");
  assert.equal(round(ninja?.rates.exaltPerDivine ?? 0, 0), 200);
  assert.notEqual(ninja?.fetchedAt, null, "the ninja tier still reports when it was observed");

  // cx outranks everything while fresh.
  upsertCurrencyRates(
    league,
    [
      { pair: "exalt_per_divine", rate: 300 },
      { pair: "chaos_per_divine", rate: 30 },
    ],
    "cx",
  );
  assert.equal(resolveRates(league, now)?.source, "cx");
  assert.equal(resolveRates(league, now)?.rates.exaltPerDivine, 300);

  // 3h later BOTH cx and our own snapshots have aged out (2h each) and scout is the last tier
  // still inside its window; by 25h scout is gone too and there is no honest answer left.
  assert.equal(resolveRates(league, now + 3 * 3600_000)?.source, "scout");
  assert.equal(resolveRates(league, now + 25 * 3600_000), null);

  testLadderWithoutSnapshots(now);
}

/** The stored-only tiers, with no price_snapshots to fall back to. */
function testLadderWithoutSnapshots(now: number): void {
  // With no snapshots at all, staleness walks straight past cx to scout and then to nothing.
  const storeOnly = "Store Only League";
  upsertCurrencyRates(storeOnly, [{ pair: "exalt_per_divine", rate: 1 }, { pair: "chaos_per_divine", rate: 2 }], "cx");
  upsertCurrencyRates(storeOnly, [{ pair: "exalt_per_divine", rate: 3 }, { pair: "chaos_per_divine", rate: 4 }], "scout");
  assert.equal(resolveRates(storeOnly, now)?.source, "cx");
  assert.equal(resolveRates(storeOnly, now + 3 * 3600_000)?.source, "scout");
  assert.equal(resolveRates(storeOnly, now + 25 * 3600_000), null);

  // A half-populated source is not a source: one leg cannot imply the other.
  const halfLeague = "Half League";
  upsertCurrencyRates(halfLeague, [{ pair: "exalt_per_divine", rate: 7 }], "cx");
  assert.equal(resolveRates(halfLeague, now), null);

  // cx age is measured from the HOUR THE DIGEST COVERS, not from when we downloaded it. A CDN
  // stuck on an old payload would otherwise have its freshness renewed by every refresh and
  // this tier would never hand over to ninja.
  const stuck = "Stuck CDN League";
  const staleHour = Math.floor(now / 1000 / 3600) * 3600 - 6 * 3600;
  upsertCurrencyRates(
    stuck,
    [
      { pair: "exalt_per_divine", rate: 11, hour: staleHour },
      { pair: "chaos_per_divine", rate: 12, hour: staleHour },
    ],
    "cx",
  );
  upsertCurrencyRates(
    stuck,
    [
      { pair: "exalt_per_divine", rate: 13 },
      { pair: "chaos_per_divine", rate: 14 },
    ],
    "scout",
  );
  // fetched_at is seconds old, so a fetched_at-based check would wrongly say "cx".
  assert.equal(resolveRates(stuck, now)?.source, "scout");
  assert.equal(resolveRates(stuck, now)?.rates.exaltPerDivine, 13);
}

/**
 * Our own snapshots are bounded like every other tier. A retired league still holds months of
 * rows, and without a cap `deriveRates(latestSnapshots(...))` would happily serve them and
 * outrank a fresh scout row — month-old rates silently pricing a position close.
 */
function testStaleNinjaLosesToFreshScout(): void {
  const league = "Retired League";
  const now = Date.now();
  insertSnapshots(league, [priced("exalted", 1 / 200), priced("chaos", 1 / 20)]);
  upsertCurrencyRates(
    league,
    [
      { pair: "exalt_per_divine", rate: 900 },
      { pair: "chaos_per_divine", rate: 90 },
    ],
    "scout",
  );

  // Fresh snapshots still win — this tier is preferred, just not unconditionally.
  assert.equal(resolveRates(league, now)?.source, "ninja");

  // Age the snapshots past the 2h the header already calls "prices stale".
  getDb()
    .prepare("UPDATE price_snapshots SET fetched_at = datetime('now', '-30 days') WHERE league = ?")
    .run(league);
  const resolved = resolveRates(league, now);
  assert.equal(resolved?.source, "scout", "month-old snapshots must not outrank a fresh scout row");
  assert.equal(resolved?.rates.exaltPerDivine, 900);

  // With scout gone too, there is no honest answer left — null, not stale numbers.
  getDb().prepare("DELETE FROM currency_rates WHERE league = ?").run(league);
  assert.equal(resolveRates(league, now), null);
}

async function testBootstrap(): Promise<void> {
  const target = "Bootstrap League";
  const withFrRates: CxDigest = {
    next_change_id: 1_789_570_800,
    markets: digest().markets.map((m) => (m.league === FR ? { ...m, league: target } : m)),
  };

  assert.equal(await bootstrapRatesForLeague(target, sources({ digest: withFrRates })), "cx");
  assert.equal(round(resolveRates(target, FIXTURE_NOW)?.rates.exaltPerDivine ?? 0, 1), 440.2);
  assert.equal(resolveRates(target, FIXTURE_NOW)?.source, "cx");

  // Fresh cx row → a second switch inside 5 minutes must not re-hit the CDN.
  assert.equal(
    await bootstrapRatesForLeague(target, sources({ digest: new Error("must not be called") })),
    "skipped",
  );

  // A league the digest does not cover falls back to scout's league row.
  const young = "Young League";
  assert.equal(
    await bootstrapRatesForLeague(young, sources({ digest: digest(), scout: [scoutRow(young, 512, 11)] })),
    "scout",
  );
  assert.equal(resolveRates(young)?.source, "scout");
  assert.equal(resolveRates(young)?.rates.exaltPerDivine, 512);

  // Both sources down: the switch still stands, we simply have no rates yet.
  const orphan = "Orphan League";
  assert.equal(
    await bootstrapRatesForLeague(orphan, sources({ digest: new Error("cdn down"), scout: new Error("scout down") })),
    "failed",
  );
  assert.equal(resolveRates(orphan), null);

  // Scout answering without usable numbers is a failure, not a zero rate.
  assert.equal(
    await bootstrapRatesForLeague(orphan, sources({ digest: new Error("cdn down"), scout: [scoutRow(orphan, 0, 0)] })),
    "failed",
  );
  assert.equal(resolveRates(orphan), null);
}

/**
 * Ordering matters: the "last good digest" guard is module state, so the failure cases run
 * BEFORE the success that arms it.
 */
async function testPollerRefresh(): Promise<void> {
  const league = "Poller League";
  const payload: CxDigest = {
    next_change_id: 1_789_570_800,
    markets: digest().markets.map((m) => (m.league === FR ? { ...m, league } : m)),
  };

  // A CDN failure is warned about and survived, never thrown out of the poll cycle — and it
  // must NOT arm the guard, or one blip would cost an hour of rates.
  const cold = "Cold League";
  assert.deepEqual(await refreshCxRatesIfStale(cold, sources({ digest: new Error("502 bad gateway") })), []);
  assert.equal(resolveRates(cold), null);
  assert.deepEqual(await refreshCxRatesIfStale(cold, sources({ digest: new Error("502 again") })), []);

  assert.deepEqual(
    (await refreshCxRatesIfStale(league, sources({ digest: payload }))).sort(),
    ["Poller League", "Standard"],
    "one payload covers the active league and Standard",
  );
  assert.equal(resolveRates("Standard", FIXTURE_NOW)?.source, "cx");

  // Fresh rows → no fetch at all on the next cycle.
  assert.deepEqual(await refreshCxRatesIfStale(league, sources({ digest: new Error("must not be called") })), []);

  // A league the digest never covers stores nothing, so its cx age stays null forever. The
  // last-good-digest guard is the only thing stopping a fetch on every single poll cycle.
  assert.deepEqual(await refreshCxRatesIfStale(cold, sources({ digest: new Error("must not be called") })), []);
}

// --- helpers ---

function round(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

function priced(itemId: string, baseValue: number): PricedItem {
  return { itemId, itemName: itemId, category: "Currency", baseValue, volume: 10, change7d: null, spark7d: null, icon: null };
}

function scoutRow(name: string, exaltPerDivine: number, chaosPerDivine: number): LeagueOption {
  return { name, current: true, exaltPerDivine, chaosPerDivine };
}

/** Stubbed clients — this suite never opens a socket. */
function sources(stub: { digest: CxDigest | Error; scout?: LeagueOption[] | Error }): RateSources {
  const resolve = <T>(value: T | Error) => async (): Promise<T> => {
    if (value instanceof Error) throw value;
    return value;
  };
  return {
    digest: resolve(stub.digest),
    scoutLeagues: resolve(stub.scout ?? new Error("scout not stubbed for this case")),
  };
}
