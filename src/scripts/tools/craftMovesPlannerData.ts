/* test:tools:craft-moves cases for the craft-planner data layer: catalog v2 (mod groups + implicit
 * tags), the Sinistral/Dextral Crystallisation rules against the omen item text, and the signed
 * "±N … Modifier allowed" capacity of Dusk / Gloam Rings. Imported by testCraftMoves.ts. */
import assert from "node:assert/strict";
import { loadEntityCatalog } from "../../core/entities/load";
import { comboFor, CRAFT_CATALOG_SCHEMA_VERSION, type CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { baseAllowance, classifyText, type ItemState } from "../../core/tools/craftmoves/classify";
import { priceMoves } from "../../core/tools/craftmoves/cost";
import { tierOf } from "../../core/tools/craftmoves/rank";
import { isPerfectOrCorruptedEssence } from "../../core/tools/craftmoves/ruleTableOmens";
import { evaluateRules, legalMoves } from "../../core/tools/craftmoves/rules";
import { itemText, RING, renderFamily, ringLines } from "./craftMovesFixtures";

function classify(cat: CraftCatalog, text: string): ItemState {
  const r = classifyText(text, cat);
  assert.ok(r, "fixture must parse as an item");
  return r.state;
}

function testCatalogV2(cat: CraftCatalog): void {
  assert.equal(cat.schemaVersion, CRAFT_CATALOG_SCHEMA_VERSION);
  assert.equal(CRAFT_CATALOG_SCHEMA_VERSION, 2);
  for (const [id, m] of Object.entries(cat.mods)) assert.ok(m.groups.length > 0, `${id} carries its RePoE groups`);
  assert.deepEqual(cat.mods.IncreasedMana12?.groups, ["IncreasedMana"], "IncreasedMana12 group (RePoE 4.5.5.2)");
  assert.deepEqual(cat.mods.IncreasedMana12?.tags, ["resource", "mana"]);
  const fire = cat.mods.FireResist8;
  assert.ok(fire, "FireResist8 in the catalog");
  for (const tag of ["fire", "elemental", "resistance", "fire_resistance"]) assert.ok(fire.tags.includes(tag), `FireResist8 tagged ${tag}`);
  assert.ok(Object.values(cat.mods).some((m) => m.groups.length > 1), "multi-group mods keep every group, not just the family");
  assert.ok(Object.values(cat.mods).some((m) => m.tags.length === 0), "untagged mods keep an empty tag list (not dropped)");
  // Refined Breach Ring (RePoE FourRingBreach2) is released in the 0.5.5b data beside the Breach Ring
  for (const [name, quality] of [["Breach Ring", 20], ["Refined Breach Ring", 25]] as const) {
    assert.deepEqual(cat.bases[name]?.implicits, [`+${quality}% to Maximum Quality`], `${name} implicit`);
    assert.ok(comboFor(cat, "Rings", name), `${name} has a ring tier pool`);
  }
}

const RING_RARE = { ...RING, rarity: "Rare" as const, ilvl: 82 };

/** The rule's side must be what the omen's own text says ("remove only Prefix/Suffix modifiers"). */
function testCrystallisationText(): void {
  const rows = loadEntityCatalog().entities;
  const text = (id: string) => rows.find((r) => r.exchange_id === id)?.summary ?? "";
  assert.match(text("omen-of-sinistral-crystallisation"), /next Perfect or Corrupted Essence will remove only Prefix modifiers/);
  assert.match(text("omen-of-dextral-crystallisation"), /next Perfect or Corrupted Essence will remove only Suffix modifiers/);
  const essences = rows.filter((r) => r.kind === "essence" && r.exchange_id != null);
  const corrupted = essences.filter((r) => /CorruptedEssence/.test(r.repoe_id ?? "")).map((r) => r.exchange_id!);
  assert.ok(corrupted.length >= 6, "the corrupted essences are in the entity catalog");
  for (const id of corrupted) assert.ok(isPerfectOrCorruptedEssence(id), `${id} is a Corrupted Essence the omen acts on`);
  for (const r of essences) {
    const rareTarget = /Removes a random modifier and augments a Rare item/.test(r.summary ?? "");
    assert.equal(isPerfectOrCorruptedEssence(r.exchange_id!), rareTarget, `${r.exchange_id}: Perfect/Corrupted set matches the rare-target item text`);
  }
}

function testCrystallisationRules(cat: CraftCatalog): void {
  const two = classify(cat, itemText({ ...RING_RARE, lines: ringLines(cat, ["IncreasedLife", "IncreasedMana"], ["FireResistance", "ColdResistance"]) }));
  const moves = priceMoves(legalMoves(two), new Map(), null);
  for (const id of ["omen-sinistral-crystallisation", "omen-dextral-crystallisation"]) {
    const m = moves.find((x) => x.id === id);
    assert.ok(m && m.verified, `${id} legal and verified on a 2P/2S rare`);
    assert.equal(m.materials[0]?.ninjaId, id.replace("omen-", "omen-of-"), `${id} prices its omen`);
    assert.equal(m.materials[1]?.ninjaId, null, "the essence of choice is shown, never priced");
    assert.ok(m.notes.some((n) => /consumed by ANY essence.*single-source/.test(n)), `${id} carries the single-source consumption note`);
    assert.equal(tierOf(m, null), 3, `${id} is a removal card (rank.ts REMOVAL)`);
  }
  const prefixOnly = classify(cat, itemText({ ...RING_RARE, lines: ringLines(cat, ["IncreasedLife"], []) }));
  assert.match(evaluateRules(prefixOnly).blocked.find((b) => b.id === "omen-dextral-crystallisation")?.reason ?? "", /needs 1 suffix mod/);
  assert.ok(legalMoves(prefixOnly).some((m) => m.id === "omen-sinistral-crystallisation"));
  const magic = classify(cat, itemText({ ...RING, rarity: "Magic", ilvl: 60, lines: renderFamily(cat, RING.itemClass, RING.base, "suffix", "FireResistance") }));
  const ev = evaluateRules(magic);
  assert.ok(![...ev.moves, ...ev.blocked].some((m) => /crystallisation/.test(m.id)), "Perfect/Corrupted essences target rares only: hidden on magic");
  const essenceMod = `${cat.mods.EssenceIncreasedManaPercent1!.text.replace("(4-6)", "4")} (crafted)`;
  const crafted = classify(cat, itemText({ ...RING_RARE, lines: [...ringLines(cat, ["IncreasedLife"], ["FireResistance"]), essenceMod] }));
  assert.equal(crafted.slots.crafted, 1, JSON.stringify(crafted.affixes));
  const steered = legalMoves(crafted).find((m) => m.id === "omen-dextral-crystallisation");
  assert.ok(steered && !steered.verified, "an existing crafted mod makes the side-steered essence unverified");
}

function gearOf(cat: CraftCatalog, itemClass: string, base: string, prefixes: string[], suffixes: string[], rarity: "Rare" | "Magic" = "Rare"): string {
  const r = (side: "prefix" | "suffix", f: string) => renderFamily(cat, itemClass, base, side, f);
  return itemText({ itemClass, base, rarity, ilvl: 82, lines: [...prefixes.flatMap((f) => r("prefix", f)), ...suffixes.flatMap((f) => r("suffix", f))] });
}

const ringOf = (cat: CraftCatalog, base: string, prefixes: string[], suffixes: string[], rarity: "Rare" | "Magic" = "Rare"): string =>
  gearOf(cat, RING.itemClass, base, prefixes, suffixes, rarity);

/** The first `n` families of one side a base rolls, for bases whose family names differ from rings. */
function familiesOf(cat: CraftCatalog, itemClass: string, base: string, side: "prefix" | "suffix", n: number): string[] {
  const families = Object.keys(comboFor(cat, itemClass, base)?.[side] ?? {}).slice(0, n);
  assert.equal(families.length, n, `${base} must roll ${n} ${side} families`);
  return families;
}

const amuletOf = (cat: CraftCatalog, base: string, p: number, sfx: number): string =>
  gearOf(cat, "Amulets", base, familiesOf(cat, "Amulets", base, "prefix", p), familiesOf(cat, "Amulets", base, "suffix", sfx));

const PRE4 = ["IncreasedLife", "IncreasedMana", "FireDamage", "ColdDamage"];

function testAllowanceRings(cat: CraftCatalog): void {
  assert.deepEqual(baseAllowance(cat, "Dusk Ring"), { p: 1, s: -1 }, "Dusk Ring implicit: +1 prefix / -1 suffix");
  assert.deepEqual(baseAllowance(cat, "Gloam Ring"), { p: -1, s: 1 }, "Gloam Ring implicit: the mirror");
  assert.deepEqual(baseAllowance(cat, "Ruby Ring"), { p: 0, s: 0 });
  const dusk = classify(cat, ringOf(cat, "Dusk Ring", PRE4, ["FireResistance", "ColdResistance"]));
  assert.deepEqual([dusk.capacity, dusk.openPrefixes, dusk.openSuffixes], [{ p: 4, s: 2, total: 6 }, 0, 0], JSON.stringify(dusk.flags));
  assert.ok(!dusk.flags.some((f) => f.code === "over-capacity"), "four prefixes fit a Dusk Ring (KB §3)");
  const duskOpen = classify(cat, ringOf(cat, "Dusk Ring", PRE4.slice(0, 3), ["FireResistance"]));
  assert.deepEqual([duskOpen.openPrefixes, duskOpen.openSuffixes, duskOpen.openTotal], [1, 1, 2]);
  assert.ok(legalMoves(duskOpen).some((m) => m.id === "omen-sinistral-exaltation"), "the 4th prefix slot is offered");
  const gloam = classify(cat, ringOf(cat, "Gloam Ring", PRE4.slice(0, 2), ["FireResistance", "ColdResistance", "Strength", "Dexterity"]));
  assert.deepEqual([gloam.capacity, gloam.openPrefixes, gloam.openSuffixes], [{ p: 2, s: 4, total: 6 }, 0, 0]);
  const ruby = classify(cat, ringOf(cat, "Ruby Ring", PRE4, ["FireResistance"]));
  assert.ok(ruby.flags.some((f) => f.code === "over-capacity"), "a Ruby Ring with four prefixes is still a misread");
  const magic = classify(cat, ringOf(cat, "Dusk Ring", ["IncreasedLife"], [], "Magic"));
  assert.deepEqual([magic.capacity, magic.openTotal], [null, null], "magic Dusk Ring limits are not in the KB: unknown, not guessed");
  assert.ok(magic.flags.some((f) => f.code === "unknown-capacity"));
  assert.match(evaluateRules(magic).blocked.find((b) => b.id === "aug")?.reason ?? "", /limits are unverified/);
  const over = evaluateRules(ruby).blocked.find((b) => b.id === "exalt")?.reason ?? "";
  assert.match(over, /4 prefixes \+ 1 suffixes exceed this item's 3 \+ 3 limit/, "over-capacity says so, not 'open slots unknown'");
}

// Every base whose RePoE implicit changes the limits, as KB §3 lists them: [prefix, suffix].
const ALLOWANCE_BASES: Record<string, [number, number]> = {
  "Dusk Ring": [1, -1], "Dusk Amulet": [1, -1], "Gloam Ring": [-1, 1], "Gloam Amulet": [-1, 1],
  "Penumbra Ring": [2, -2], "Penumbra Amulet": [2, -2], "Tenebrous Ring": [-2, 2], "Tenebrous Amulet": [-2, 2],
  "Absent Amulet": [-1, -1], "Lament Amulet": [-1, 0], "Twisted Amulet": [-1, 0], "Portent Amulet": [0, -1], "Distorted Amulet": [0, -1],
};

function testAllowanceBases(cat: CraftCatalog, kbText: string): void {
  const withAllowance = Object.keys(cat.bases).filter((n) => {
    const a = baseAllowance(cat, n);
    return a.p !== 0 || a.s !== 0;
  });
  assert.deepEqual(withAllowance.sort(), Object.keys(ALLOWANCE_BASES).sort(), "the catalog's allowance bases are exactly the KB §3 list");
  const section3 = kbText.slice(kbText.indexOf("## 3."), kbText.indexOf("## 4."));
  for (const [name, [p, sfx]] of Object.entries(ALLOWANCE_BASES)) {
    assert.deepEqual(baseAllowance(cat, name), { p, s: sfx }, `${name} allowance`);
    assert.ok(section3.includes(name), `KB §3 names ${name}`);
  }
  const penumbra = classify(cat, ringOf(cat, "Penumbra Ring", [...PRE4, "LightningDamage"], ["FireResistance"]));
  assert.deepEqual([penumbra.capacity, penumbra.openTotal], [{ p: 5, s: 1, total: 6 }, 0], JSON.stringify(penumbra.flags));
  const tenebrous = classify(cat, amuletOf(cat, "Tenebrous Amulet", 1, 4));
  assert.deepEqual([tenebrous.capacity, tenebrous.openTotal], [{ p: 1, s: 5, total: 6 }, 1], JSON.stringify(tenebrous.flags));
  const absent = classify(cat, amuletOf(cat, "Absent Amulet", 2, 2));
  assert.deepEqual([absent.capacity, absent.openTotal], [{ p: 2, s: 2, total: 4 }, 0], JSON.stringify(absent.flags));
  const lament = classify(cat, amuletOf(cat, "Lament Amulet", 2, 0));
  assert.deepEqual([lament.capacity, lament.openPrefixes, lament.openSuffixes], [{ p: 2, s: 3, total: 5 }, 0, 3], JSON.stringify(lament.flags));
}

/** Fracturing "locks it in place" (item text): removals and side omens never count a fractured mod. */
function testFracturedNotRemovable(cat: CraftCatalog): void {
  const life = renderFamily(cat, RING.itemClass, RING.base, "prefix", "IncreasedLife").map((l) => `${l} (fractured)`);
  const s = classify(cat, itemText({ ...RING_RARE, lines: [...life, ...ringLines(cat, [], ["FireResistance"])] }));
  assert.equal(s.slots.fractured, 1, JSON.stringify(s.affixes));
  const ev = evaluateRules(s);
  for (const id of ["omen-sinistral-crystallisation", "omen-sinistral-erasure", "omen-sinistral-annulment"]) {
    const reason = ev.blocked.find((b) => b.id === id)?.reason ?? "";
    assert.match(reason, /removable prefix mod, found 0 — 1 fractured/, `${id} blocked when the only prefix is fractured`);
  }
  assert.ok(ev.moves.some((m) => m.id === "omen-dextral-crystallisation"), "the loose suffix can still be crystallised away");
  const ev2 = evaluateRules(classify(cat, itemText({ ...RING_RARE, lines: life })));
  for (const id of ["chaos", "annul", "essence-perfect"]) {
    assert.match(ev2.blocked.find((b) => b.id === id)?.reason ?? "", /fractured/, `${id}: nothing removable`);
  }
}

const withQuality = (text: string, q: number): string =>
  text.replace("Item Level: 82", `Quality (Life Modifiers): +${q}% (augmented)\n--------\nItem Level: 82`);

/** Catalyst cap = 20% + the base's "+N% to Maximum Quality" implicit (Refined Breach Ring 45). */
function testCatalystCap(cat: CraftCatalog): void {
  const ring = (base: string, q: number) => classify(cat, withQuality(ringOf(cat, base, ["IncreasedLife"], ["FireResistance"]), q));
  assert.deepEqual(["Ruby Ring", "Breach Ring", "Refined Breach Ring"].map((b) => ring(b, 1).maxQuality), [20, 40, 45]);
  const refined = ring("Refined Breach Ring", 40);
  assert.equal(refined.quality, 40);
  assert.ok(legalMoves(refined).some((m) => m.id === "catalyst"), "Refined Breach Ring at 40% still takes catalysts (cap 45)");
  assert.match(evaluateRules(ring("Refined Breach Ring", 45)).blocked.find((b) => b.id === "catalyst")?.reason ?? "", /45% cap/);
  assert.match(evaluateRules(ring("Breach Ring", 40)).blocked.find((b) => b.id === "catalyst")?.reason ?? "", /40% cap/);
  const catalysing = legalMoves(ring("Refined Breach Ring", 45)).find((m) => m.id === "omen-catalysing-exaltation");
  assert.ok(catalysing?.warnings.some((w) => /above 40%/.test(w)), "no documented multiplier above 40%");
  const glovesBase = Object.entries(cat.bases).find(([, b]) => b.itemClass === "Gloves")?.[0];
  assert.ok(glovesBase, "a gloves base in the catalog");
  const gloves = classifyText(itemText({ itemClass: "Gloves", rarity: "Rare", base: glovesBase, ilvl: 82, lines: [] }), cat)?.state;
  assert.equal(gloves?.maxQuality, null, "catalysts do not apply to gloves");
}

export function runPlannerDataCases(cat: CraftCatalog, kbText: string): void {
  testCatalogV2(cat);
  testCrystallisationText();
  testCrystallisationRules(cat);
  testAllowanceRings(cat);
  testAllowanceBases(cat, kbText);
  testFracturedNotRemovable(cat);
  testCatalystCap(cat);
}
