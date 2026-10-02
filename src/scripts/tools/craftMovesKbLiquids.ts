/* Pins the KB §6 (Liquid Emotions) wording the liquid/jewel rules rely on, and cross-checks the
 * granted mods against the craft catalog — like testKbGates for §3. A KB edit that changes one of
 * these facts fails here, so the rules are re-read instead of silently drifting. */
import assert from "node:assert/strict";
import type { CraftCatalog } from "../../core/tools/craftmoves/catalog";
import { classifyText } from "../../core/tools/craftmoves/classify";
import { ALL_RULES, evaluateRules, KB } from "../../core/tools/craftmoves/rules";

/** Verbatim §6 fragments (whitespace-normalised) behind each verified liquid/jewel rule. */
export const KB6_FACTS: ReadonlyArray<{ rule: string; text: string }> = [
  { rule: "ancient targets", text: "**Ancient emotions work ONLY on rare Time-Lost jewels**" },
  { rule: "potent targets", text: "non-Ancient tiers don't work on Time-Lost jewels" },
  { rule: "potent contempt removal", text: "\"Removes a random modifer and Augments a Rare Basic Jewel with a new guaranteed Crafted modifier\" (sic)" },
  { rule: "contempt pair", text: "**\"+1 Suffix Modifier allowed\"** (occupies a PREFIX slot) or **\"+1 Prefix Modifier allowed\"** (occupies a SUFFIX slot)" },
  { rule: "potent ferocity", text: "**Potent Liquid Ferocity** (non-Ancient) on a rare BASIC jewel: same removal wording" },
  { rule: "potent ferocity mod", text: "**\"(40–60)% increased Effect of Suffixes\"** (PREFIX slot) or **\"(40–60)% increased Effect of Prefixes\"** (SUFFIX slot)" },
  { rule: "ancient contempt", text: "Ancient Potent Liquid **Contempt** (rare Time-Lost jewels): the same \"+1 Suffix Modifier allowed\" (prefix slot) / \"+1 Prefix Modifier allowed\" (suffix slot) pair" },
  { rule: "ancient ferocity", text: "\"Notable Passive Skills in Radius also grant +(5–7)% to Fire/Cold/Lightning Resistance\" (Diamond: +(4–5)% Chaos" },
  { rule: "jewel caps", text: "rare basic jewel = 2 prefixes + 2 suffixes, magic = 1 + 1" },
  { rule: "time-lost cap", text: "**Rare Time-Lost jewel = 2 + 2**" },
  { rule: "liquid removal side", text: "**Liquid removal side = the crafted mod's side.**" },
  { rule: "crafted limit", text: "**Liquids obey the one-crafted-mod rule**" },
  { rule: "cranium", text: "Cranium exists ONLY as the Preserved tier" },
  { rule: "bones rare-only", text: "→ bones are rare-only" },
];

/** The granted mods §6 names, as the catalog must carry them: id → [side, first-stat range or null]. */
const KB6_MODS: Record<string, { side: "prefix" | "suffix"; text: RegExp; range?: [number, number] }> = {
  CraftedJewelAdditionalSuffixAllowed: { side: "prefix", text: /^\+1 Suffix Modifier allowed$/ },
  CraftedJewelAdditionalPrefixAllowed: { side: "suffix", text: /^\+1 Prefix Modifier allowed$/ },
  CraftedJewelSuffixEffect: { side: "prefix", text: /Effect of Suffixes/, range: [40, 60] },
  CraftedJewelPrefixEffect: { side: "suffix", text: /Effect of Prefixes/, range: [40, 60] },
  CraftedJewelRadiusFireResistance: { side: "suffix", text: /Fire Resistance/, range: [5, 7] },
  CraftedJewelRadiusColdResistance: { side: "suffix", text: /Cold Resistance/, range: [5, 7] },
  CraftedJewelRadiusLightningResistance: { side: "suffix", text: /Lightning Resistance/, range: [5, 7] },
  CraftedJewelRadiusChaosResistance: { side: "suffix", text: /Chaos Resistance/, range: [4, 5] },
};

/**
 * The game prints Time-Lost mods inside §6's wrapper ("Notable Passive Skills in Radius also grant
 * …"); RePoE does not. A pasted Ancient Ferocity line in that form must read as the crafted mod.
 */
function testAncientFerocityLine(section6: string, cat: CraftCatalog): void {
  const wrapper = /"(Notable Passive Skills in Radius also grant) \+\(5–7\)%/.exec(section6)?.[1];
  assert.ok(wrapper, "KB §6 quotes the radius wrapper");
  const text = [
    "Item Class: Jewels", "Rarity: Rare", "Doom Shard", "Time-Lost Ruby", "--------", "Item Level: 80", "--------",
    "Upgrades Radius to Medium", `${wrapper} +6% to Fire Resistance`,
  ].join("\n");
  const s = classifyText(text, cat)?.state;
  assert.ok(s, "Time-Lost fixture parses");
  assert.deepEqual(s.unmatched, [], "the wrapped line and the radius prefix both read");
  const ferocity = s.affixes.find((a) => a.modId === "CraftedJewelRadiusFireResistance");
  assert.ok(ferocity && ferocity.kind === "crafted" && ferocity.side === "suffix", JSON.stringify(s.affixes));
  assert.equal(s.slots.crafted, 1, "the Ancient Ferocity mod fills the crafted slot");
  const ev = evaluateRules(s);
  for (const id of ["liquid-ancient-contempt", "liquid-ancient-ferocity"]) {
    assert.ok(!ev.moves.some((m) => m.id === id), `${id} not offered over an existing crafted mod`);
  }
}

const LIQUID_RULES = ["liquid-potent-contempt", "liquid-ancient-contempt", "liquid-potent-ferocity", "liquid-ancient-ferocity"];

export function testKbLiquids(kbText: string, cat: CraftCatalog): void {
  const start = kbText.indexOf("## 6.");
  const section6 = kbText.slice(start, kbText.indexOf("## 7.", start)).replace(/\s+/g, " ");
  for (const f of KB6_FACTS) assert.ok(section6.includes(f.text), `KB §6 no longer states (${f.rule}): ${f.text}`);
  for (const [id, want] of Object.entries(KB6_MODS)) {
    const mod = cat.mods[id];
    assert.ok(mod?.craftedOnly, `catalog must carry crafted-only ${id}`);
    assert.equal(mod.side, want.side, `${id} sits in a ${want.side} slot per §6`);
    assert.match(mod.text, want.text);
    if (want.range) assert.deepEqual([mod.stats[0]!.min, mod.stats[0]!.max], want.range, `${id} range vs §6`);
  }
  testAncientFerocityLine(section6, cat);
  for (const id of LIQUID_RULES) {
    const rule = ALL_RULES.find((r) => r.id === id);
    assert.ok(rule && rule.verified && rule.source.includes(`${KB} §6`), `${id} is verified against ${KB} §6`);
    // §6 states the removal wording for the Potent tier only
    assert.equal(/removes a random mod/.test(rule.effect), id.startsWith("liquid-potent"), `${id} claims removal only where §6 does`);
  }
}
