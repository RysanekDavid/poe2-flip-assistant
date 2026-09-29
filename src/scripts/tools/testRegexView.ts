/* Regex UI view logic, part 3 (run from testRegexTool.ts): the result band's meaning sentence,
 * mod-card text with inlined roll ranges and band notes, and the Avoid/Want brush toggle. */
import assert from "node:assert/strict";
import { POOL_HEADERS } from "../../core/tools/regex/pools/headers";
import { emptyPoolSelection, thresholdKey } from "../../lib/tools/regexPoolContract";
import { describePrice, describeSelection, describeVendor, sentenceText } from "../../components/tools/regex/describe";
import { bandSummary, inlineRollText, modMeta } from "../../components/tools/regex/modView";
import { emptyVendorSelection, setThreshold, toggleInBucket } from "../../components/tools/regex/selectionOps";
import { loadPool, sampleWaystone } from "./testRegexUi";

function testInlineRolls(): void {
  const pool = loadPool("waystone");
  const crit = pool.mods.find((m) => m.id === "MapMonsterCritIncrease");
  assert.ok(crit, "fixture mod MapMonsterCritIncrease exists");
  assert.equal(
    inlineRollText(crit),
    "Monsters have (80–300)% increased Critical Hit Chance / Monsters have +(11–30)% Critical Damage Bonus",
    "each # becomes the widest range across tiers; signs stay",
  );
  assert.equal(bandSummary(crit, pool), "", "a mod on every tier band needs no band note");
  const highOnly = { ...crit, tiers: crit.tiers.filter((t) => t.bands.includes("high") || t.bands.includes("highest")) };
  assert.equal(bandSummary(highOnly, pool), "T11–15, T16", "waystone bands shorten to the game's T form");
  assert.equal(modMeta(highOnly, pool), "Destructive · prefix · T11–15, T16");
  const fixed = loadPool("tablet").mods.find((m) => m.lines.every((l) => l.numeric.count === 0));
  assert.ok(fixed, "the tablet pool has a mod with fixed text");
  assert.equal(inlineRollText(fixed), fixed.lines.map((l) => l.template).join(" / "), "fixed text is left alone");
  const single = { ...crit, tiers: crit.tiers.slice(0, 1).map((t) => ({ ...t, lines: t.lines.map((l) => ({ ...l, ranges: [{ min: 7, max: 7 }] })) })) };
  assert.equal(inlineRollText(single), "Monsters have 7% increased Critical Hit Chance / Monsters have +7% Critical Damage Bonus", "a fixed roll prints bare");
}

function testBrush(): void {
  const [a, b] = ["ModA", "ModB"];
  let sel = toggleInBucket(emptyPoolSelection("waystone"), a, "avoid");
  assert.deepEqual(sel.mods, { ModA: "avoid" }, "unmarked → brush bucket");
  sel = toggleInBucket(sel, a, "avoid");
  assert.deepEqual(sel.mods, {}, "same bucket again → unmarked (Ignore = absent key)");
  sel = toggleInBucket(toggleInBucket(sel, b, "want"), b, "want");
  assert.deepEqual(sel.mods, {}, "want toggles off too");
  sel = setThreshold(toggleInBucket(sel, b, "want"), thresholdKey(b, 0, 0), { min: 20, max: null });
  sel = toggleInBucket(sel, b, "avoid");
  assert.deepEqual(sel.mods, { ModB: "avoid" }, "other bucket → moved to the brush bucket");
  assert.deepEqual(sel.thresholds, {}, "leaving Want drops the mod's roll limits");
}

function testPoolSentence(): void {
  const pool = loadPool("waystone");
  const headers = POOL_HEADERS.waystone;
  const say = (s: Parameters<typeof describeSelection>[0]) => sentenceText(describeSelection(s, headers, pool.bands));
  assert.match(say(emptyPoolSelection("waystone")), /^Nothing selected yet/, "an empty selection says so");
  const sample = sampleWaystone(pool);
  assert.equal(say(sample), "Lights waystones with any of 3 wanted mods and none of 2 avoided mods · tier 14–16 · 1 roll limit");
  assert.equal(say({ ...sample, match: "all", tier: { min: 16, max: 16 } }), "Lights waystones with all 3 wanted mods and none of 2 avoided mods · tier 16 · 1 roll limit");
  const avoidOnly = toggleInBucket(emptyPoolSelection("waystone"), "MapMonsterCritIncrease", "avoid");
  assert.equal(say(avoidOnly), "Lights waystones with none of 1 avoided mod");
  const filtersOnly = { ...emptyPoolSelection("waystone"), corrupted: "exclude" as const, rarity: ["rare" as const], props: { packSize: { min: 30, max: null } } };
  assert.equal(say(filtersOnly), "Lights every waystone · Rare only · not corrupted · Pack Size ≥ 30%");
  const tablet = loadPool("tablet");
  const types = sentenceText(describeSelection({ ...emptyPoolSelection("tablet"), types: ["breach", "ritual"] }, POOL_HEADERS.tablet, tablet.bands));
  assert.equal(types, "Lights every tablet · Breach or Ritual only", "tablet types read by their band labels");
  const strong = describeSelection(sample, headers, pool.bands).filter((p) => typeof p !== "string");
  assert.deepEqual(strong, [{ strong: "any" }, { strong: "none" }], "the band bolds the combining words");
}

function testOtherSentences(): void {
  assert.match(sentenceText(describeVendor(emptyVendorSelection())), /^Nothing selected yet/);
  const boots = { ...emptyVendorSelection(), movementSpeed: 25, resistances: { fire: 30, cold: null, lightning: null, chaos: null }, classes: ["Boots"] };
  assert.equal(sentenceText(describeVendor(boots)), "Lights vendor items with any of: ≥ 25% movement speed, ≥ 30% fire resistance · Boots");
  assert.equal(sentenceText(describeVendor({ ...boots, resistances: { ...boots.resistances, fire: null } })), "Lights vendor items with ≥ 25% movement speed · Boots");
  const price = { tab: "price" as const, mode: "keep" as const, minDiv: 2, categories: ["Runes", "Currency"], includeUniques: true };
  assert.equal(sentenceText(describePrice(price, 13)), "Lights stash items worth ≥ 2 Div each · 2 of 13 categories + uniques");
  assert.match(sentenceText(describePrice({ ...price, mode: "trash" }, 13)), /^Lights everything except items worth ≥ 2 Div/, "trash mode says it inverts");
  assert.match(sentenceText(describePrice({ ...price, categories: [], includeUniques: false }, 13)), /^Nothing to search/);
}

export function testRegexView(): void {
  testInlineRolls();
  testBrush();
  testPoolSentence();
  testOtherSentences();
}
