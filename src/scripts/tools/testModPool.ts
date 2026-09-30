/* Mod pool browser: gates vs KB §3, catalog text → trade stat, the book signal on synthetic
 * observations (ref boundaries, LIKE escaping, coverage, null-not-zero), the shared live cache TTL
 * and budget, and the contract. Chained from testCraftMoves.ts (npm run test:tools:craft-moves),
 * which runs under runWithTestEnv, so the DB is a temp file. */
import assert from "node:assert/strict";
import { parseTabRoute } from "../../components/shell/tabRegistry";
import { parseListing, type Listing } from "../../api/tradeListing";
import { observedByBaseRef, recordObservation } from "../../db/marketQueries";
import { getModValue, saveModValue } from "../../db/modValueQueries";
import { rollSignature } from "../../core/priceBook";
import { buildStatIndex, type StatIndex } from "../../core/statResolver";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { KB_GATE_EXAMPLES } from "../../core/tools/craftmoves/gates";
import { RatesUnavailableError } from "../../core/tools/craftmoves/moves";
import { implicitPseudoRefs, resolveTier, tierTemplate } from "../../core/tools/modpool/bookSignal";
import { createLiveLimiter, LIVE_VALUES_PER_HOUR, spendReserved, type LiveLimiter } from "../../core/tools/modpool/liveLimit";
import { lookupFamilyValue, memoObs } from "../../core/tools/modpool/load";
import { loadStatIndex, NEGATIVE_TTL_MS, resetStatIndexCache, StatCatalogUnavailableError } from "../../core/tools/modpool/statIndex";
import { cachedLiveValue, cacheKeyOf, fetchLiveValue, freshAfter, liveQuery, type LiveDeps, type LiveTarget } from "../../core/tools/modpool/liveValue";
import { assemblePool, familyTier, ModNotSearchableError, poolClasses, poolGates, statOfTier, UnknownBaseError, type PoolInputs } from "../../core/tools/modpool/pool";
import { tradeSearchUrl } from "../../lib/tradeLink";
import {
  modPoolGetResponseSchema,
  modPoolQuerySchema,
  modPoolResponseSchema,
  modValueRequestSchema,
  type ModPoolQuery,
  type ModPoolResponse,
} from "../../lib/tools/modPoolContract";
import { assertPanelExport, freshToolsDb } from "./toolsTestKit";

const L = "Pool League";
const RING: ModPoolQuery = { itemClass: "Rings", base: "Ruby Ring", ilvl: 82, rarity: "Rare" };
const NOW = Date.parse("2026-09-29T12:00:00Z");
const H = 3_600_000;

/** A slice of the trade2 stat catalog: explicits for the ring lines, the pseudo total for res. */
const IDX: StatIndex = buildStatIndex([
  { id: "explicit.stat_fire", text: "+#% to Fire Resistance", group: "explicit" },
  { id: "explicit.stat_cold", text: "+#% to Cold Resistance", group: "explicit" },
  { id: "explicit.stat_cast", text: "#% increased Cast Speed", group: "explicit" },
  { id: "explicit.stat_attack_fire", text: "Adds # to # Fire damage to Attacks", group: "explicit" },
  { id: "explicit.stat_rarity", text: "#% increased Rarity of Items found", group: "explicit" },
  { id: "pseudo.stat_total_ele", text: "+#% total Elemental Resistance", group: "pseudo" },
]);
const REF = { fire: "#% to fire resistance", ele: "#% total elemental resistance", cast: "#% increased cast speed", attack: "adds # to # fire damage to attacks" };

function testGatesVsKb(cat: CraftCatalog): void {
  const gates = poolGates(cat, RING);
  for (const ex of KB_GATE_EXAMPLES.filter((e) => e.itemClass === "Rings")) {
    const g = gates.find((x) => x.family === ex.family);
    assert.ok(g, `Ruby Ring pool must list ${ex.family}`);
    const top = ex.expect[0]!;
    assert.equal(g.best.level, top.level, `${ex.family}: best tier level vs KB`);
    assert.equal(g.topReachable?.level, top.level, `${ex.family}: ilvl 82 reaches the KB top tier`);
    assert.ok(g.kbRow, `${ex.family} carries its KB row`);
    assert.ok(!g.present, "the pool browser marks nothing present");
  }
  const at81 = poolGates(cat, { ...RING, ilvl: 81 }).find((g) => g.family === "FireResistance")!;
  assert.equal(at81.topReachable?.level, 71, "ilvl 81 is capped at the level-71 fire res tier");
  const magic = poolGates(cat, { ...RING, rarity: "Magic" })[0]!;
  assert.deepEqual(magic.floors.map((f) => f.floor), [44, 70], "Magic shows the augmentation floors");
  assert.throws(() => poolGates(cat, { ...RING, base: "Vaal Gauntlets" }), UnknownBaseError, "a base of another class is refused");
  const rings = poolClasses(cat).find((c) => c.itemClass === "Rings");
  assert.ok(rings?.bases.some((b) => b.name === "Ruby Ring"), "the picker offers Ruby Ring under Rings");
  const offered = poolClasses(cat).flatMap((c) => c.bases.map((b) => b.name));
  assert.ok(offered.length > 500 && !offered.some((n) => n.startsWith("[DNT]")), "placeholder [DNT] bases are never offered");
}

function testTextToStat(): void {
  const res = tierTemplate("+(41-45)% to Fire Resistance");
  assert.deepEqual([res.placeholdered, res.minRoll, res.partial], ["+#% to Fire Resistance", 41, false]);
  const adds = tierTemplate("Adds (3-4) to (5-8) Cold damage to Attacks");
  assert.deepEqual([adds.placeholdered, adds.minRoll], ["Adds # to # Cold damage to Attacks", 4], "Adds: average of the mins, as the resolver reads rolls");
  const hybrid = tierTemplate("(110-154)% increased Physical Damage\n15% reduced Attack Speed");
  assert.deepEqual([hybrid.line, hybrid.lines, hybrid.partial, hybrid.minRoll], ["(110-154)% increased Physical Damage", 2, true, 110], "hybrid: first line, flagged partial");
  assert.equal(tierTemplate("Attacks Chain an additional time").minRoll, null, "no roll → presence-only, never 0");
  assert.equal(tierTemplate("Adds 1 to (2-3) Fire damage to Attacks").minRoll, 1.5);
  assert.equal(tierTemplate("(60-56)% reduced Poison Duration on you").minRoll, 56, "a high-to-low range still yields its lower bound");

  const fire = resolveTier(res, IDX);
  assert.deepEqual(fire, { statId: "explicit.stat_fire", bookRef: null, pseudo: { ref: REF.ele, label: "Σ total Elemental Resistance" } }, "a pseudo source has no book ref of its own");
  const cast = resolveTier(tierTemplate("(9-12)% increased Cast Speed"), IDX);
  assert.deepEqual(cast, { statId: "explicit.stat_cast", bookRef: REF.cast, pseudo: null });
  const noPseudo = buildStatIndex([{ id: "explicit.stat_fire", text: "+#% to Fire Resistance", group: "explicit" }]);
  assert.deepEqual([resolveTier(res, noPseudo)?.bookRef, resolveTier(res, noPseudo)?.pseudo], [null, null], "no pseudo total in the catalog → never signed");
  assert.equal(resolveTier(tierTemplate("+(5-8) to Nonsense"), IDX), null);
  assert.deepEqual([...implicitPseudoRefs(["+(20-30)% to Fire Resistance"], IDX)], [REF.ele], "a res implicit feeds the ele res total");
  assert.equal(implicitPseudoRefs(["(6-15)% increased Rarity of Items found"], IDX).size, 0);
}

function seedBook(): void {
  const sig = (base: string, refs: string[]) => rollSignature(base, refs.map((ref) => ({ ref, value: 30 })));
  let n = 0;
  const obs = (s: string, div: number, league = L) => recordObservation(league, s, "x", div, `obs-${++n}`);
  for (const d of [2, 3, 4]) obs(sig("Ruby Ring", [REF.cast, REF.ele]), d);
  obs(sig("Ruby Ring", [REF.ele]), 1);
  obs(sig("Ruby Ring", ["#% increased cast speed while channelling"]), 5); // longer ref sharing a prefix
  // sorts to "…|#% to maximum mana#b…~#abc increased cast speed#b…": an unescaped "%" in the ref matches it
  obs(sig("Ruby Ring", ["#% to maximum mana", "#abc increased cast speed"]), 6);
  for (let i = 0; i < 2; i++) obs(sig("Ruby Ring", [REF.attack]), 7); // two samples: a value, but no uplift %
  obs("ruby ring|", 90); // legacy zero-mod row: never a sample, never the baseline
  obs(sig("Gold Ring", [REF.cast]), 70);
  obs(sig("Ruby Ring", [REF.cast]), 80, "Other League");
}

function testObservedByBaseRef(): void {
  seedBook();
  const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
  assert.deepEqual(sorted(observedByBaseRef(L, "Ruby Ring", REF.cast)), [2, 3, 4], "ref pinned to a token start; base + league scoped");
  assert.deepEqual(sorted(observedByBaseRef(L, "Ruby Ring", REF.ele)), [1, 2, 3, 4], "ref found in first and later positions");
  assert.deepEqual(sorted(observedByBaseRef(L, "Ruby Ring", null)), [1, 2, 3, 4, 5, 6, 7, 7], "baseline = modded rows only");
  assert.deepEqual(observedByBaseRef(L, "Ruby Ring", "#_ increased cast speed"), [], "_ is literal, not a wildcard");
  assert.deepEqual(observedByBaseRef(L, "Ruby Ring", REF.fire), []);
  let reads = 0;
  const memo = memoObs((ref) => {
    reads++;
    return observedByBaseRef(L, "Ruby Ring", ref);
  });
  for (const ref of [REF.cast, REF.cast, null, null, REF.attack]) memo(ref);
  assert.equal(reads, 3, "one book read per distinct ref within a pool");
}

function inputs(idx: StatIndex | null, over: Partial<PoolInputs> = {}): PoolInputs {
  return {
    league: L,
    idx,
    bookError: idx ? null : "catalog down",
    obs: (ref) => observedByBaseRef(L, RING.base, ref),
    live: () => null,
    cacheHours: 24,
    exaltPerDivine: 100,
    patch: { data: "0.5.x", repoe: "test" },
    ...over,
  };
}

function testPseudoRows(cat: CraftCatalog, pool: ModPoolResponse): void {
  assert.ok(cat.bases["Ruby Ring"]?.implicits.some((l) => /to Fire Resistance$/.test(l)), "the catalog carries Ruby Ring's fire res implicit");
  for (const family of ["FireResistance", "ColdResistance"]) {
    const r = pool.rows.find((x) => x.family === family)!;
    assert.deepEqual([r.book, r.bookMissing, r.pseudo], [null, "pseudo-only", { label: "Σ total Elemental Resistance", implicit: true }], `${family}: no per-family number`);
  }
  const gold = assemblePool(cat, { ...RING, base: "Gold Ring" }, inputs(IDX, { obs: (ref) => observedByBaseRef(L, "Gold Ring", ref) }));
  assert.deepEqual(gold.rows.find((x) => x.family === "FireResistance")?.pseudo, { label: "Σ total Elemental Resistance", implicit: false }, "a rarity-implicit base shows the Σ label");
}

function testAssemble(cat: CraftCatalog): void {
  const pool = modPoolResponseSchema.parse(assemblePool(cat, RING, inputs(IDX)));
  const row = (family: string) => pool.rows.find((r) => r.family === family)!;
  const cast = row("IncreasedCastSpeed");
  assert.deepEqual([cast.book?.valueDiv, cast.book?.samples], [3, 3], "trimmed median of the cast speed asks");
  assert.deepEqual([pool.baseline.valueDiv, pool.baseline.samples], [5, 7], "base-wide trimmed median (the 1-Div ask is bait)");
  assert.equal(cast.book?.upliftPct, -40);
  const attack = row("FireDamage");
  assert.deepEqual([attack.book?.valueDiv, attack.book?.samples, attack.book?.upliftPct], [7, 2, null], "under 3 samples: value and n, no %");
  testPseudoRows(cat, pool);
  const life = row("IncreasedLife");
  assert.deepEqual([life.search?.statId, life.book, life.bookMissing, life.tradeUrl], [null, null, "unresolved", null], "unresolved → nothing, not 0");
  assert.equal(pool.coverage.families, pool.rows.length);
  assert.equal(pool.coverage.resolved, pool.rows.filter((r) => r.search?.statId).length);
  assert.equal(pool.coverage.withSamples, 2, "cast speed + attack fire damage; pseudo-only rows never count");
  assert.ok(pool.rows.every((r) => r.book == null || r.book.valueDiv == null || r.book.valueDiv > 0), "no zero Div");
  const tier = familyTier(cat, RING, "IncreasedCastSpeed", "suffix");
  const expected = tradeSearchUrl(L, liveQuery({ baseType: RING.base, statId: "explicit.stat_cast", minRoll: tier.minRoll, tierLevel: tier.tierLevel }));
  assert.equal(cast.tradeUrl, expected, "the static link runs the live value's exact query");
  const at86 = assemblePool(cat, { ...RING, ilvl: 86 }, inputs(IDX)).rows.find((r) => r.family === "IncreasedCastSpeed");
  assert.equal(at86?.tradeUrl, cast.tradeUrl, "same tier at another ilvl → same link");

  const low = assemblePool(cat, { ...RING, ilvl: 1 }, inputs(IDX)).rows.find((r) => r.family === "FireResistance")!;
  assert.ok(low.topReachable == null ? low.bookMissing === "no-tier" && low.search == null : low.search != null);
  const down = assemblePool(cat, RING, inputs(null, { obs: () => assert.fail("the book is not read without a catalog") }));
  assert.ok(down.rows.every((r) => r.bookMissing === "unavailable" || r.bookMissing === "no-tier"));
  assert.deepEqual([down.coverage.resolved, down.coverage.withSamples, down.bookError], [0, 0, "catalog down"]);
}

function comps(divs: number[]): Listing[] {
  return divs.map((div, i) => {
    const l = parseListing({ id: `c${i}`, listing: { price: { amount: div, currency: "divine" }, account: { name: "S" } }, item: { baseType: "Ruby Ring", rarity: "Rare" } });
    if (!l) throw new Error("fixture listing did not parse");
    return { ...l, online: true };
  });
}

function fakeDeps(divs: number[], rates: boolean): LiveDeps & { calls: number } {
  const deps = {
    calls: 0,
    rates: () => (rates ? { exaltPerDivine: 100, chaosPerDivine: 20 } : null),
    search: async () => {
      deps.calls++;
      return { total: divs.length + 5, listings: comps(divs), searchUrl: "https://www.pathofexile.com/trade2/search/poe2/Pool%20League/abc" };
    },
  };
  return deps;
}

const targetAt = (cat: CraftCatalog, ilvl: number, family = "IncreasedCastSpeed"): LiveTarget => {
  const tier = familyTier(cat, { ...RING, ilvl }, family, "suffix");
  return { league: L, baseType: RING.base, statId: statOfTier(tier, IDX), minRoll: tier.minRoll, tierLevel: tier.tierLevel };
};

/** Review BUG: the cache key ignored ilvl while the query used it. The query is now a function of the key. */
function testKeyDeterminesQuery(cat: CraftCatalog): void {
  const [a, b] = [targetAt(cat, 82), targetAt(cat, 86)];
  assert.deepEqual(cacheKeyOf(a), cacheKeyOf(b), "same tier → same cache key");
  assert.deepEqual(liveQuery(a), liveQuery(b), "same tier → identical query, whatever ilvl was requested");
  const q = liveQuery(a);
  assert.deepEqual([q.rarity, q.instantBuyout, q.mirrored, q.ilvlMin, q.stats], ["rare", true, false, a.tierLevel, [{ id: a.statId, min: a.minRoll }]]);
  const [fire81, fire82] = [targetAt(cat, 81, "FireResistance"), targetAt(cat, 82, "FireResistance")];
  assert.notDeepEqual(cacheKeyOf(fire81), cacheKeyOf(fire82), "a different tier is a different key");
  assert.deepEqual([fire81.tierLevel, fire82.tierLevel], [71, 82]);
  assert.throws(() => statOfTier(familyTier(cat, RING, "IncreasedLife", "prefix"), IDX), ModNotSearchableError);
  assert.throws(() => familyTier(cat, RING, "IncreasedCastSpeed", "prefix"), ModNotSearchableError, "side must match");
}

async function testLiveCache(cat: CraftCatalog): Promise<void> {
  const target = targetAt(cat, 82);
  const noRates = fakeDeps([1], false);
  await assert.rejects(fetchLiveValue(target, { poesessid: "x" }, NOW, noRates), RatesUnavailableError);
  assert.equal(noRates.calls, 0, "no rates → no search spent");

  assert.equal(cachedLiveValue(target, NOW), null);
  const deps = fakeDeps([2, 3, 4], true);
  const v = await fetchLiveValue(target, { poesessid: "x" }, NOW, deps);
  assert.deepEqual([v.valueDiv, v.samples, v.total, deps.calls], [3, 3, 8, 1], "one search, trimmed median");
  assert.equal(cachedLiveValue(target, NOW + 23 * H)?.valueDiv, 3, "served from the shared cache inside the window");
  assert.equal(cachedLiveValue(target, NOW + 25 * H), null, "expired after cacheHours");
  assert.equal(freshAfter(NOW), NOW - 24 * H);

  // cache before the trade2 stat catalog: with the row's statId a hit needs no stat index at all
  const req = { itemClass: RING.itemClass, base: RING.base, ilvl: 86, family: "IncreasedCastSpeed", side: "suffix" as const, statId: target.statId };
  const hit = await lookupFamilyValue(req, L, NOW);
  assert.ok(hit.kind === "hit" && hit.response.cached && hit.response.live.valueDiv === 3, "an ilvl-86 click reuses the ilvl-82 search");

  const empty = { ...target, statId: "explicit.stat_fire", minRoll: null };
  const none = await fetchLiveValue(empty, { poesessid: "x" }, NOW, fakeDeps([], true));
  assert.equal(none.valueDiv, null, "no comparables → null, never 0");
  assert.equal(getModValue(cacheKeyOf(empty), 0)?.valueDiv, null, "stored as NULL under min_roll 0");
  saveModValue(cacheKeyOf(empty), { ...none, checkedAt: NOW - 30 * H });
  assert.equal(cachedLiveValue(empty, NOW), null, "an overwritten stale row is not served");

  const withLive = assemblePool(cat, RING, inputs(IDX, { live: (id, roll) => (id === target.statId && roll === (target.minRoll ?? 0) ? v : null) }));
  const castRow = withLive.rows.find((r) => r.family === "IncreasedCastSpeed")!;
  assert.equal(castRow.tradeUrl, v.searchUrl, "a live value's own search link replaces the static one");
}

async function testStatIndexNegativeCache(): Promise<void> {
  resetStatIndexCache();
  let calls = 0;
  const down = async () => {
    calls++;
    throw new Error("trade2 data fetch failed for /stats (503)");
  };
  await assert.rejects(loadStatIndex(NOW, down), StatCatalogUnavailableError);
  const second = await loadStatIndex(NOW + 30_000, down).catch((e: unknown) => e);
  assert.ok(second instanceof StatCatalogUnavailableError && second.retryAfterSec === 30 && /503/.test(second.message), "a remembered failure fails fast and says why");
  assert.equal(calls, 1, "no second trade2 read inside the negative window");
  await assert.rejects(loadStatIndex(NOW + NEGATIVE_TTL_MS + 1, down), StatCatalogUnavailableError);
  assert.equal(calls, 2, "retried once the window passes");
  const up = async () => ({ at: 1, stats: [{ id: "explicit.stat_cast", text: "#% increased Cast Speed", group: "explicit" }] });
  const idx = await loadStatIndex(NOW + 3 * NEGATIVE_TTL_MS, up);
  assert.equal(await loadStatIndex(NOW + 3 * NEGATIVE_TTL_MS, up), idx, "the same snapshot is not rebuilt per request");
  resetStatIndexCache();
}

/** Take a slot or fail the test: the limiter refusing here is itself the bug. */
function take(lim: LiveLimiter, userId: number): { release: () => void } {
  const slot = lim.reserve(userId);
  if (!slot.allowed) throw new Error(`user ${userId}: no live slot left`);
  return slot;
}

async function testLiveLimiter(): Promise<void> {
  let clock = NOW;
  const lim = createLiveLimiter({ now: () => clock });
  for (let i = 0; i < LIVE_VALUES_PER_HOUR; i++) take(lim, 1);
  const gate = lim.reserve(1);
  assert.ok(!gate.allowed && gate.retryAfterSec === 3600, "the 11th reservation in an hour is refused with Retry-After");
  assert.ok(lim.check(2).allowed, "per user, not global");
  const notSpent = (e: unknown) => e instanceof RatesUnavailableError;
  await assert.rejects(spendReserved(take(lim, 3), notSpent, () => Promise.reject(new RatesUnavailableError(L))), RatesUnavailableError);
  await assert.rejects(spendReserved(take(lim, 3), notSpent, () => Promise.reject(new Error("trade2 502"))), /502/);
  await spendReserved(take(lim, 3), notSpent, () => Promise.resolve(1));
  for (let i = 0; i < LIVE_VALUES_PER_HOUR - 3; i++) take(lim, 3);
  assert.ok(lim.check(3).allowed, "a refused-before-trade2 error hands its slot back (2 of 3 attempts counted)");
  take(lim, 3);
  assert.equal(lim.check(3).allowed, false);
  const released = take(lim, 4);
  released.release();
  released.release();
  assert.ok(lim.check(4).allowed, "a release is idempotent and never frees someone else's slot");
  clock += 3_600_001;
  assert.ok(lim.check(1).allowed, "the window rolls");
}

function testContract(cat: CraftCatalog): void {
  assert.equal(modPoolGetResponseSchema.parse({ kind: "catalog", classes: poolClasses(cat) }).kind, "catalog");
  const ok = modPoolQuerySchema.parse({ itemClass: "Rings", base: "Ruby Ring", ilvl: "82", rarity: "Rare" });
  assert.equal(ok.ilvl, 82, "ilvl is read from the query string");
  for (const bad of [{ ilvl: "0" }, { ilvl: "101" }, { ilvl: "8.5" }, { rarity: "Unique" }, { base: "" }]) {
    assert.equal(modPoolQuerySchema.safeParse({ itemClass: "Rings", base: "Ruby Ring", ilvl: "82", rarity: "Rare", ...bad }).success, false, JSON.stringify(bad));
  }
  assert.equal(modValueRequestSchema.safeParse({ ...RING, family: "X", side: "implicit" }).success, false);
  const zero = assemblePool(cat, RING, inputs(IDX));
  const row = zero.rows[0]!;
  const withZero = { ...zero, rows: [{ ...row, book: { valueDiv: 0, minDiv: null, samples: 0, upliftPct: null } }] };
  assert.equal(modPoolResponseSchema.safeParse(withZero).success, false, "a 0 Div value is a contract error");
}

/** Every mod pool case. Needs the temp DB (the book and the live cache are real tables). */
export async function runModPoolCases(cat: CraftCatalog): Promise<void> {
  freshToolsDb();
  testGatesVsKb(cat);
  testTextToStat();
  testObservedByBaseRef();
  testAssemble(cat);
  testKeyDeterminesQuery(cat);
  await testLiveCache(cat);
  await testStatIndexNegativeCache();
  await testLiveLimiter();
  testContract(cat);
  assertPanelExport("src/components/craft/modpool/ModPoolTool.tsx", "ModPoolTool", "src/components/shell/tabs/CraftTab.tsx");
  assert.deepEqual(parseTabRoute("craft", "modpool"), { tab: "craft", tool: "modpool", rejected: [] });
}
