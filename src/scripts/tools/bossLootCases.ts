/* Curated boss-loot.json facts pinned by the 2026-09-29 audit, plus ninja-category coverage and
 * the lineage-gem "unpriced, never 0" rule. Imported by testBossEv.ts. */
import assert from "node:assert/strict";
import { CATEGORIES } from "../../api/types";
import { evaluateBosses } from "../../core/tools/bossEv/ev";
import { loadPriceInputs, priceLookup, referencedNinjaIds } from "../../core/tools/bossEv/pricing";
import type { Boss, BossLootFile, LootLine, Rate } from "../../core/tools/bossEv/schema";
import { upsertItemValues } from "../../db/marketQueries";

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

function testXeshtAndBodach(file: BossLootFile): void {
  const xesht = boss(file, "xesht");
  assert.deepEqual(xesht.tiers.map((t) => [t.id, t.entry]), [["sac", [{ itemId: "breachlord-sac", qty: 1 }]]], "Xesht: one Breachlord Sac per attempt");
  assert.match(xesht.accessChain, /unresolved/i, "Xesht keeps the splinter-difficulty question open");
  assert.ok(xesht.sources.some((s) => s.url.includes("game8.co/games/Path-of-Exile-2/archives/604463")));
  const bodach = boss(file, "bodach").tiers[0]!;
  assert.deepEqual(bodach.entry, [{ itemId: "call-of-the-shadows", qty: 5, craftFrom: [{ itemId: "head-of-the-king", qty: 0.2 }] }]);
  const want: Array<[string, number]> = [
    ["Forgotten Warden", 0.34], ["Sylvan's Effigy", 0.14], ["Periphery", 0.09], ["Carved Tenacity", 0.08], ["Mórrigan's Insight", 0.04],
    ["Liminal Coil", 0.03], ["Catha's Brilliance", 0.03], ["Carved Mischief", 0.02], ["Vestige of Darkness", 0.01], ["Carved Cunning", 0.01],
  ];
  for (const [name, p] of want) assert.deepEqual(rateOf(file, "bodach", name), point(p), `Bodach ${name}`);
  assert.deepEqual(rateOf(file, "bodach", "Carved Majesty"), { kind: "unknown" });
  for (const idol of ["carved-majesty", "carved-cunning", "carved-tenacity", "carved-mischief"]) {
    assert.ok(bodach.loot.some((l) => l.priceRef.kind === "ninja" && l.priceRef.itemId === idol), `${idol} priced from ninja Idols`);
  }
  for (const name of ["Carved Tenacity", "Vestige of Darkness"]) assert.equal(bodach.loot.find((l) => l.name === name)?.confidence, "unverified");
}

function testRatesAndDrops(file: BossLootFile): void {
  const tang = lootOf(file, "tangmazu");
  assert.ok(!tang.some((l) => l.name.includes("Reliquary Key")), "Tangmazu's key drops from the Simulacrum, not Tangmazu");
  const tangRates: Array<[string, number]> = [["Veilpiercer", 0.35], ["Sadist's Mercy", 0.3], ["The Auspex", 0.17], ["Horror's Flight", 0.1], ["The Raven's Flock", 0.05], ["Split Personality", 0.03]];
  for (const [name, p] of tangRates) assert.deepEqual(rateOf(file, "tangmazu", name), point(p), `Tangmazu ${name}`);
  const ashRates: Array<[string, number]> = [
    ["Morior Invictus", 0.48], ["Prism of Belief", 0.23], ["Sacred Flame", 0.12], ["Solus Ipse", 0.1057], ["Ab Aeterno", 0.0367],
    ["Sine Aequo", 0.0276], ["Arbiter's Ignition", 0.03], ["The Arbiter's Reliquary Key", 0.005],
  ];
  for (const [name, p] of ashRates) assert.deepEqual(rateOf(file, "arbiter-of-ash", name), point(p), `Arbiter of Ash ${name}`);
  const olRates: Array<[string, number]> = [["Olrovasara", 0.36], ["Keeper of the Arc", 0.34], ["Svalinn", 0.15], ["Heroic Tragedy", 0.11], ["Olroth's Resolve", 0.04]];
  for (const [name, p] of olRates) assert.deepEqual(rateOf(file, "olroth", name), point(p), `Olroth ${name}`);
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
  assert.deepEqual(boss(file, "aberration").tiers[0]!.entry, [{ itemId: "the-triskelion-reforged", qty: 1 }]);
  const ores = lootOf(file, "aberration").filter((l) => l.priceRef.kind === "ninja" && l.priceRef.itemId.endsWith("-starlit-ore"));
  assert.equal(ores.length, 4, "four Starlit Ores priced from ninja Verisium");
  assert.ok(lootOf(file, "aberration").every((l) => l.rate.kind === "unknown"), "the Aberration publishes no rates");
  assert.deepEqual(boss(file, "zarokh").tiers[0]!.entry, [{ itemId: "djinn-barya", qty: 1 }]);
  assert.equal(file.ninjaCategories["djinn-barya"], null, "Djinn Barya is declared not-on-ninja");
  assert.ok(lootOf(file, "zarokh").some((l) => l.priceRef.kind === "ninja" && l.priceRef.itemId === "against-the-darkness"));
  for (const id of ["simulacrum", "aberration", "zarokh"]) {
    for (const l of lootOf(file, id)) assert.equal(l.source.accessed, AUDIT_DAY, `${id}/${l.name}: new lines are dated ${AUDIT_DAY}`);
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
 * Lineage gems poe2scout does not list resolve to null — in `unpriced`, never an EV of 0. Needs the
 * temp DB (run after freshToolsDb): every NON-lineage scout name gets a price, the gems stay out.
 */
export function runLineageUnpricedCase(file: BossLootFile): void {
  const league = "LINEAGE";
  const scoutNames = file.bosses.flatMap((b) => b.tiers.flatMap((t) => t.loot)).flatMap((l) => (l.priceRef.kind === "scout" && !l.lineage ? [l.priceRef.name] : []));
  upsertItemValues(league, scoutNames.map((n) => ({ nameKey: n.toLowerCase(), div: 1, source: "scout" })));
  const bosses = evaluateBosses(file, priceLookup(loadPriceInputs(league, referencedNinjaIds(file))));
  let lineage = 0;
  for (const b of bosses) {
    for (const t of b.tiers) {
      const lines = t.loot.filter((l) => l.lineage);
      lineage += lines.length;
      for (const l of lines) {
        assert.equal(l.price, null, `${b.id}/${l.name}: a lineage gem scout does not list is unpriced`);
        assert.equal(l.evDiv, null, `${b.id}/${l.name}: never an EV of 0`);
        assert.ok(t.unpriced.includes(l.name), `${b.id}/${l.name} listed as unpriced`);
      }
      assert.equal(t.unpricedLineage, lines.length, `${b.id}: lineage count on the row chip`);
      for (const l of t.loot) if (l.price == null) assert.equal(l.evDiv, null, `${b.id}/${l.name}: unpriced line has no EV`);
    }
  }
  assert.ok(lineage >= 15, `the audit's lineage gems are flagged (${lineage})`);
}

export function runCuratedCases(file: BossLootFile): void {
  assert.ok(file.bosses.length >= 12, "twelve sourced bosses incl. Simulacrum, Aberration, Zarokh");
  testXeshtAndBodach(file);
  testRatesAndDrops(file);
  testNewBosses(file);
  testCategoryCoverage(file);
}
