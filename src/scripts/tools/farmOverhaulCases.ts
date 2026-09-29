/* Farm overhaul (2026-09-29): hand-set art (schema + curated coverage), the omen-pool price range,
 * scout price 0 as unpriced, board cell wording (entry chips, floor fallback, EV confidence), detail
 * sort order, and the new Tul & Esh / Uhtred rows. Imported by testBossEv.ts. */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseBossArt, type BossArt } from "../../core/tools/bossEv/art";
import { LOCAL_ART_IDS, localArtId } from "../../core/tools/bossEv/localArt";
import { rawBossLoot } from "../../core/tools/bossEv/curated";
import { bossEv, evaluateBosses } from "../../core/tools/bossEv/ev";
import { floorOf } from "../../core/tools/bossEv/metrics";
import { priceLookup, resolvePrice, type PriceInputs } from "../../core/tools/bossEv/pricing";
import { entryBreakdown, entryLabel, evConfidenceText, floorFallback, floorTitle, loseCaveats, sortLoot } from "../../core/tools/bossEv/rowText";
import { scoutKey } from "../../lib/scoutKey";
import { parseBossLoot, type BossLootFile, type Tier } from "../../core/tools/bossEv/schema";
import type { LootLineView } from "../../lib/tools/bossEvContract";

const SRC = { title: "synthetic", url: "https://example.com/s", accessed: "2026-09-01" };
const NOW = Date.parse("2026-09-28T12:00:00Z");
const POECDN = "https://web.poecdn.com/gen/image/x/y/Art.png";

const readJson = (rel: string): Record<string, unknown> => JSON.parse(readFileSync(join(process.cwd(), rel), "utf8")) as Record<string, unknown>;

function inputs(ninja: Record<string, number>, scout: Record<string, number> = {}): PriceInputs {
  const quotes = Object.entries(ninja).map(([id, div]) => [id, { div, name: id, icon: `${POECDN}?${id}`, ageHours: div, volume: 1 }] as const);
  return { ninja: new Map(quotes), scout: new Map(Object.entries(scout)), scoutAgeHours: 3, lineage: new Map(), lineageAgeHours: null, scoutZero: new Set(), nowMs: NOW };
}

function testArtSchema(): void {
  assert.throws(() => parseBossArt({ provenance: "p", fetched: "2026-09-29", icons: { X: "https://cdn.poe2db.tw/x.webp" } }), /boss-art\.json invalid/, "art outside poecdn breaks the CSP");
  assert.throws(() => parseBossArt({ provenance: "p", fetched: "2026-09-29", icons: {}, extra: 1 }), /boss-art\.json invalid/, "strict keys");
  const loot = rawBossLoot();
  const bosses = loot.bosses as Array<Record<string, unknown>>;
  const withIcon = (icon: string): unknown => ({ ...loot, bosses: [{ ...bosses[0], icon }, ...bosses.slice(1)] });
  assert.throws(() => parseBossLoot(withIcon("http://evil.example/a.png")), /boss loot tables invalid/, "boss icon must be poecdn");
  assert.doesNotThrow(() => parseBossLoot(withIcon(POECDN)));
  const withRarity = (rarity: unknown): unknown => {
    const copy = JSON.parse(JSON.stringify(loot)) as { bosses: Array<{ tiers: Array<{ loot: Array<Record<string, unknown>> }> }> };
    copy.bosses[0]!.tiers[0]!.loot[0]!.rarity = rarity;
    return copy;
  };
  assert.throws(() => parseBossLoot(withRarity("Rare")), /boss loot tables invalid/, "a rarity label must cite its own source");
  assert.doesNotThrow(() => parseBossLoot(withRarity({ label: "Rare", source: SRC })));
  const conflicting = parseBossLoot(loot).bosses.find((b) => b.id === "bodach")?.tiers[0]?.loot.find((l) => l.name === "Carved Tenacity");
  assert.deepEqual([conflicting?.confidence, conflicting?.rarity?.label], ["conflicting", "Extremely Rare"], "the conflicting label shows the other source's view");
}

/** Every scout-priced drop (uniques, lineage gems) has curated art, and every art entry names a real line. */
function testCuratedArt(file: BossLootFile, art: BossArt): void {
  const names = new Set(file.bosses.flatMap((b) => b.tiers.flatMap((t) => t.loot.map((l) => l.name))));
  for (const key of art.keys()) assert.ok(names.has(key), `boss-art.json: "${key}" is not a curated drop`);
  for (const b of file.bosses) {
    for (const l of b.tiers.flatMap((t) => t.loot)) {
      if (l.priceRef.kind === "scout") assert.ok(art.has(l.name), `${b.id}/${l.name}: scout-priced drop needs curated art`);
    }
  }
  // empty ninja: every chip and drop must carry curated art on its own, ninja's image is a bonus
  const bosses = evaluateBosses(file, priceLookup(inputs({})), art);
  for (const b of bosses) {
    assert.ok(b.icon, `${b.id}: boss art`);
    for (const t of b.tiers) {
      for (const e of t.entryLines) assert.ok(e.icon, `${b.id}: entry chip ${e.name} has no art`);
      for (const l of t.loot) assert.ok(l.icon, `${b.id}: drop ${l.name} has no art`);
      if (t.unmodelledEntry) assert.ok(t.unmodelledEntry.icon, `${b.id}: unmodelled entry art`);
    }
  }
  assert.ok(bosses.find((b) => b.id === "tangmazu")?.icon?.startsWith("https://web.poecdn.com/"), "Tangmazu: hand-set boss art");
  const used = new Set([...art.values(), ...bosses.flatMap((b) => b.tiers.flatMap((t) => t.entryLines.map((e) => e.icon ?? "")))]);
  for (const id of LOCAL_ART_IDS) {
    assert.ok(existsSync(join(process.cwd(), "src/assets/items", `${id}.png`)), `self-hosted art src/assets/items/${id}.png exists`);
  }
  for (const icon of used) if (icon.startsWith("asset:")) assert.ok(localArtId(icon), `${icon} is a known local-art token`);
  assert.equal(localArtId("asset:not-a-file"), null);
}

/** No boss cites the same source twice (a duplicate would also be a duplicate React key). */
function testUniqueSources(file: BossLootFile): void {
  for (const b of file.bosses) {
    const urls = b.sources.map((s) => s.url);
    assert.equal(new Set(urls).size, urls.length, `${b.id}: duplicate source`);
  }
}

const POOL_TIER: Tier = {
  id: "t",
  label: "pool",
  entry: [{ itemId: "e", qty: 1 }],
  loot: [
    {
      name: "Omen (1 of 4)",
      priceRef: { kind: "pool", members: [{ itemId: "o1", name: "O1" }, { itemId: "o2", name: "O2" }, { itemId: "o3", name: "O3" }, { itemId: "gone", name: "Gone" }] },
      rate: { kind: "guaranteed" },
      confidence: "single-source",
      source: SRC,
    },
    { name: "Zero", priceRef: { kind: "scout", name: "Zero" }, rate: { kind: "point", p: 0.5 }, confidence: "single-source", source: SRC },
  ],
};

function testPoolAndScoutZero(): void {
  const r = bossEv(POOL_TIER, priceLookup(inputs({ e: 2, o1: 10, o2: 1, o3: 5 }, { zero: 0 })), new Map());
  const pool = r.loot[0]!;
  assert.deepEqual(pool.pool, { minDiv: 1, medianDiv: 5, maxDiv: 10, priced: 3, total: 4, unpricedMembers: ["Gone"], ageHours: 10 }, "range over priced members; missing ones named");
  assert.equal(pool.price?.div, 1, "a pool pick is worth at least its cheapest member");
  assert.equal(pool.evDiv, 1, "EV counts the pool minimum");
  assert.equal(floorOf(r.loot), 1, "the floor uses the pool minimum");
  const two = { ...POOL_TIER, loot: [{ ...POOL_TIER.loot[0]!, priceRef: { kind: "pool" as const, members: [{ itemId: "o1", name: "O1" }, { itemId: "o2", name: "O2" }] } }] };
  assert.equal(bossEv(two, priceLookup(inputs({ o1: 10, o2: 1 })), new Map()).loot[0]?.pool?.medianDiv, 5.5, "even member count: mean of the middle two");
  assert.equal(bossEv(POOL_TIER, priceLookup(inputs({ e: 2 })), new Map()).loot[0]?.pool, null, "no member priced → no range, unpriced");
  const zero = r.loot[1]!;
  assert.deepEqual([zero.price, zero.evDiv, zero.unpricedReason], [null, null, "not listed by poe2scout"], "scout 0 is unpriced, never 0");
  const listedZero = bossEv(POOL_TIER, priceLookup({ ...inputs({ e: 2 }), scoutZero: new Set(["zero"]) }), new Map()).loot[1];
  assert.equal(listedZero?.unpricedReason, "listed by poe2scout at 0 (no current price)", "listed at 0 is told apart from not listed");
  const accented = { ...inputs({}), lineage: new Map([[scoutKey("Morrigan’s Insight"), 2]]) };
  assert.equal(resolvePrice({ kind: "scout", name: "Mórrigan's Insight" }, accented)?.div, 2, "case, apostrophe and diacritic insensitive");
  assert.equal(scoutKey("  MÓRRIGAN’S   Insight "), "morrigan's insight");
  assert.equal(resolvePrice({ kind: "scout", name: "zero" }, inputs({}, { zero: 0 })), null);
  assert.ok(r.unpriced.includes("Zero"));
}

const view = (over: Partial<LootLineView>): LootLineView => ({
  name: "x", icon: null, priceKind: "scout", pool: null, rarity: null, unpricedReason: null, price: null, rate: { kind: "unknown" },
  confidence: "single-source", source: SRC, evDiv: null, evLowDiv: null, evHighDiv: null, lineage: false, ...over,
});
const priced = (div: number) => ({ div, source: "scout" as const, ageHours: 1 });

function testCellText(): void {
  const row = { floorDiv: 0, unknownRate: 6, unpriced: ["a", "b"], unpricedLineage: 1, confidence: "single-source" as const, unmodelledEntry: null };
  assert.deepEqual(floorFallback(row), {
    text: "≥ 0 · no guaranteed priced drop",
    title: "no guaranteed or 1-in-10-or-better drop has a market price — 6 drops have unknown rates, 2 unpriced (1 lineage)",
  });
  assert.equal(floorFallback({ ...row, floorDiv: 0.5 }), null, "a priced floor shows its value");
  assert.equal(evConfidenceText(row), "lower bound — 6 drops have unknown rates, 2 unpriced (1 lineage) · weakest deciding rate: single-source");
  assert.equal(evConfidenceText({ ...row, unknownRate: 0, unpriced: [], unpricedLineage: 0, confidence: "confirmed" }), "every listed drop priced and rated · weakest deciding rate: confirmed");
  const stronghold = { ...row, unknownRate: 0, unpriced: [], unpricedLineage: 0, unmodelledEntry: { label: "N× Waystone + Stronghold clear", note: "n" } };
  assert.equal(evConfidenceText(stronghold), "upper bound — the entry leaves out N× Waystone + Stronghold clear · weakest deciding rate: single-source", "no 'every drop priced' over-claim");
  assert.deepEqual(loseCaveats({ losingRunUnknownRates: 0, losingRunConfidence: "single-source", unmodelledEntry: stronghold.unmodelledEntry }), [
    "rests on single-source data",
    "the entry leaves out N× Waystone + Stronghold clear",
  ]);
  assert.deepEqual(loseCaveats({ losingRunUnknownRates: 0, losingRunConfidence: "confirmed", unmodelledEntry: null }), [], "confirmed and complete → no star");
  assert.equal(floorTitle([{ name: "Head of the King", evDiv: 1.84, rate: { kind: "guaranteed" } }], 0), "priced loot on most kills (guaranteed, or 1 in 10 or better):\nHead of the King — 1.8 div per kill (guaranteed)");
  const chips = [
    { name: "Weathered Crisis Fragment", qty: 1, icon: null, costDiv: 2.4, route: "buy" as const },
    { name: "Djinn Barya", qty: 1, icon: null, costDiv: null, route: null },
  ];
  assert.equal(entryLabel({ qty: 1, name: "Breachlord Sac" }), "1× Breachlord Sac");
  assert.equal(entryBreakdown(chips, 2.4, false, 0), "1× Weathered Crisis Fragment — 2.4 div\n1× Djinn Barya — unpriced\ntotal ≥ 2.4 div (part of the entry is unpriced)");
  const sorted = sortLoot([
    view({ name: "unpriced" }),
    view({ name: "cheap-unrated", price: priced(1) }),
    view({ name: "rich-unrated", price: priced(90) }),
    view({ name: "small-ev", price: priced(2), evDiv: 0.2 }),
    view({ name: "big-ev", price: priced(4), evDiv: 2 }),
  ]);
  assert.deepEqual(sorted.map((l) => l.name), ["big-ev", "small-ev", "rich-unrated", "cheap-unrated", "unpriced"], "EV first, unrated by price, unpriced last");
}

function testNewRows(file: BossLootFile): void {
  const byId = (id: string) => file.bosses.find((b) => b.id === id);
  const tulEsh = byId("tul-and-esh");
  assert.deepEqual(tulEsh?.tiers[0]?.entry.map((e) => [e.itemId, e.qty]), [["breachstone", 1]], "Tul & Esh: one Breachstone priced");
  assert.match(tulEsh?.tiers[0]?.unmodelledEntry?.label ?? "", /Waystone/, "the Stronghold's waystones are named, not silently dropped");
  assert.deepEqual(tulEsh?.tiers[0]?.loot.map((l) => [l.name, l.rate.kind, l.confidence]), [["Breachlord Sac", "guaranteed", "single-source"]]);
  const uhtred = byId("uhtred")?.tiers[0];
  assert.deepEqual(uhtred?.entry.map((e) => e.itemId), ["expedition-logbook", "uhtreds-saga"]);
  assert.deepEqual(uhtred?.loot.filter((l) => l.lineage).map((l) => l.name), ["Uhtred's Rite", "Uhtred's Constellation"]);
  assert.equal(file.ninjaCategories.breachstone, "Breach");
  assert.equal(file.ninjaCategories["uhtreds-crest-of-the-chalice"], "Verisium");
  const king = byId("king-in-the-mists")?.tiers[0]?.loot.find((l) => l.priceRef.kind === "pool");
  assert.equal(king?.name, "Omen (≥1 of 11, random)");
  const pool = king?.priceRef.kind === "pool" ? king.priceRef.members.map((m) => m.itemId) : [];
  assert.equal(pool.length, 11, "the King's omen pool is the 11 that still drop");
  for (const gone of ["omen-of-corruption", "omen-of-greater-annulment", "omen-of-sinistral-alchemy", "omen-of-dextral-alchemy", "omen-of-sinistral-coronation", "omen-of-dextral-coronation"]) {
    assert.ok(!pool.includes(gone) && !(gone in file.ninjaCategories), `${gone} can no longer drop`);
  }
  const kosis = byId("simulacrum")?.tiers[0]?.loot.map((l) => l.name) ?? [];
  for (const n of ["Assailum", "Perfidy", "Melting Maelstrom", "Collapsing Horizon", "Strugglescream", "Megalomaniac", "Voices"]) assert.ok(kosis.includes(n), `Simulacrum drops ${n}`);
}

export function runFarmOverhaulCases(file: BossLootFile): void {
  const art = parseBossArt(readJson("src/data/poe2/bosses/boss-art.json"));
  testArtSchema();
  testCuratedArt(file, art);
  testUniqueSources(file);
  testPoolAndScoutZero();
  testCellText();
  testNewRows(file);
}
