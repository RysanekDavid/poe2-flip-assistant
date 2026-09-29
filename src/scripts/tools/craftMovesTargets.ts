/* Pins the rarity each currency / omen / essence rule targets to the game's own item text: the
 * entity catalog's "left click a … item" directions (game data 0.5.5b), the KB §1/§7 and currency-core §1/§4
 * quotes of it. A rule that drifts from the item text, or a KB edit that drops the quote, fails
 * here. Imported by testCraftMoves.ts and testCraftProvenance.ts. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MATS, type MaterialKey } from "../../core/craftMaterials";
import { entityByExchangeId, loadEntityCatalog } from "../../core/entities/load";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { classifyText, type ItemState } from "../../core/tools/craftmoves/classify";
import { rankMoves } from "../../core/tools/craftmoves/rank";
import { priceMoves } from "../../core/tools/craftmoves/cost";
import { tierGates } from "../../core/tools/craftmoves/gates";
import { ALL_RULES, evaluateRules, KB, KB_CURRENCY_CORE, legalMoves, type MoveRule } from "../../core/tools/craftmoves/rules";
import { itemText, RING, ringLines, renderFamily } from "./craftMovesFixtures";

export const TARGET_RARITIES = ["normal", "magic", "rare"] as const;
export type TargetRarity = (typeof TARGET_RARITIES)[number];

/** "left click a normal or magic item" → [normal, magic]; "left click an item" → every rarity. */
export function targetRarities(directions: string | null): TargetRarity[] {
  const m = /left click (?:on )?an? ((?:\w+ or )*\w+ )?item\b/i.exec(directions ?? "");
  assert.ok(m, `no "left click … item" target in: ${directions}`);
  if (!m[1]) return [...TARGET_RARITIES];
  const named = m[1].trim().toLowerCase().split(" or ");
  for (const r of named) assert.ok((TARGET_RARITIES as readonly string[]).includes(r), `unknown rarity "${r}" in: ${directions}`);
  return TARGET_RARITIES.filter((r) => named.includes(r));
}

/** Verbatim KB fragments (whitespace-normalised) behind the verified Alchemy / Annulment / essence rules. */
const KB_FACTS: ReadonlyArray<{ section: "1" | "7"; text: string }> = [
  { section: "1", text: '"Upgrades a Normal or Magic item to a Rare item with 4 random modifiers" / "Right click this item then left click a normal or magic item to apply it. Current modifiers are not retained." [verified-primary' },
  { section: "1", text: '"Removes a random modifier from an item" / "Right click this item then left click on a magic or rare item to apply it." [verified-primary' },
  { section: "7", text: '"Upgrades a Magic item to a Rare item, adding a guaranteed modifier" / "Right click this item then left click a Magic item to apply it."' },
  { section: "7", text: "keeps the magic item's own mods is NOT in the item text [unverified]" },
];

/** Verbatim currency-core fragments (whitespace-normalised) behind the corrected targets. */
const CC_FACTS: ReadonlyArray<{ section: "1" | "4"; text: string }> = [
  { section: "1", text: "left click a normal or magic item to apply it. Current modifiers are not retained." },
  { section: "1", text: "left click on a magic or rare item to apply it." },
  { section: "1", text: "left click an item to apply it" },
  { section: "4", text: "essences no longer touch Normal items at all." },
  { section: "4", text: "Upgrades a Magic item to a Rare item, adding a guaranteed modifier … Right click this item then left click a Magic item to apply it." },
  { section: "4", text: "Removes a random modifier and augments a Rare item with a new guaranteed modifier … left click a Rare item to apply it." },
];

function pinFacts(path: string, facts: ReadonlyArray<{ section: string; text: string }>): void {
  const text = readFileSync(join(process.cwd(), path), "utf8").replace(/\r/g, "");
  const section = (n: string) => {
    const start = text.indexOf(`\n## ${n}. `);
    assert.ok(start >= 0, `${path} lost its §${n} heading`);
    return text.slice(start, text.indexOf("\n## ", start + 1)).replace(/\s+/g, " ");
  };
  for (const f of facts) assert.ok(section(f.section).includes(f.text), `${path} §${f.section} no longer states: ${f.text}`);
}

function testKbFacts(): void {
  pinFacts(join("docs", "research", KB), KB_FACTS);
  pinFacts(KB_CURRENCY_CORE, CC_FACTS);
  for (const id of ["alchemy", "annul", "essence", "essence-greater"]) {
    const r = ALL_RULES.find((x) => x.id === id);
    assert.ok(r?.verified && r.source.startsWith(`${KB} §`), `${id} is verified against ${KB}: ${r?.source}`);
  }
}

function fixtures(cat: CraftCatalog): Record<TargetRarity, ItemState> {
  const parse = (text: string) => {
    const r = classifyText(text, cat);
    assert.ok(r, "fixture must parse as an item");
    return r.state;
  };
  return {
    normal: parse(itemText({ ...RING, rarity: "Normal", ilvl: 82, lines: [] })),
    magic: parse(itemText({ ...RING, rarity: "Magic", ilvl: 82, lines: renderFamily(cat, RING.itemClass, RING.base, "suffix", "FireResistance") })),
    rare: parse(itemText({ ...RING, rarity: "Rare", ilvl: 82, lines: ringLines(cat, ["IncreasedLife", "IncreasedMana"], ["FireResistance", "ColdResistance"]) })),
  };
}

/** KB §4 names these as the regular-tier essences that target a Rare like a Perfect one. */
const RARE_TIER_ESSENCE = /^Essence of (Delirium|Horror|Hysteria|Insanity|the Abyss|the Breach)$/;

function essenceRuleFor(name: string): string {
  if (name.startsWith("Perfect ") || RARE_TIER_ESSENCE.test(name)) return "essence-perfect";
  return name.startsWith("Greater ") ? "essence-greater" : "essence";
}

/** Rule id → the item text its target must match: the rule's own non-omen currency, or every essence. */
function textTargets(): Array<{ rule: MoveRule; item: string; directions: string | null }> {
  const out: Array<{ rule: MoveRule; item: string; directions: string | null }> = [];
  const rule = (id: string) => ALL_RULES.find((r) => r.id === id) ?? assert.fail(`no rule ${id}`);
  for (const r of ALL_RULES.filter((x) => x.family === "currency" || x.family === "omen")) {
    const orb = r.materials.find((m): m is MaterialKey => typeof m === "string" && MATS[m].group === "currency");
    // omens riding a bone (Necromancy, Liege…) follow the bone's rare-only rule, pinned by KB6_FACTS
    if (!orb && r.family === "omen") continue;
    assert.ok(orb, `${r.id} names no currency orb`);
    const row = entityByExchangeId(MATS[orb].id) ?? assert.fail(`${MATS[orb].label} missing from the entity catalog`);
    out.push({ rule: r, item: row.name, directions: row.directions });
  }
  const essences = loadEntityCatalog().entities.filter((e) => e.kind === "essence");
  assert.ok(essences.length >= 60, `the entity catalog should list every essence, found ${essences.length}`);
  for (const e of essences) out.push({ rule: rule(essenceRuleFor(e.name)), item: e.name, directions: e.directions });
  return out;
}

/** Rules that rightly stay narrower than their orb's item text, and why. */
const NARROWER: Readonly<Record<string, { rarities: TargetRarity[]; why: string }>> = {
  // desecrated mods come only from bones, and bones are rare-only (KB §6), so a magic item never has one
  "omen-light": { rarities: [], why: "needs a desecrated mod, which the plain rare fixture lacks" },
};

function testCatalogTargets(cat: CraftCatalog): void {
  const items = fixtures(cat);
  for (const { rule, item, directions } of textTargets()) {
    const applies = TARGET_RARITIES.filter((r) => rule.check(items[r]) !== null);
    const want = NARROWER[rule.id]?.rarities ?? targetRarities(directions);
    assert.deepEqual(applies, want, `${rule.id} must target what ${item} says: "${directions}"`);
  }
}

/** The corrected targets, as a crafter meets them in the legal list and the cards. */
function testRarityMoves(cat: CraftCatalog): void {
  const items = fixtures(cat);
  const ids = (r: TargetRarity) => legalMoves(items[r]).map((m) => m.id);
  const magic = ids("magic");
  for (const want of ["annul", "alchemy", "essence", "essence-greater", "omen-dextral-annulment", "divine"]) assert.ok(magic.includes(want), `magic item offers ${want}: ${magic.join(",")}`);
  assert.ok(!magic.includes("essence-perfect"), "a Perfect Essence needs a rare");
  const jewel = classifyText(itemText({ itemClass: "Jewels", rarity: "Magic", base: "Ruby", ilvl: 80, lines: [] }), cat)?.state;
  const jewelEssence = jewel && legalMoves(jewel).find((m) => m.id === "essence-greater");
  assert.ok(jewelEssence && !jewelEssence.verified, "the KB does not say essences apply to jewels: unverified there");
  const alch = legalMoves(items.magic).find((m) => m.id === "alchemy");
  assert.ok(alch?.warnings.some((w) => /throws the magic mods away/.test(w)), "Alchemy on a magic item warns that its mods are discarded");

  const normal = evaluateRules(items.normal);
  const essences = [...normal.moves, ...normal.blocked].filter((m) => m.family === "essence");
  assert.deepEqual(essences.map((m) => m.id), [], "no essence works on a normal item — not even as a blocked move");
  assert.ok(!ids("normal").includes("annul"), "Annulment needs a magic or rare item");
  const divine = legalMoves(items.normal).find((m) => m.id === "divine");
  assert.ok(divine && !divine.verified && ids("normal").includes("alchemy"), "Divine (implicits, unverified) and Alchemy work on a normal item");
  const cards = rankMoves(priceMoves(legalMoves(items.normal), new Map(), null), items.normal, tierGates(items.normal, cat));
  assert.ok(!cards.some((c) => c.move.family === "essence"), "a normal item never gets an essence card");

  const rare = ids("rare");
  assert.ok(rare.includes("essence-perfect") && rare.includes("annul"), "rare: Perfect Essence and Annulment");
  assert.ok(!rare.includes("alchemy") && !rare.includes("essence") && !rare.includes("essence-greater"), `rare: no Alchemy or magic-tier essence: ${rare.join(",")}`);
}

export function runTargetCases(cat: CraftCatalog): void {
  testKbFacts();
  testCatalogTargets(cat);
  testRarityMoves(cat);
}
