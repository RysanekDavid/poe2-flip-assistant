/* Craft moves: catalog stamp, KB gate cross-check, classification fixtures, rule provenance,
 * null-not-zero pricing, the desecrated parser marker and the response contract.
 * Run: npm run test:tools:craft-moves */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { toolIdSchema } from "../../components/tools/toolRegistry";
import { parseItem } from "../../core/itemParser";
import { buildStatIndex, resolveLine } from "../../core/statResolver";
import { comboFor, loadCraftCatalog, type CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { classifyText, type ItemState } from "../../core/tools/craftmoves/classify";
import { KB_GATE_EXAMPLES, tierGates } from "../../core/tools/craftmoves/gates";
import { ALL_RULES, evaluateRules, KB, legalMoves } from "../../core/tools/craftmoves/rules";
import { priceMoves } from "../../core/tools/craftmoves/cost";
import { assembleMoves } from "../../core/tools/craftmoves/moves";
import { craftMovesResponseSchema, rulesStale } from "../../lib/tools/craftMovesContract";
import { itemText, RING, ringDesecratedSuffix, ringLines, renderFamily } from "./craftMovesFixtures";
import { assertToolPanel } from "./toolsTestKit";
import { SAMPLE_ITEM } from "../../components/tools/craftmoves/craftMovesClient";

const KB_PATH = join(process.cwd(), "docs", "research", KB);
const kbText = readFileSync(KB_PATH, "utf8").replace(/\r/g, "");

function testCatalogStamp(cat: CraftCatalog): void {
  const manifest = JSON.parse(readFileSync(join(process.cwd(), "src/data/poe2/repoe/manifest.json"), "utf8")) as { artifact_sha256: string; repoe_version: string };
  const coverage = JSON.parse(readFileSync(join(process.cwd(), "src/data/poe2/patch-coverage.json"), "utf8")) as { game_data_patch: string };
  assert.equal(cat.sourceSha256, manifest.artifact_sha256, "craft catalog is stale vs repoe/manifest.json — run npm run build:craft-catalog");
  assert.equal(cat.repoeVersion, manifest.repoe_version);
  assert.equal(cat.gameDataPatch, coverage.game_data_patch);
  for (const cls of ["Rings", "Amulets", "Belts", "Boots", "Gloves", "Body Armours", "Helmets", "Bows", "Jewels", "Quarterstaves"]) {
    assert.ok(cat.classes[cls], `catalog must cover ${cls}`);
  }
  const domains = new Set(Object.values(cat.mods).map((m) => m.domain));
  assert.deepEqual([...domains].sort(), ["desecrated", "item"], "only item-domain and desecrated mods");
  assert.ok(Object.values(cat.mods).some((m) => m.essenceOnly), "essence-only mods are kept");
}

/** Every KB §3 gate row still reads the same in the KB AND matches every base combo in the catalog. */
function testKbGates(cat: CraftCatalog): void {
  const section3 = kbText.slice(kbText.indexOf("## 3."), kbText.indexOf("## 4."));
  for (const ex of KB_GATE_EXAMPLES) {
    for (const row of ex.kbRows) assert.ok(section3.includes(row), `KB §3 no longer contains: ${row}`);
    const combos = Object.values(cat.classes[ex.itemClass] ?? {}).filter((c) => ex.family in c.prefix || ex.family in c.suffix);
    assert.ok(combos.length > 0, `${ex.itemClass} must roll ${ex.family}`);
    for (const combo of combos) {
      const tiers = combo.prefix[ex.family] ?? combo.suffix[ex.family]!;
      const desc = Object.entries(tiers).sort((a, b) => b[1] - a[1]);
      if (ex.tiers != null) assert.equal(desc.length, ex.tiers, `${ex.family} tier count vs KB`);
      for (const e of ex.expect) {
        const [modId, level] = desc[e.fromTop]!;
        assert.equal(level, e.level, `${ex.itemClass} ${ex.family} tier ${e.fromTop} from top: level ${level} vs KB ${e.level}`);
        const stat = cat.mods[modId]!.stats[0]!;
        if (e.min != null) assert.deepEqual([stat.min, stat.max], [e.min, e.max], `${modId} range vs KB`);
      }
    }
  }
}

const ids = (s: ItemState): string[] => legalMoves(s).map((m) => m.id);
const ADD_MOVE = /^(exalt|aug|regal|transmute|alchemy|omen-.*exaltation)/;

function classify(cat: CraftCatalog, text: string): ItemState {
  const r = classifyText(text, cat);
  assert.ok(r, "fixture must parse as an item");
  return r.state;
}

function testFullRare(cat: CraftCatalog): void {
  const lines = ringLines(cat, ["IncreasedLife", "IncreasedMana", "FireDamage"], ["FireResistance", "ColdResistance", "Strength"]);
  const s = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines }));
  assert.deepEqual([s.prefixes, s.suffixes, s.openPrefixes, s.openSuffixes], [3, 3, 0, 0], JSON.stringify(s.unmatched));
  const legal = ids(s);
  assert.equal(legal.filter((id) => ADD_MOVE.test(id)).length, 0, `full rare must offer no add-a-mod move: ${legal.join(",")}`);
  for (const want of ["chaos", "divine", "fracture", "omen-whittling", "omen-sinistral-erasure"]) assert.ok(legal.includes(want), `full rare offers ${want}`);
  const exalt = evaluateRules(s).blocked.find((b) => b.id === "exalt");
  assert.match(exalt?.reason ?? "", /no open affix slot/);
}

function testTwoAndTwo(cat: CraftCatalog): void {
  const s = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: ringLines(cat, ["IncreasedLife", "IncreasedMana"], ["FireResistance", "ColdResistance"]) }));
  assert.deepEqual([s.openPrefixes, s.openSuffixes, s.openTotal], [1, 1, 2]);
  const legal = ids(s);
  for (const want of ["exalt", "exalt-greater", "exalt-perfect", "omen-sinistral-exaltation", "omen-dextral-exaltation", "omen-greater-exaltation"]) {
    assert.ok(legal.includes(want), `2P/2S rare offers ${want}`);
  }
  assert.ok(!legal.includes("omen-sinistral-greater-exaltation"), "two prefixes need two open prefixes");
  const perfect = legalMoves(s).find((m) => m.id === "exalt-perfect")!;
  assert.equal(perfect.floor, 50);
  assert.ok(perfect.notes.some((n) => n.startsWith("cannot roll tiers below modifier level 50")), "soft-floor wording");
  assert.equal(legal.includes("fracture"), true, "4 mods → fracturable");
}

/** The panel's "sample item" is a plain Ctrl+C on a real base: it must read cleanly as 2P/2S. */
function testSample(cat: CraftCatalog): void {
  const s = classify(cat, SAMPLE_ITEM);
  assert.deepEqual([s.baseType, s.prefixes, s.suffixes, s.unmatched.length, s.flags.length], ["Ruby Ring", 2, 2, 0, 0], JSON.stringify(s));
  assert.ok(s.affixes.every((a) => a.modId != null), "every sample line resolves to a tier");
}

function testMagic(cat: CraftCatalog): void {
  const lines = renderFamily(cat, RING.itemClass, RING.base, "suffix", "FireResistance");
  const s = classify(cat, itemText({ ...RING, rarity: "Magic", ilvl: 60, lines }));
  assert.deepEqual([s.openPrefixes, s.openSuffixes], [1, 0]);
  const moves = legalMoves(s);
  const floors = Object.fromEntries(moves.filter((m) => m.id.startsWith("aug")).map((m) => [m.id, m.floor]));
  assert.deepEqual(floors, { aug: null, "aug-greater": 44, "aug-perfect": 70 });
  const perfect = moves.find((m) => m.id === "aug-perfect")!;
  assert.ok(perfect.verified && perfect.warnings.some((w) => /below this floor \(70\)/.test(w)), "ilvl 60 < 70 warns (KB §9)");
  assert.ok(moves.some((m) => m.id === "regal" && !m.verified), "Regal ships unverified");
  assert.ok(!moves.some((m) => m.id === "exalt"), "no exalts on magic");
}

function testDesecrated(cat: CraftCatalog): void {
  const lines = ringLines(cat, ["IncreasedLife"], ["FireResistance"], [ringDesecratedSuffix(cat)]);
  const s = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines }));
  assert.equal(s.slots.desecrated, 1, JSON.stringify(s.affixes));
  const ev = evaluateRules(s);
  for (const bone of ["bone-preserved", "bone-ancient", "omen-liege", "omen-sinistral-necromancy"]) {
    assert.match(ev.blocked.find((b) => b.id === bone)?.reason ?? "", /max ONE per item/, `${bone} refused`);
  }
  const putre = ev.moves.find((m) => m.id === "omen-putrefaction");
  assert.ok(putre && putre.warnings.some((w) => /CORRUPTS/.test(w)), "Putrefaction stays legal, with the corruption warning");
  assert.equal(putre.label, "Omen of Putrefaction + Preserved Collarbone");
}

function testLocksAndUnknowns(cat: CraftCatalog): void {
  const base = { ...RING, rarity: "Rare" as const, ilvl: 82, lines: ringLines(cat, ["IncreasedLife"], ["FireResistance"]) };
  const corrupted = classify(cat, itemText({ ...base, extra: ["Corrupted"] }));
  assert.deepEqual(legalMoves(corrupted), [], "corrupted → no moves");
  assert.match(evaluateRules(corrupted).locked ?? "", /corrupted/);
  const unmatched = classify(cat, itemText({ ...base, lines: [...base.lines, "Grants the wearer a feeling of doom"] }));
  assert.deepEqual([unmatched.openPrefixes, unmatched.openSuffixes, unmatched.openTotal], [null, null, null]);
  assert.deepEqual(unmatched.unmatched, ["Grants the wearer a feeling of doom"]);
  assert.equal(ids(unmatched).filter((id) => ADD_MOVE.test(id)).length, 0, "unmatched → no add moves");
  assert.match(evaluateRules(unmatched).blocked.find((b) => b.id === "exalt")?.reason ?? "", /open slots unknown/);
  const gnawed = evaluateRules(classify(cat, itemText(base))).blocked.find((b) => b.id === "bone-gnawed");
  assert.match(gnawed?.reason ?? "", /Item Level is too high/);
}

function testJewelAndAdvanced(cat: CraftCatalog): void {
  const jewelFamily = Object.keys(comboFor(cat, "Jewels", "Ruby")?.prefix ?? {})[0];
  assert.ok(jewelFamily, "Ruby jewels roll prefixes");
  const jewelLines = renderFamily(cat, "Jewels", "Ruby", "prefix", jewelFamily);
  const jewel = classify(cat, itemText({ itemClass: "Jewels", rarity: "Rare", base: "Ruby", ilvl: 80, lines: jewelLines }));
  assert.deepEqual([jewel.capacity?.total, jewel.openPrefixes, jewel.openTotal], [4, null, 3], "jewels: total known, per side not");
  assert.match(evaluateRules(jewel).blocked.find((b) => b.id === "omen-sinistral-exaltation")?.reason ?? "", /per-side/);
  const adv = classify(cat, itemText({
    ...RING, rarity: "Rare", ilvl: 82,
    lines: ['{ Prefix Modifier "Imaginary" (Tier: 1) }', "Some text the catalog has never seen", '{ Suffix Modifier "of the Kiln" }', "+43(41-45)% to Fire Resistance"],
  }));
  assert.deepEqual([adv.prefixes, adv.suffixes, adv.openPrefixes, adv.openSuffixes], [1, 1, 2, 2], "headers prove sides");
  assert.equal(adv.affixes[1]!.modId, "FireResist8");
  const hybrid = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: ['{ Prefix Modifier "Imaginary" }', "Unknown line one", "Unknown line two"] }));
  assert.deepEqual([hybrid.prefixes, hybrid.affixes.length], [1, 1], "one header = one affix, never one per line");
  // an unknown line still tagged (desecrated) fills the desecrated slot: no bone may be offered
  const tagged = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: [...ringLines(cat, ["IncreasedLife"], []), "Some future desecrated mod (desecrated)"] }));
  assert.equal(tagged.slots.desecrated, 1);
  assert.equal(tagged.openTotal, null, "an unplaceable affix makes open slots unknown");
  assert.match(evaluateRules(tagged).blocked.find((b) => b.id === "bone-preserved")?.reason ?? "", /max ONE per item/);
}

function testRuleProvenance(): void {
  const sections = new Set([...kbText.matchAll(/^## (\d+b?)\./gm)].map((m) => m[1]!));
  for (const r of ALL_RULES) {
    assert.ok(r.source.trim().length > 0, `${r.id} has a source`);
    assert.equal(typeof r.verified, "boolean", `${r.id} carries verified`);
    if (!r.verified) continue;
    const cited = [...r.source.matchAll(new RegExp(`${KB.replace(/\./g, "\\.")} §(\\d+b?)`, "g"))].map((m) => m[1]!);
    assert.ok(cited.length > 0, `verified rule ${r.id} must cite ${KB}`);
    for (const sec of cited) assert.ok(sections.has(sec), `${r.id} cites missing KB section §${sec}`);
  }
  assert.equal(new Set(ALL_RULES.map((r) => r.id)).size, ALL_RULES.length, "rule ids are unique");
}

function testPricing(): void {
  const move = { ...legalMovesStub(), materials: [{ key: "a", label: "A", ninjaId: "a", qty: 2 }, { key: "b", label: "B", ninjaId: "b", qty: 1 }] };
  const unlisted = { ...legalMovesStub(), id: "u", materials: [{ key: "x", label: "X", ninjaId: null, qty: 1 }] };
  const prices = new Map([["a", { priceDiv: 0.5, icon: null, ageMin: 3 }], ["b", { priceDiv: 0, icon: null, ageMin: 3 }]]);
  const [zeroB, none] = priceMoves([move, unlisted], prices, { exaltPerDivine: 100 });
  assert.equal(zeroB!.materials[1]!.unitDiv, null, "a 0 price is unpriced, not free");
  assert.equal(zeroB!.totalDiv, null, "one unpriced material → null total");
  assert.equal(none!.totalDiv, null);
  const [ok] = priceMoves([move], new Map([["a", { priceDiv: 0.5, icon: null, ageMin: 3 }], ["b", { priceDiv: 0.25, icon: null, ageMin: 1 }]]), { exaltPerDivine: 100 });
  assert.equal(ok!.totalDiv, 1.25);
  assert.equal(ok!.totalEx, 125);
  assert.equal(priceMoves([move], new Map(), null)[0]!.totalEx, null, "no rates → no exalt figure");
}

function legalMovesStub() {
  return { id: "m", label: "M", family: "currency" as const, materials: [], requires: "", effect: "", warnings: [], notes: [], floor: null, source: `${KB} §1`, verified: true };
}

function testParserMarker(): void {
  const parsed = parseItem("Item Class: Rings\nRarity: Rare\nX\nRuby Ring\n--------\nItem Level: 80\n--------\n+15% to Cold and Chaos Resistances (desecrated)");
  const line = parsed!.mods[0]!;
  assert.equal(line.marker, "desecrated", "the (desecrated) tag is kept, not folded into explicit");
  assert.equal(line.raw, "+15% to Cold and Chaos Resistances");
  const idx = buildStatIndex([
    { id: "explicit.stat_cc", text: "+#% to Cold and Chaos Resistances", group: "explicit" },
    { id: "implicit.stat_cc", text: "+#% to Cold and Chaos Resistances", group: "implicit" },
  ]);
  assert.equal(resolveLine(line, idx)?.id, "explicit.stat_cc", "desecrated lines resolve to the explicit catalog group");
}

function testContract(cat: CraftCatalog): void {
  const s = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: ringLines(cat, ["IncreasedLife"], ["FireResistance"]) }));
  const body = { league: "Test", ...assembleMoves(s, cat, new Map(), null), bookValue: null, bookError: null };
  const parsed = craftMovesResponseSchema.parse(body);
  assert.ok(parsed.gates.some((g) => g.family === "FireResistance" && g.kbRow != null && g.present), "KB-row gate marked on a present family");
  assert.ok(parsed.moves.every((m) => m.totalDiv === null), "no prices → every total null");
  assert.equal(rulesStale(new Date("2026-12-11T12:00:00Z")), false);
  assert.equal(rulesStale(new Date("2026-12-12T00:00:01Z")), true);
  const gate = tierGates(s, cat).find((g) => g.family === "ChaosResistance");
  assert.equal(gate?.topReachable?.level, 81, "ilvl 82 reaches the level-81 chaos res tier");
}

const cat = loadCraftCatalog();
testCatalogStamp(cat);
testKbGates(cat);
testFullRare(cat);
testTwoAndTwo(cat);
testSample(cat);
testMagic(cat);
testDesecrated(cat);
testLocksAndUnknowns(cat);
testJewelAndAdvanced(cat);
testRuleProvenance();
testPricing();
testParserMarker();
testContract(cat);
assertToolPanel("craft-moves", "CraftMovesTool");
assert.equal(toolIdSchema.parse("craft-moves"), "craft-moves");
for (const bad of ["hunt", "craftmoves", "", "CRAFT-MOVES"]) {
  assert.equal(toolIdSchema.safeParse(bad).success, false, `"${bad}" must not parse as a tool id`);
}
console.log(
  `ALL PASS — craft-moves: catalog stamp, ${KB_GATE_EXAMPLES.length} KB gate rows, fixtures (full/2+2/magic/desecrated/corrupted/unmatched/jewel/advanced), ` +
    `${ALL_RULES.length} rules with provenance, null-not-zero pricing, desecrated marker, contract, panel wiring`,
);
