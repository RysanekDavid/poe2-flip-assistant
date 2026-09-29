/* Boss EV: strict curated-data validation (dated sources on every line), bossEv on a synthetic tier
 * (guaranteed + point + range + unknown + unpriced + manual), break-even, jackpot math, craft-vs-buy
 * entry, per-item price age from the DB, patch warning, and the panel wiring.
 * Run: npm run test:tools:boss-ev */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TAB_IDS, TABS } from "../../components/shell/tabRegistry";
import type { BossArt } from "../../core/tools/bossEv/art";
import { bossEv, evaluateBosses, jackpotOf } from "../../core/tools/bossEv/ev";
import { breakEvenHeadline, capTone, fmtDiv, oneIn } from "../../core/tools/bossEv/headline";
import { loadPriceInputs, priceLookup, referencedNinjaIds, resolvePrice, type PriceInputs } from "../../core/tools/bossEv/pricing";
import { rawBossLoot } from "../../core/tools/bossEv/curated";
import { comparePatch, parseBossLoot, patchWarning, type Tier } from "../../core/tools/bossEv/schema";
import { insertSnapshots } from "../../db/marketQueries";
import { getDb } from "../../db/database";
import { buildFarmBoard } from "../../core/farm/farmBoard";
import { farmResponseSchema } from "../../lib/farmContract";
import { patchCoverageSchema } from "../../sources/patchNotes/contracts";
import { runCuratedCases, runLineagePricingCase } from "./bossLootCases";
import { runFarmBoardCases } from "./farmBoardCases";
import { runFarmOverhaulCases } from "./farmOverhaulCases";
import { runFarmSpeedCases, runFarmSpeedDbCases } from "./farmSpeedCases";
import { assertPanelExport, freshToolsDb } from "./toolsTestKit";

const NOW = Date.parse("2026-09-28T12:00:00Z");
const ART: BossArt = new Map();
const close = (actual: number, expected: number, what: string): void =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${what}: expected ${expected}, got ${actual}`);

const readCurated = (): Record<string, unknown> => rawBossLoot();

function testCuratedFile(): void {
  const file = parseBossLoot(readCurated());
  assert.equal(file.schemaVersion, 1);
  // The route calls this on every GET with the two checked-in files; it must not throw on them.
  const coverage = patchCoverageSchema.parse(realCoverage());
  assert.doesNotThrow(() => patchWarning(file.patch, coverage.game_data_patch, NOW), "real boss-loot + patch-coverage");
  assert.ok(file.bosses.length >= 5, "at least five sourced bosses");
  // the wall clock, not the synthetic NOW: "accessed in the future" is relative to when the test runs
  const today = new Date().toISOString().slice(0, 10);
  for (const boss of file.bosses) {
    assert.ok(boss.sources.length > 0, `${boss.id} cites its access chain`);
    for (const s of boss.sources) assert.ok(!s.url.includes("poewiki.net/"), `${boss.id}: ${s.url} is the PoE1 wiki host`);
    for (const tier of boss.tiers) {
      for (const loot of tier.loot) {
        const where = `${boss.id}/${tier.id}/${loot.name}`;
        assert.ok(!loot.source.url.includes("poewiki.net/"), `${where}: PoE1 wiki host`);
        assert.match(loot.source.accessed, /^\d{4}-\d{2}-\d{2}$/, `${where} source must be dated`);
        assert.ok(loot.source.accessed <= today, `${where} source accessed in the future`);
        assert.ok(loot.source.url.startsWith("https://"), `${where} source must be a link`);
        if (loot.priceRef.kind === "manual") assert.ok(loot.priceRef.asOf <= today, `${where} manual price dated in the future`);
      }
    }
  }
  const ids = referencedNinjaIds(file);
  for (const id of ["ravens-reflection", "an-audience-with-the-king", "kulemaks-invitation", "origin-spark", "raven-touched-shard", "breachlord-sac", "carved-majesty"]) {
    assert.ok(ids.has(id), `referenced ninja ids include ${id}`);
  }
  runCuratedCases(file);
  runFarmOverhaulCases(file);
}

/** Mutate a fresh copy of the curated file and expect the strict parse to reject it. */
function rejects(what: string, mutate: (raw: { bosses: Array<Record<string, unknown> & { tiers: Array<{ loot: Array<Record<string, unknown>> }> }> } & Record<string, unknown>) => void): void {
  const raw = readCurated() as Parameters<typeof mutate>[0];
  mutate(raw);
  assert.throws(() => parseBossLoot(raw), /boss loot tables invalid/, what);
}

function firstLoot(raw: Parameters<Parameters<typeof rejects>[1]>[0]): Record<string, unknown> {
  const line = raw.bosses[0]?.tiers[0]?.loot[0];
  assert.ok(line, "curated file has a first loot line");
  return line;
}

function testStrictness(): void {
  rejects("unknown top-level key", (raw) => {
    raw.extra = true;
  });
  rejects("unknown loot key", (raw) => {
    firstLoot(raw).dropRate = 0.5;
  });
  rejects("loot line without a source", (raw) => {
    delete firstLoot(raw).source;
  });
  rejects("undated source", (raw) => {
    firstLoot(raw).source = { title: "x", url: "https://example.com" };
  });
  rejects("impossible date", (raw) => {
    firstLoot(raw).source = { title: "x", url: "https://example.com", accessed: "2026-13-40" };
  });
  rejects("overflowing day that Date would roll into March", (raw) => {
    firstLoot(raw).source = { title: "x", url: "https://example.com", accessed: "2026-02-30" };
  });
  rejects("inverted range", (raw) => {
    firstLoot(raw).rate = { kind: "range", lo: 0.5, hi: 0.1 };
  });
  rejects("probability above 1", (raw) => {
    firstLoot(raw).rate = { kind: "point", p: 1.5 };
  });
  rejects("duplicate boss id", (raw) => {
    const first = raw.bosses[0];
    assert.ok(first);
    raw.bosses.push(first);
  });
  const cats = (raw: Record<string, unknown>): Record<string, unknown> => raw.ninjaCategories as Record<string, unknown>;
  rejects("ninja id without a declared category", (raw) => {
    delete cats(raw)["breachlord-sac"];
  });
  rejects("category the poller never fetches", (raw) => {
    cats(raw)["breachlord-sac"] = "Uniques";
  });
  rejects("declared id nothing references", (raw) => {
    cats(raw)["mirror-of-kalandra"] = "Currency";
  });
  rejects("loot priced from ninja but declared unlisted", (raw) => {
    cats(raw)["raven-touched-shard"] = null;
  });
  rejects("lineage flag other than true", (raw) => {
    firstLoot(raw).lineage = false;
  });
}

const SRC = { title: "synthetic", url: "https://example.com/s", accessed: "2026-09-01" };

function syntheticInputs(overrides: Partial<Record<string, number>> = {}): PriceInputs {
  const base: Record<string, number> = { a: 1, b: 5, c: 1, g: 1, p: 10, r: 40, u: 100, ...overrides };
  const ninja = new Map(Object.entries(base).map(([id, div]) => [id, { div, name: id.toUpperCase(), icon: null, ageHours: 0.5, volume: div * 10 }]));
  return { ninja, scout: new Map([["scouted", 3]]), scoutAgeHours: 20, lineage: new Map(), lineageAgeHours: null, scoutZero: new Set(), nowMs: NOW };
}

const TIER: Tier = {
  id: "t",
  label: "synthetic",
  entry: [
    { itemId: "a", qty: 2 },
    { itemId: "b", qty: 1, craftFrom: [{ itemId: "c", qty: 2 }] },
  ],
  loot: [
    { name: "G", priceRef: { kind: "ninja", itemId: "g" }, rate: { kind: "guaranteed" }, confidence: "confirmed", source: SRC },
    { name: "P", priceRef: { kind: "ninja", itemId: "p" }, rate: { kind: "point", p: 0.1 }, confidence: "single-source", source: SRC },
    { name: "R", priceRef: { kind: "ninja", itemId: "r" }, rate: { kind: "range", lo: 0.01, hi: 0.05 }, confidence: "unverified", source: SRC },
    { name: "U", priceRef: { kind: "ninja", itemId: "u" }, rate: { kind: "unknown" }, confidence: "unverified", source: SRC },
    { name: "M", priceRef: { kind: "manual", div: 2, asOf: "2026-09-27" }, rate: { kind: "point", p: 0.25 }, confidence: "single-source", source: SRC },
    { name: "X", priceRef: { kind: "scout", name: "Nobody Lists This" }, rate: { kind: "point", p: 0.5 }, confidence: "unverified", source: SRC },
    { name: "Pool", priceRef: { kind: "unpriced", reason: "random pool" }, rate: { kind: "guaranteed" }, confidence: "single-source", source: SRC },
  ],
};

function testSyntheticTier(): void {
  const r = bossEv(TIER, priceLookup(syntheticInputs()), ART);
  // Entry: 2×A = 2 bought; B buys at 5 but crafts from 2×C = 2 → craft wins.
  const [a, b] = r.entryLines;
  assert.ok(a && b);
  assert.deepEqual([a.route, a.costDiv], ["buy", 2]);
  assert.deepEqual([b.route, b.buyDiv, b.craftDiv, b.costDiv], ["craft", 5, 2, 2]);
  close(r.entryDiv, 4, "entry = min(buy, craft) summed");
  assert.equal(r.entryComplete, true);
  // EV: G 1 + P 10×0.1 + M 2×0.25 = 2.5; ranges add 40×0.01 / 40×0.05.
  close(r.guaranteedDiv, 1, "guaranteed value");
  close(r.evDiv, 2.9, "EV counts the range at its LOW end (conservative)");
  close(r.evLowDiv, r.evDiv, "the single EV number is the low end");
  close(r.evHighDiv, 4.5, "EV high adds range hi");
  close(r.netDiv, -1.1, "net = conservative EV − entry");
  close(r.evPerDivSpent ?? NaN, 0.725, "EV per Div spent, conservative");
  assert.equal(r.loot.find((l) => l.name === "R")?.evDiv, 40 * 0.01, "a range line's EV is its low end");
  assert.deepEqual(r.unpriced, ["X", "Pool"], "unpriced lines are listed, not dropped");
  assert.deepEqual(r.unknownRate, ["U"]);
  const x = r.loot.find((l) => l.name === "X");
  assert.equal(x?.evDiv, null, "an unpriced line contributes nothing to EV");
  assert.equal(r.loot.find((l) => l.name === "Pool")?.unpricedReason, "random pool");
  assert.match(r.varianceNote, /no known rate/);
  assert.match(r.varianceNote, /44% of the priced EV rides on drops rarer than 1 in 10/, "range R at hi = 2 of 4.5 EV");
  assert.match(r.varianceNote, /once per 9 kills/, "1 / (1 − 0.99 × 0.9) ≈ 9.2 kills");
}

function testBreakEvenAndJackpot(): void {
  const r = bossEv(TIER, priceLookup(syntheticInputs()), ART);
  assert.deepEqual(r.breakEven.map((b) => b.name), ["U", "R", "P", "M"], "chase (priciest) first, guaranteed excluded");
  const chase = r.breakEven[0];
  assert.ok(chase);
  close(chase.pStar, 4 / 100, "p* = entry / price");
  close(chase.pStarNet, (4 - 1) / 100, "p*net subtracts guaranteed loot");
  // Jackpot = drops worth ≥ entry (4): U (unknown), R (1–5%), P (10%).
  assert.deepEqual(r.jackpot.items, ["P", "R", "U"]);
  close(r.jackpot.p, 1 - 0.99 * 0.9, "P(≥1) with range at lo");
  close(r.jackpot.pHigh, 1 - 0.95 * 0.9, "P(≥1) with range at hi");
  close(r.jackpot.killsToFirst ?? NaN, 1 / (1 - 0.99 * 0.9), "kills to first = 1/p");
  assert.equal(r.jackpot.unknownRateCount, 1);

  const sure = jackpotOf(r.loot, 0.5);
  assert.equal(sure.p, 1, "a guaranteed drop worth the entry makes the jackpot certain");
  assert.deepEqual(jackpotOf(r.loot, 0).items, [], "no entry cost → no jackpot threshold");

  const covered = bossEv({ ...TIER, entry: [{ itemId: "a", qty: 0.5 }] }, priceLookup(syntheticInputs()), ART);
  assert.ok(covered.breakEven.every((b) => b.pStarNet === 0), "guaranteed loot already covers the entry");
}

function testEntryEdgeCases(): void {
  const cheapBuy = bossEv(TIER, priceLookup(syntheticInputs({ b: 1.5 })), ART);
  assert.deepEqual([cheapBuy.entryLines[1]?.route, cheapBuy.entryLines[1]?.costDiv], ["buy", 1.5], "buy wins when cheaper");

  const noPart = syntheticInputs();
  (noPart.ninja as Map<string, unknown>).delete("c");
  const partless = bossEv(TIER, priceLookup(noPart), ART);
  assert.deepEqual([partless.entryLines[1]?.craftDiv, partless.entryLines[1]?.route], [null, "buy"], "unpriced recipe part → no craft route");

  const missing = syntheticInputs();
  (missing.ninja as Map<string, unknown>).delete("a");
  const incomplete = bossEv(TIER, priceLookup(missing), ART);
  assert.equal(incomplete.entryComplete, false);
  assert.equal(incomplete.entryLines[0]?.costDiv, null);
  assert.equal(incomplete.entryLines[0]?.name, "a", "unpriced entry falls back to its id");
  close(incomplete.entryDiv, 2, "entry sums only priced lines");
  assert.match(incomplete.varianceNote, /entry shown is a lower bound.*net and EV per Div are upper bounds/, "net overstates, never understates");
}

function testPricing(): void {
  const inputs = syntheticInputs();
  assert.deepEqual(resolvePrice({ kind: "scout", name: "SCOUTED" }, inputs), { div: 3, source: "scout", ageHours: 20 }, "scout keys are case-insensitive");
  const manual = resolvePrice({ kind: "manual", div: 7, asOf: "2026-09-27" }, inputs);
  assert.equal(manual?.source, "manual");
  close(manual?.ageHours ?? NaN, 36, "manual age counts from its asOf date");
  assert.equal(resolvePrice({ kind: "unpriced", reason: "x" }, inputs), null);
  assert.equal(resolvePrice({ kind: "ninja", itemId: "nope" }, inputs), null);
}

function testDbPricing(): void {
  freshToolsDb();
  const row = (itemId: string, baseValue: number) => ({
    itemId, itemName: itemId, category: "Fragments", baseValue, volume: 1, change7d: null, spark7d: null, icon: `https://x/${itemId}.png`,
  });
  insertSnapshots("L", [row("fresh", 2), row("delisted", 9), row("unreferenced", 1), row("zero", 0)]);
  getDb().prepare("UPDATE price_snapshots SET fetched_at = datetime('now', '-30 days') WHERE item_id = 'delisted'").run();
  const inputs = loadPriceInputs("L", new Set(["fresh", "delisted", "zero"]));
  assert.deepEqual([...inputs.ninja.keys()].sort(), ["delisted", "fresh"], "only referenced, positive prices");
  assert.ok((inputs.ninja.get("fresh")?.ageHours ?? 99) < 1, "fresh item is fresh");
  assert.ok((inputs.ninja.get("delisted")?.ageHours ?? 0) > 24 * 29, "a delisted item keeps its own old age");
  assert.equal(inputs.scoutAgeHours, null, "empty valuation cache has no age");
}

function testPatchWarning(): void {
  const before = Date.parse("2026-10-01T00:00:00Z");
  const after = Date.parse("2026-12-11T00:00:00Z");
  assert.ok(comparePatch("0.5.4", "0.5.4d") < 0 && comparePatch("0.5.4d", "0.5.5") < 0 && comparePatch("0.5.10", "0.5.9") > 0);
  assert.equal(comparePatch("0.5.5b", "0.5.5b"), 0);
  assert.ok(comparePatch("0.5.4d", "0.5.4.1") < 0 && comparePatch("0.5.4.1", "0.5.5") < 0, "four-part versions from patch titles");
  assert.equal(comparePatch("0.5.4", "0.5.4.0"), 0);
  const level = (file: string, coverage: string, now = before) => patchWarning(file, coverage, now)?.level ?? null;
  assert.equal(level("0.5.5", "0.5.4d"), null, "tables curated AHEAD of the game-data snapshot are fine");
  assert.equal(level("0.5.5", "0.5.5"), null);
  assert.equal(level("0.5.5b", "0.5.5"), null);
  const hotfix = patchWarning("0.5.5", "0.5.5b", before);
  assert.equal(hotfix?.level, "recheck", "a hotfix-only delta is a nudge, not the obsolete banner");
  assert.match(hotfix?.text ?? "", /hotfix 0\.5\.5b.*re-check/);
  assert.equal(level("0.5.5", "0.5.5.1"), "obsolete", "a numeric sub-patch is a real change");
  assert.equal(level("0.5.5", "0.6.0"), "obsolete");
  const soft = patchWarning("0.5.5", "0.5.5", after);
  assert.equal(soft?.level, "recheck", "after the 1.0 date: a soft nudge only");
  assert.match(soft?.text ?? "", /1\.0 launched.*re-check/);
  assert.equal(level("0.5.5", "1.0.0", after), "obsolete", "coverage past the file is what makes them obsolete");
  assert.throws(() => patchWarning("0.5.5", "latest", before), /unparseable patch/);
  assert.throws(() => patchCoverageSchema.parse({ ...realCoverage(), game_data_patch: "0.5.4 hotfix" }), /patch version/);
}

function realCoverage(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), "src/data/poe2/patch-coverage.json"), "utf8")) as Record<string, unknown>;
}

type LootSpec = Tier["loot"][number];
const loot = (name: string, itemId: string, rate: LootSpec["rate"], confidence: LootSpec["confidence"]): LootSpec => ({
  name, priceRef: { kind: "ninja", itemId }, rate, confidence, source: SRC,
});
/** Entry 4 (as TIER), guaranteed G worth 1 unless replaced. */
const headlineOf = (lines: LootSpec[], prices: Partial<Record<string, number>> = {}, entry: Tier["entry"] = TIER.entry) =>
  breakEvenHeadline(bossEv({ ...TIER, entry, loot: lines }, priceLookup(syntheticInputs(prices)), ART), 400);

function testHeadlines(): void {
  const G = loot("G", "g", { kind: "guaranteed" }, "confirmed");
  // Chase priced 100 at an unverified 1%: p*net = (4 − 1) / 100 = 3% > 1% → red, capped to amber.
  const failing = headlineOf([G, loot("U", "u", { kind: "point", p: 0.01 }, "unverified")]);
  assert.equal(failing.text, "pays if U drops more than 1 in 33 · est. 1 in 100, unverified", "confidence is in the visible text");
  assert.equal(failing.tone, "warn", "an unverified rate never paints the verdict red");
  assert.equal(headlineOf([G, loot("U", "u", { kind: "point", p: 0.01 }, "confirmed")]).tone, "bad", "a confirmed failing rate is red");
  assert.equal(headlineOf([G, loot("U", "u", { kind: "unknown" }, "confirmed")]).tone, "neutral", "no rate, no verdict");

  // EV covers the entry through a mid drop although the chase's own rate fails its break-even.
  const lines = [G, loot("P", "p", { kind: "point", p: 0.35 }, "single-source"), loot("U", "u", { kind: "point", p: 0.001 }, "confirmed")];
  const viaEv = headlineOf(lines);
  assert.equal(viaEv.text, "priced EV covers entry (1.15×) · single-source", "says EV covers it, not that the chase pays");
  assert.equal(viaEv.tone, "warn", "EV resting on a single-source rate stays amber");
  const allConfirmed = lines.map((l) => ({ ...l, confidence: "confirmed" as const }));
  assert.equal(headlineOf(allConfirmed).tone, "good", "only confirmed deciding rates earn green");

  // Chase priced exactly the uncovered entry (4 − 1 = 3): pStarNet === 1 → no single drop repays it.
  const exact = headlineOf([G, loot("X", "x", { kind: "point", p: 0.1 }, "confirmed")], { x: 3 });
  assert.equal(exact.text, "no single drop repays the entry");
  assert.equal(exact.tone, "muted");

  const sure = headlineOf([G, loot("P", "p", { kind: "point", p: 0.1 }, "confirmed")], {}, [{ itemId: "a", qty: 0.5 }]);
  assert.deepEqual([sure.text, sure.tone], ["guaranteed loot covers entry · confirmed", "good"]);
  const sureSingle = headlineOf([{ ...G, confidence: "single-source" }], {}, [{ itemId: "a", qty: 0.5 }]);
  assert.deepEqual([sureSingle.text, sureSingle.tone], ["guaranteed loot covers entry · single-source", "warn"]);

  const incomplete = headlineOf([G], {}, [{ itemId: "missing", qty: 1 }, { itemId: "a", qty: 1 }]);
  assert.deepEqual([incomplete.text, incomplete.tone], ["entry partly unpriced", "muted"], "never a verdict on a partial entry");

  assert.equal(fmtDiv(0, 400), "0 div");
  assert.equal(fmtDiv(-0.5, 400, true), "−200 ex");
  assert.equal(fmtDiv(0.0061, 0), "0.0061 div", "no rate: a tiny value keeps its digits, never reads as 0 div");
  assert.equal(oneIn(1), "every kill");
  assert.equal(capTone("good", []), "warn", "nothing deciding is nothing confirmed");
}

function testCuratedEvaluates(): void {
  const file = parseBossLoot(readCurated());
  const empty: PriceInputs = { ninja: new Map(), scout: new Map(), scoutAgeHours: null, lineage: new Map(), lineageAgeHours: null, scoutZero: new Set(), nowMs: NOW };
  const bosses = evaluateBosses(file, priceLookup(empty), ART);
  const rows = buildFarmBoard([], bosses, 0);
  const payload = {
    computedLeague: "L", mechanics: [], bosses: rows, details: bosses, dataAsOf: file.dataAsOf, patch: file.patch,
    patchWarning: null, rates: null, pricesFetchedAt: null, scoutAgeHours: null,
  };
  farmResponseSchema.parse(payload);
  assert.equal(rows.length, file.bosses.length, "one board row per curated boss");
  for (const boss of bosses) {
    for (const tier of boss.tiers) {
      assert.equal(tier.entryComplete, false, `${boss.id}: nothing priced → entry incomplete`);
      assert.equal(tier.breakEven.length, 0, `${boss.id}: no break-even without prices`);
      assert.equal(tier.unpriced.length, tier.loot.length, `${boss.id}: every line visibly unpriced`);
    }
  }
}

testCuratedFile();
testStrictness();
testSyntheticTier();
testBreakEvenAndJackpot();
testEntryEdgeCases();
testPricing();
testDbPricing();
runFarmSpeedDbCases(getDb(), NOW);
runLineagePricingCase(parseBossLoot(readCurated()));
testPatchWarning();
testHeadlines();
testCuratedEvaluates();
runFarmBoardCases(TIER, syntheticInputs);
runFarmSpeedCases(TIER, syntheticInputs);
assertPanelExport("src/components/farm/FarmBoard.tsx", "FarmBoard", "src/components/shell/tabs/FarmTab.tsx");
assert.deepEqual(TABS.map((t) => t.id), [...TAB_IDS], "tab nav order must match TAB_IDS, each id once");
assert.equal(new Set(TABS.map((t) => t.label)).size, TABS.length, "tab labels must be distinct");
console.log(
  "ALL PASS — boss-loot strict schema + dated sources + ninja category coverage, 2026-09-29 audit corrections, lineage gems priced from scout's lineage list (0 / absent → unpriced), " +
    "curated poecdn art, omen-pool range, floor fallback + EV confidence wording, loot sort, Tul & Esh + Uhtred rows, " +
    "synthetic EV (guaranteed/point/range/unknown/unpriced/manual), floor/chase/P(lose)/liquidity metrics, farm board order + contract, " +
    "farm Div/hour by own pace (bounds, nulls, PUT validation, per-user rows, loadFarmBoard), " +
    "break-even, headline wording + confidence-capped tone, jackpot, craft-vs-buy entry, per-item price age, patch warning, panel wiring",
);
