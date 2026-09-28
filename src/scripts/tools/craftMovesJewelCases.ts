/* test:tools:craft-moves cases for jewels (capacity, liquids, bones), catalysed quality lines,
 * crafted "+1 … Modifier allowed" slots, advanced-copy desecrated headers and the parser markers. */
import assert from "node:assert/strict";
import { parseItem } from "../../core/itemParser";
import { comboFor, type CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { classifyText, type ItemState } from "../../core/tools/craftmoves/classify";
import { evaluateRules, legalMoves } from "../../core/tools/craftmoves/rules";
import { itemText, RING, ringLines, renderFamily } from "./craftMovesFixtures";

function classify(cat: CraftCatalog, text: string): ItemState {
  const r = classifyText(text, cat);
  assert.ok(r, "fixture must parse as an item");
  return r.state;
}

/** Two distinct families of one side on a jewel base, rendered at their lowest tier. */
function jewelLines(cat: CraftCatalog, base: string, side: "prefix" | "suffix", n: number): string[] {
  const families = Object.keys(comboFor(cat, "Jewels", base)?.[side] ?? {}).slice(0, n);
  assert.equal(families.length, n, `${base} must roll ${n} ${side} families`);
  return families.flatMap((f) => renderFamily(cat, "Jewels", base, side, f));
}

const jewel = (cat: CraftCatalog, base: string, lines: string[]): ItemState =>
  classify(cat, itemText({ itemClass: "Jewels", rarity: "Rare", base, ilvl: 80, lines }));

const moveIds = (s: ItemState): string[] => legalMoves(s).map((m) => m.id);

function testBasicJewel(cat: CraftCatalog): void {
  const s = jewel(cat, "Ruby", jewelLines(cat, "Ruby", "prefix", 1));
  assert.deepEqual([s.capacity?.p, s.capacity?.s, s.openPrefixes, s.openSuffixes, s.openTotal], [2, 2, 1, 2, 3], "basic rare jewel = 2P + 2S");
  const ids = moveIds(s);
  for (const want of ["omen-sinistral-exaltation", "omen-dextral-exaltation", "liquid-potent-contempt", "liquid-potent-ferocity", "bone-preserved"]) {
    assert.ok(ids.includes(want), `basic jewel offers ${want}`);
  }
  for (const gone of ["bone-gnawed", "bone-ancient"]) {
    assert.ok(!ids.includes(gone) && !evaluateRules(s).blocked.some((b) => b.id === gone), `${gone}: no such Cranium`);
  }
  const contempt = legalMoves(s).find((m) => m.id === "liquid-potent-contempt")!;
  assert.match(contempt.effect, /\+1 Suffix Modifier allowed' \(sits in a PREFIX slot\)/);
  assert.ok(contempt.verified && contempt.warnings.length === 0, "verified against KB §6; no fixed-damage-prefix warning");
  assert.ok(contempt.notes.some((n) => /unverified/.test(n)), "§6's open question on the removed mod is carried as a note");
  assert.match(evaluateRules(s).blocked.find((b) => b.id === "liquid-ancient-contempt")?.reason ?? "", /Time-Lost/);
}

/** "+1 Suffix Modifier allowed" is crafted, sits in a prefix slot and lifts the suffix limit by one. */
function testContemptSlot(cat: CraftCatalog): void {
  for (const tag of [" (crafted)", ""]) {
    const lines = [...jewelLines(cat, "Ruby", "prefix", 1), `+1 Suffix Modifier allowed${tag}`, ...jewelLines(cat, "Ruby", "suffix", 2)];
    const s = jewel(cat, "Ruby", lines);
    assert.deepEqual([s.slots.crafted, s.prefixes, s.suffixes], [1, 2, 2], `crafted slot counted (tag "${tag}")`);
    assert.deepEqual([s.capacity?.s, s.openPrefixes, s.openSuffixes], [3, 0, 1], "the suffix side gains one slot");
    const ev = evaluateRules(s);
    assert.match(ev.blocked.find((b) => b.id === "liquid-potent-contempt")?.reason ?? "", /ONE crafted mod/, "Contempt not offered again");
    const essence = ev.moves.find((m) => m.id === "essence-perfect");
    assert.ok(essence && !essence.verified && essence.notes.some((n) => /replaces the existing crafted mod/.test(n)), "Perfect Essence replaces, unverified on jewels");
  }
}

function testTimeLost(cat: CraftCatalog): void {
  const s = jewel(cat, "Time-Lost Ruby", jewelLines(cat, "Time-Lost Ruby", "prefix", 1));
  assert.deepEqual([s.timeLost, s.capacity, s.openTotal], [true, null, null], "Time-Lost cap is unresolved (KB §6): nothing counted");
  assert.match(evaluateRules(s).blocked.find((b) => b.id === "exalt")?.reason ?? "", /unresolved/, "no exalt on an unknown cap");
  const moves = legalMoves(s);
  for (const id of ["bone-preserved", "omen-putrefaction"]) {
    assert.equal(moves.find((m) => m.id === id)?.verified, false, `${id} unverified on Time-Lost jewels`);
  }
  assert.ok(moves.some((m) => m.id === "liquid-ancient-contempt"), "Ancient Contempt on Time-Lost");
  assert.match(evaluateRules(s).blocked.find((b) => b.id === "liquid-potent-contempt")?.reason ?? "", /non-Ancient liquids don.t work on Time-Lost/);
}

function testCatalysedRing(cat: CraftCatalog): void {
  const text = itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: ringLines(cat, ["IncreasedLife"], ["FireResistance"]) })
    .replace("Item Level: 82", "Quality (Attribute Modifiers): +20% (augmented)\n--------\nItem Level: 82");
  const s = classify(cat, text);
  assert.deepEqual([s.quality, s.openPrefixes, s.openSuffixes, s.unmatched.length], [20, 2, 2, 0], JSON.stringify(s.unmatched));
  assert.ok(moveIds(s).includes("omen-catalysing-exaltation"), "catalysed 1P/1S ring can Catalysing-exalt");
  assert.match(evaluateRules(s).blocked.find((b) => b.id === "catalyst")?.reason ?? "", /20% cap/);
}

function testDesecratedHeaders(cat: CraftCatalog): void {
  const unrevealed = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: [...ringLines(cat, ["IncreasedLife"], []), '{ Prefix Modifier "" }', "Desecrated Prefix"] }));
  assert.deepEqual([unrevealed.slots.desecrated, unrevealed.slots.unrevealed, unrevealed.prefixes], [1, 1, 2], "advanced unrevealed desecrated prefix");
  assert.ok(moveIds(unrevealed).includes("omen-abyssal-echoes"));
  const light = legalMoves(unrevealed).find((m) => m.id === "omen-light");
  assert.ok(light && !light.verified, "Omen of Light frees the desecrated slot (not in the verified KB)");
  assert.match(evaluateRules(unrevealed).blocked.find((b) => b.id === "bone-preserved")?.reason ?? "", /Omen of Light/);
  const combo = comboFor(cat, RING.itemClass, RING.base)!;
  const modId = Object.values(combo.desecrated).flatMap((t) => Object.keys(t)).find((m) => cat.mods[m]!.side === "suffix" && !cat.mods[m]!.text.includes("\n"))!;
  const line = cat.mods[modId]!.text.replace(/\((-?\d+)-(-?\d+)\)/g, "$1");
  const revealed = classify(cat, itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: [`{ Desecrated Suffix Modifier "${cat.mods[modId]!.name}" }`, line] }));
  assert.equal(revealed.slots.desecrated, 1, "a desecrated header counts without the (desecrated) line tag");
}

function testParserMarkers(): void {
  const parsed = parseItem("Item Class: Gloves\nRarity: Rare\nX\nY\n--------\nQuality (Attribute Modifiers): +20% (augmented)\n--------\n+10% to Fire Resistance (added rune)");
  assert.deepEqual(parsed!.mods.map((m) => [m.raw, m.marker]), [["+10% to Fire Resistance", "rune"]], "added rune → rune; catalysed Quality is not a mod");
}

export function runJewelAndTagCases(cat: CraftCatalog): void {
  testBasicJewel(cat);
  testContemptSlot(cat);
  testTimeLost(cat);
  testCatalysedRing(cat);
  testDesecratedHeaders(cat);
  testParserMarkers();
}
