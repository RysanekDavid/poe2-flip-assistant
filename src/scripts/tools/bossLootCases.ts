/* Curated boss-loot.json facts pinned by the 2026-09-29 audits, plus ninja-category coverage and
 * lineage-gem pricing from poe2scout's lineage list ("unpriced, never 0"). Imported by testBossEv.ts. */
import assert from "node:assert/strict";
import { CATEGORIES } from "../../api/types";
import { evaluateBosses } from "../../core/tools/bossEv/ev";
import { byScoutKey, loadPriceInputs, priceLookup, referencedNinjaIds } from "../../core/tools/bossEv/pricing";
import type { Boss, BossLootFile, EntryLine, LootLine, Rate } from "../../core/tools/bossEv/schema";
import { lineageRows, refreshProblem, storeScoutRows } from "../../core/valuation";
import { SCOUT_LINEAGE_SOURCE, SCOUT_UNIQUE_SOURCE, scoutKeysOf, scoutValueMap, uniqueValueMap, upsertItemValues } from "../../db/marketQueries";

const AUDIT_DAY = "2026-09-29";

function boss(file: BossLootFile, id: string): Boss {
  const b = file.bosses.find((x) => x.id === id);
  assert.ok(b, `curated file has boss ${id}`);
  return b;
}

function lootOf(file: BossLootFile, id: string): LootLine[] {
  const tiers = boss(file, id).tiers;
  assert.equal(tiers.length, 1, `${id} has exactly one tier`);
  return tiers[0]!.loot;
}

function rateOf(file: BossLootFile, id: string, name: string): Rate {
  const line = lootOf(file, id).find((l) => l.name === name);
  assert.ok(line, `${id} drops ${name}`);
  return line.rate;
}

const point = (p: number): Rate => ({ kind: "point", p });
/** Entry lines without their curated art, which the art tests cover. */
const bare = (entry: readonly EntryLine[]): Array<Omit<EntryLine, "icon">> => entry.map(({ icon: _icon, ...rest }) => rest);

function testXeshtAndBodach(file: BossLootFile): void {
  const xesht = boss(file, "xesht");
  assert.deepEqual(xesht.tiers.map((t) => [t.id, bare(t.entry)]), [["sac", [{ itemId: "breachlord-sac", qty: 1 }]]], "Xesht: one Breachlord Sac per attempt");
  assert.ok(!xesht.tiers.some((t) => t.entry.some((e) => e.itemId === "breach-splinter")), "Xesht: no splinter difficulty tiers in 0.5");
  assert.ok(xesht.sources.some((s) => s.url.includes("game8.co/games/Path-of-Exile-2/archives/604463")));
  const bodach = boss(file, "bodach").tiers[0]!;
  assert.deepEqual(bare(bodach.entry), [{ itemId: "call-of-the-shadows", qty: 5, craftFrom: [{ itemId: "head-of-the-king", qty: 0.2 }] }]);
  const want: Array<[string, number]> = [
    ["Forgotten Warden", 0.34], ["Sylvan's Effigy", 0.14], ["Periphery", 0.09], ["Carved Tenacity", 0.08], ["Mórrigan's Insight", 0.04],
    ["Liminal Coil", 0.03], ["Catha's Brilliance", 0.03], ["Carved Mischief", 0.02], ["Vestige of Darkness", 0.01], ["Carved Cunning", 0.01],
  ];
  for (const [name, p] of want) assert.deepEqual(rateOf(file, "bodach", name), point(p), `Bodach ${name}`);
  assert.deepEqual(rateOf(file, "bodach", "Carved Majesty"), { kind: "unknown" });
  for (const idol of ["carved-majesty", "carved-cunning", "carved-tenacity", "carved-mischief"]) {
    assert.ok(bodach.loot.some((l) => l.priceRef.kind === "ninja" && l.priceRef.itemId === idol), `${idol} priced from ninja Idols`);
  }
  for (const name of ["Carved Tenacity", "Vestige of Darkness"]) {
    assert.equal(bodach.loot.find((l) => l.name === name)?.confidence, "conflicting", `${name}: Farm of Exile and Maxroll disagree`);
  }
  for (const name of ["Mórrigan's Insight", "Catha's Brilliance"]) assert.equal(bodach.loot.find((l) => l.name === name)?.lineage, true, `${name} is a lineage gem`);
}

function testRatesAndDrops(file: BossLootFile): void {
  const tang = lootOf(file, "tangmazu");
  assert.ok(!tang.some((l) => l.name.includes("Reliquary Key")), "Tangmazu's key drops from the Simulacrum, not Tangmazu");
  const tangRates: Array<[string, number]> = [["Veilpiercer", 0.35], ["Sadist's Mercy", 0.3], ["The Auspex", 0.17], ["Horror's Flight", 0.1], ["The Raven's Flock", 0.05], ["Split Personality", 0.03]];
  for (const [name, p] of tangRates) assert.deepEqual(rateOf(file, "tangmazu", name), point(p), `Tangmazu ${name}`);
  const ashRates: Array<[string, number]> = [
    ["Morior Invictus", 0.48], ["Prism of Belief", 0.23], ["Sacred Flame", 0.12], ["Arbiter's Ignition", 0.03], ["The Arbiter's Reliquary Key", 0.005],
  ];
  for (const name of ["Solus Ipse", "Ab Aeterno", "Sine Aequo"]) {
    assert.deepEqual(rateOf(file, "arbiter-of-ash", name), { kind: "unknown" }, `${name}: no published rate`);
    const src = lootOf(file, "arbiter-of-ash").find((l) => l.name === name)?.source.url ?? "";
    assert.ok(!src.includes("farmofexile.com"), `${name} is not credited to Farm of Exile`);
  }
  for (const [name, p] of ashRates) assert.deepEqual(rateOf(file, "arbiter-of-ash", name), point(p), `Arbiter of Ash ${name}`);
  // poe2wiki's 0.3.0 estimates; Olroth's Resolve is listed there as "<1%"
  const olRates: Array<[string, number]> = [["Olrovasara", 0.42], ["Keeper of the Arc", 0.32], ["Svalinn", 0.11], ["Heroic Tragedy", 0.125]];
  for (const [name, p] of olRates) assert.deepEqual(rateOf(file, "olroth", name), point(p), `Olroth ${name}`);
  assert.deepEqual(rateOf(file, "olroth", "Olroth's Resolve"), { kind: "range", lo: 0, hi: 0.01 });
  assert.deepEqual(rateOf(file, "olroth", "Shattered Triskelion"), { kind: "guaranteed" });
  for (const name of ["Uhtred's Exodus", "Uhtred's Omen", "Uhtred's Augury"]) assert.deepEqual(rateOf(file, "olroth", name), { kind: "unknown" });
  assert.deepEqual(rateOf(file, "trialmaster", "Ixchel's Torment"), { kind: "unknown" });
  const divinity = lootOf(file, "arbiter-of-divinity").map((l) => l.name);
  assert.ok(divinity.includes("Opportunity") && !divinity.includes("Decree of Opportunity"), "the flask is called Opportunity");
  assert.equal(lootOf(file, "king-in-the-mists").find((l) => l.name === "Head of the King")?.confidence, "confirmed");
  assert.ok(boss(file, "vessel-of-kulemak").sources.some((s) => s.url === "https://www.pathofexile.com/forum/view-thread/3968601"), "Kulemak cites the 0.5.3 notes");
}

function testNewBosses(file: BossLootFile): void {
  const sim = boss(file, "simulacrum").tiers[0]!;
  assert.equal(sim.entry[0]?.itemId, "simulacrum");
  assert.deepEqual(rateOf(file, "simulacrum", "Raven's Reflection"), { kind: "guaranteed" });
  assert.ok(sim.loot.some((l) => l.priceRef.kind === "ninja" && l.priceRef.itemId === "tangmazus-reliquary-key" && l.rate.kind === "unknown"));
  assert.deepEqual(bare(boss(file, "aberration").tiers[0]!.entry), [{ itemId: "the-triskelion-reforged", qty: 1 }]);
  const ores = lootOf(file, "aberration").filter((l) => l.priceRef.kind === "ninja" && l.priceRef.itemId.endsWith("-starlit-ore"));
  assert.equal(ores.length, 4, "four Starlit Ores priced from ninja Verisium");
  assert.ok(lootOf(file, "aberration").every((l) => l.rate.kind === "unknown"), "the Aberration publishes no rates");
  assert.deepEqual(bare(boss(file, "zarokh").tiers[0]!.entry), [{ itemId: "djinn-barya", name: "Djinn Barya", qty: 1 }]);
  assert.equal(file.ninjaCategories["djinn-barya"], null, "Djinn Barya is declared not-on-ninja");
  assert.ok(lootOf(file, "zarokh").some((l) => l.priceRef.kind === "ninja" && l.priceRef.itemId === "against-the-darkness"));
  for (const id of ["simulacrum", "aberration", "zarokh"]) {
    for (const l of lootOf(file, id)) assert.ok(l.source.accessed >= AUDIT_DAY, `${id}/${l.name}: new lines are dated ${AUDIT_DAY} or later (re-sourced lines carry their re-check day)`);
  }
}

/** Every ninja id is declared under a type the poller fetches; the audited types are all fetched. */
function testCategoryCoverage(file: BossLootFile): void {
  const types = new Set(CATEGORIES.map((c) => c.type));
  for (const t of ["Idols", "SoulCores", "Verisium", "Abyss", "Ritual", "Fragments", "Breach", "Expedition", "Delirium"]) {
    assert.ok(types.has(t), `CATEGORIES fetches ${t}`);
  }
  for (const id of referencedNinjaIds(file)) {
    assert.ok(id in file.ninjaCategories, `${id} declared in ninjaCategories`);
    const cat = file.ninjaCategories[id];
    if (cat != null) assert.ok(types.has(cat), `${id}: ${cat} is fetched by the poller`);
  }
}

/**
 * A name scout moves from its uniques list to the lineage list: the lineage refresh skips only that
 * name (reported, never fatal), the next uniques refresh drops it (replace semantics), and the next
 * lineage refresh then writes it.
 */
function testNameMovesBetweenLists(): void {
  const league = "MOVE";
  const row = (name: string, source: typeof SCOUT_UNIQUE_SOURCE | typeof SCOUT_LINEAGE_SOURCE) => ({ nameKey: name.toLowerCase(), div: 1, source });
  storeScoutRows(league, SCOUT_UNIQUE_SOURCE, [row("Moved’s Gem", SCOUT_UNIQUE_SOURCE), row("Stays", SCOUT_UNIQUE_SOURCE)]);
  const lineage = [row("Moved's Gem", SCOUT_LINEAGE_SOURCE), row("Other Gem", SCOUT_LINEAGE_SOURCE)];
  const first = storeScoutRows(league, SCOUT_LINEAGE_SOURCE, lineage);
  assert.deepEqual(first, { written: 1, collided: ["moved's gem"] }, "only the colliding name is skipped (compared by scoutKey), the rest is written");
  assert.match(refreshProblem(first) ?? "", /skipped 1 name.*moved's gem/, "…and named on a red heartbeat");
  storeScoutRows(league, SCOUT_UNIQUE_SOURCE, [row("Stays", SCOUT_UNIQUE_SOURCE)]);
  assert.deepEqual([...scoutKeysOf(league, SCOUT_UNIQUE_SOURCE)], ["stays"], "replace semantics: a name scout stopped listing leaves the uniques rows");
  assert.deepEqual(storeScoutRows(league, SCOUT_LINEAGE_SOURCE, lineage), { written: 2, collided: [] }, "the moved name is written as lineage on the next refresh");
  assert.equal(refreshProblem({ written: 2, collided: [] }), null);
  assert.throws(() => byScoutKey(new Map([["moved's gem", 1], ["moved’s gem", 2]])), /collide after normalising/, "two rows folding onto one key fail loudly");
}

// A gem scout lists at 0 ("no current price") and one it does not list at all: both must stay unpriced.
const ZERO_GEM = "Uul-Netol's Embrace";
const ABSENT_GEM = "Tul's Stillness";

/**
 * Lineage gems price from poe2scout's lineage list (item_values rows tagged scout-lineage), in
 * Exalted converted at the league rate. A gem listed at 0 and one not listed both resolve to null —
 * in `unpriced` with distinct reasons, never an EV of 0. Scout's spelling may differ from ours in
 * case, apostrophes and diacritics. Needs the temp DB (run after freshToolsDb).
 */
export function runLineagePricingCase(file: BossLootFile): void {
  const league = "LINEAGE";
  const lines = file.bosses.flatMap((b) => b.tiers.flatMap((t) => t.loot));
  const scoutNames = lines.flatMap((l) => (l.priceRef.kind === "scout" && !l.lineage ? [l.priceRef.name] : []));
  upsertItemValues(league, scoutNames.map((n) => ({ nameKey: n.toLowerCase(), div: 1, source: SCOUT_UNIQUE_SOURCE })));
  const gems = lines.flatMap((l) => (l.lineage && l.priceRef.kind === "scout" && l.name !== ABSENT_GEM ? [l.priceRef.name] : []));
  // scout's own spelling: no diacritic, curly apostrophe
  const spelled = (n: string): string => (n === "Mórrigan's Insight" ? "Morrigan’s Insight" : n);
  const rows = lineageRows(gems.map((name) => ({ name: spelled(name), priceExalt: name === ZERO_GEM ? 0 : 538 })), 538);
  assert.ok(rows.every((r) => r.source === SCOUT_LINEAGE_SOURCE), "lineage rows are tagged apart from uniques");
  assert.equal(rows.find((r) => r.nameKey === ZERO_GEM.toLowerCase())?.div, 0, "a 0 ex gem is stored as 'listed at 0', which readers skip");
  assert.throws(() => lineageRows([], 0), /positive ex\/div/, "no rate, no conversion");
  assert.throws(() => lineageRows([{ name: "X", priceExalt: -1 }], 538), /negative/, "a negative scout price is a shape change, not a value");
  assert.deepEqual(lineageRows([{ name: "Dup", priceExalt: 0 }, { name: "dup", priceExalt: 538 }], 538), [{ nameKey: "dup", div: 1, source: SCOUT_LINEAGE_SOURCE }], "a name listed twice keeps its priced row");
  assert.deepEqual(storeScoutRows(league, SCOUT_LINEAGE_SOURCE, rows).collided, [], "curated gem names do not collide with uniques");
  testNameMovesBetweenLists();
  assert.ok(!uniqueValueMap(league).has(rows[0]!.nameKey), "unique readers (the regex tool) never see lineage rows");
  assert.ok(!scoutValueMap(league).has(ZERO_GEM.toLowerCase()), "a 0 row is never read as a value");
  const bosses = evaluateBosses(file, priceLookup(loadPriceInputs(league, referencedNinjaIds(file))), new Map());
  let lineage = 0;
  for (const b of bosses) {
    for (const t of b.tiers) {
      for (const l of t.loot.filter((x) => x.lineage)) {
        lineage += 1;
        const expectPriced = l.name !== ZERO_GEM && l.name !== ABSENT_GEM;
        assert.equal(l.price?.div ?? null, expectPriced ? 1 : null, `${b.id}/${l.name}: priced from the lineage list or unpriced`);
        if (!expectPriced) assert.ok(t.unpriced.includes(l.name) && l.evDiv == null, `${b.id}/${l.name}: unpriced, never an EV of 0`);
      }
      for (const l of t.loot) if (l.price == null) assert.equal(l.evDiv, null, `${b.id}/${l.name}: unpriced line has no EV`);
    }
  }
  assert.ok(lineage >= 25, `the lineage gems are flagged (${lineage})`);
  const xesht = bosses.find((b) => b.id === "xesht")?.tiers[0];
  assert.equal(xesht?.unpricedLineage, 2, "Xesht: the 0-priced and the absent gem count as unpriced lineage");
  const reason = (name: string): string | null | undefined => xesht?.loot.find((l) => l.name === name)?.unpricedReason;
  assert.deepEqual([reason(ZERO_GEM), reason(ABSENT_GEM)], ["listed by poe2scout at 0 (no current price)", "not listed by poe2scout"]);
  const barya = bosses.find((b) => b.id === "zarokh")?.tiers[0]?.entryLines[0];
  assert.deepEqual([barya?.name, barya?.costDiv], ["Djinn Barya", null], "an entry ninja does not list shows its curated name, unpriced");
  for (const id of ["xesht", "olroth"]) {
    const rated = file.bosses.find((b) => b.id === id)!.tiers[0]!.loot.filter((l) => l.confidence === "confirmed" && l.rate.kind !== "guaranteed");
    assert.deepEqual(rated.map((l) => l.name), [], `${id}: no single-cited line claims confirmed`);
  }
}

export function runCuratedCases(file: BossLootFile): void {
  assert.ok(file.bosses.length >= 12, "twelve sourced bosses incl. Simulacrum, Aberration, Zarokh");
  testXeshtAndBodach(file);
  testRatesAndDrops(file);
  testNewBosses(file);
  testCategoryCoverage(file);
}
