/* Header property tokens (`label:.*range%`): the owner's poeregex.cz comparison strings, format
 * tolerance for the unverified "+" (Monster Effectiveness: 30%), the lower bound surviving the lost
 * left boundary (+5% vs ≥ 10, proven for every value), Item vs Monster Rarity, `.*` staying on its
 * own tooltip line, never longer than the old `: \+` form, and the safeRegex step budget.
 * Run: npm run test:tools:regex (chained) or tsx src/scripts/tools/testRegexPropertyTokens.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderChunk } from "../../core/tools/regex/compose";
import { composePool } from "../../core/tools/regex/poolCompose";
import { buildPoolNamespace, buildVendorNamespace, headerKey, type PoolNamespace } from "../../core/tools/regex/poolNamespace";
import { propertyToken, thresholdToken, type PoolToken, type ValueBounds } from "../../core/tools/regex/poolTokens";
import { POOL_HEADERS, VENDOR_HEADERS, type PoolHeader } from "../../core/tools/regex/pools/headers";
import { POOL_TABS, RegexPoolSchema, VendorDataSchema, type PoolTab, type RegexPool } from "../../core/tools/regex/pools/schema";
import { fillTemplate, slotCount } from "../../core/tools/regex/pools/template";
import { compileSafeRegex } from "../../core/tools/regex/safeRegex";
import { compileSearch, matchesItem } from "../../core/tools/regex/searchEmulator";
import { emptyPoolSelection } from "../../lib/tools/regexPoolContract";

const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(process.cwd(), rel), "utf8"));
const loadPool = (tab: PoolTab): RegexPool => RegexPoolSchema.parse(readJson(`src/data/poe2/regex/${tab}.json`));
const rendered = (t: PoolToken): string => renderChunk([t.text], "keep");
const open = (min: number): ValueBounds => ({ min, max: null });

function header(tab: PoolTab, id: string): PoolHeader {
  const h = POOL_HEADERS[tab].find((x) => x.id === id);
  assert.ok(h, `${tab} header ${id}`);
  return h;
}

const numericProps = (headers: readonly PoolHeader[]): PoolHeader[] => headers.filter((h) => h.kind === "property" && slotCount(h.template) === 1);

function testOwnerExamples(ns: PoolNamespace): void {
  const rarity = propertyToken(ns, header("waystone", "monsterRarity"), open(10), false);
  const eff = propertyToken(ns, header("waystone", "monsterEffectiveness"), open(10), false);
  assert.equal(rendered(rarity), '"r rarity:.*([1-9].|[1-9]..)%"', "Monster Rarity ≥ 10 (poeregex.cz: \"r rarity:.*([1-9].|\\d..)%\")");
  assert.equal(rendered(eff), "ess:.*([1-9].|[1-9]..)%", "Monster Effectiveness ≥ 10 needs no quotes (poeregex.cz: ess:.*([1-9].|\\d..)%)");
  assert.ok(!eff.text.includes("\\+") && !eff.text.includes(" "), "no literal + or space after the colon");
}

function testFormatTolerance(ns: PoolNamespace): void {
  const eff = propertyToken(ns, header("waystone", "monsterEffectiveness"), open(10), false).text;
  assert.ok(matchesItem(eff, ["Monster Effectiveness: 30%"]), "no plus sign: 30% ≥ 10");
  assert.ok(matchesItem(eff, ["Monster Effectiveness: +30%"]), "with plus sign: +30% ≥ 10");
  assert.equal(matchesItem(eff, ["Monster Effectiveness: +5%"]), false, "+5% is below 10 even with .* in front");
  assert.equal(matchesItem(eff, ["Monster Effectiveness: 5%"]), false, "5% is below 10");
  const pack = propertyToken(ns, header("waystone", "packSize"), open(25), false).text;
  assert.ok(matchesItem(pack, ["Pack Size: 30%"]) && !matchesItem(pack, ["Pack Size: +24%"]), "Pack Size ≥ 25 either way");
}

/* Every value 0–999 printed both ways: lights exactly when ≥ min. This is the proof propertyToken
 * runs, re-done here from the outside so a regression in it cannot hide. */
function testLowerBoundExhaustive(ns: PoolNamespace, tab: PoolTab): void {
  for (const h of numericProps(POOL_HEADERS[tab])) {
    for (const min of [1, 5, 9, 10, 15, 40, 99, 100, 103, 150]) {
      const t = propertyToken(ns, h, open(min), false);
      const re = compileSafeRegex(t.text);
      for (let v = 0; v <= 999; v++) {
        const lines = [fillTemplate(h.template, [v]), fillTemplate(h.template.replace("+#", "#"), [v])];
        for (const line of lines) assert.equal(re.test(line), v >= min, `${tab}/${h.id} ≥ ${min}: "${t.text}" on "${line}"`);
      }
    }
  }
}

function testRarityDistinct(ns: PoolNamespace): void {
  const item = propertyToken(ns, header("waystone", "itemRarity"), open(40), false).text;
  const monster = propertyToken(ns, header("waystone", "monsterRarity"), open(40), false).text;
  assert.ok(matchesItem(`"${item}"`, ["Item Rarity: +40%"]) && !matchesItem(`"${item}"`, ["Monster Rarity: +103%"]), "Item Rarity token ignores Monster Rarity");
  assert.ok(matchesItem(`"${monster}"`, ["Monster Rarity: +103%"]) && !matchesItem(`"${monster}"`, ["Item Rarity: +140%"]), "Monster Rarity token ignores Item Rarity");
  assert.equal(matchesItem(`"${item}"`, ["Rarity: Rare", "Item Rarity: +5%"]), false, "the Rarity: Rare header is not a number line");
}

/* The emulator tests each tooltip line on its own (community-documented behaviour, see
 * searchEmulator.ts), so `rarity:.*` cannot reach the next line's number. */
function testDotStaysOnLine(ns: PoolNamespace): void {
  const item = `"${propertyToken(ns, header("waystone", "itemRarity"), open(50), false).text}"`;
  assert.equal(matchesItem(item, ["Item Rarity: +40%", "Monster Rarity: +103%", "Waystone Drop Chance: +120%"]), false, ".* does not cross into later lines");
  assert.ok(matchesItem(item, ["Item Rarity: +50%", "Monster Rarity: +3%"]), "…and still reads its own line");
}

/** No other namespace line (filled with a low and a high value) lights the token. */
function testCollisionSafe(ns: PoolNamespace, headers: readonly PoolHeader[], label: string): void {
  for (const h of numericProps(headers)) {
    const t = propertyToken(ns, h, open(10), false);
    assert.deepEqual(t.collisions, [], `${label}/${h.id}: no collisions`);
    const re = compileSafeRegex(t.text);
    const hits = ns.lines
      .filter((l) => l.template !== h.template)
      .filter((l) => [10, 999].some((v) => re.test(fillTemplate(l.template, Array.from({ length: slotCount(l.template) }, () => v)))));
    assert.deepEqual(hits.map((l) => l.template), [], `${label}/${h.id}: "${t.text}" lights no other line`);
  }
}

function testNotLonger(ns: PoolNamespace, headers: readonly PoolHeader[], label: string, exempt: ReadonlySet<string>): void {
  for (const h of numericProps(headers)) {
    for (const min of [1, 10, 40, 103]) {
      for (const round10 of [false, true]) {
        const now = rendered(propertyToken(ns, h, open(min), round10));
        const old = rendered(thresholdToken(ns, { key: headerKey(h.id), template: h.template }, 0, open(min), { kind: "property", round10 }));
        const slack = exempt.has(h.id) ? 1 : 0;
        assert.ok(now.length <= old.length + slack, `${label}/${h.id} ≥ ${min}: ${now} (${now.length}) vs old ${old} (${old.length})`);
      }
    }
  }
}

function testBudget(pool: RegexPool, ns: PoolNamespace): void {
  const props = Object.fromEntries(numericProps(POOL_HEADERS.waystone).map((h) => [h.id, open(103)]));
  const out = composePool(pool, POOL_HEADERS.waystone, { ...emptyPoolSelection("waystone"), props }, { maxChars: 250 });
  assert.ok(out.chunks.length > 0, "every waystone property at once composes");
  for (const c of out.chunks) assert.doesNotThrow(() => compileSearch(c.text), `safeRegex budget: ${c.text}`);
  for (const h of numericProps(POOL_HEADERS.waystone)) {
    for (let min = 0; min <= 300; min += 7) assert.doesNotThrow(() => compileSafeRegex(propertyToken(ns, h, open(min), false).text), `${h.id} ≥ ${min}`);
  }
}

function testBoundedFallsBack(ns: PoolNamespace): void {
  // 10–49 written after `.*` would read "140%" as 40, so the proof refuses it and the literal edge stays
  const t = propertyToken(ns, header("waystone", "packSize"), { min: 10, max: 49 }, false);
  assert.ok(!t.text.includes(".*"), `bounded range keeps its left boundary: ${t.text}`);
  assert.equal(matchesItem(`"${t.text}"`, ["Pack Size: +140%"]), false, "140 is outside 10–49");
  assert.ok(matchesItem(`"${t.text}"`, ["Pack Size: +40%"]), "40 is inside 10–49");
  // a proof that stops at 999 would pass `ze:.*1..%` for 100–199, which lights "+1150%" (ends in "150%")
  const hundreds = propertyToken(ns, header("waystone", "packSize"), { min: 100, max: 199 }, false);
  assert.ok(!hundreds.text.includes(".*"), `100–199 keeps its left boundary: ${hundreds.text}`);
  assert.equal(matchesItem(`"${hundreds.text}"`, ["Pack Size: +1150%"]), false, "1150 is outside 100–199");
  assert.ok(matchesItem(`"${hundreds.text}"`, ["Pack Size: +150%"]), "150 is inside 100–199");
  const wide = propertyToken(ns, header("waystone", "packSize"), { min: 10, max: 5000 }, false);
  assert.ok(!wide.text.includes(".*"), `a 4-digit top also keeps the literal form: ${wide.text}`);
  assert.equal(matchesItem(`"${wide.text}"`, ["Pack Size: +15000%"]), false, "15000 is outside 10–5000");
  assert.ok(matchesItem(`"${wide.text}"`, ["Pack Size: +4999%"]) && !matchesItem(`"${wide.text}"`, ["Pack Size: +9%"]), "4999 in, 9 out");
}

function testVendor(): void {
  const data = VendorDataSchema.parse(readJson("src/data/poe2/regex/vendor.json"));
  const ns = buildVendorNamespace(data, VENDOR_HEADERS);
  const quality = VENDOR_HEADERS.find((h) => h.id === "quality");
  const ilvl = VENDOR_HEADERS.find((h) => h.id === "itemLevel");
  assert.ok(quality && ilvl);
  const q = propertyToken(ns, quality, open(20), false).text;
  assert.equal(q, "lity:.*([2-9].|[1-9]..)%", "unverified Quality header takes the tolerant form");
  assert.ok(matchesItem(q, ["Quality: 20%"]) && matchesItem(q, ["Quality: +20%"]) && !matchesItem(q, ["Quality: +5%"]), "quality ≥ 20");
  assert.equal(matchesItem(q, ["Rarity: Normal", "+25% to Fire Resistance"]), false, "resistance numbers are not quality");
  assert.equal(propertyToken(ns, ilvl, open(80), false).text, "l:.*([8-9].|[1-9]..)$", "vendor item level");
  testCollisionSafe(ns, VENDOR_HEADERS, "vendor");
  // Quality costs one char more than the old `": \+…"`: the "+" it drops is exactly the unverified guess
  testNotLonger(ns, VENDOR_HEADERS, "vendor", new Set(["quality"]));
}

const waystone = loadPool("waystone");
const wns = buildPoolNamespace(waystone, POOL_HEADERS.waystone);
testOwnerExamples(wns);
testFormatTolerance(wns);
testRarityDistinct(wns);
testDotStaysOnLine(wns);
testBoundedFallsBack(wns);
testBudget(waystone, wns);
for (const tab of POOL_TABS) {
  const pool = tab === "waystone" ? waystone : loadPool(tab);
  const ns = tab === "waystone" ? wns : buildPoolNamespace(pool, POOL_HEADERS[tab]);
  testLowerBoundExhaustive(ns, tab);
  testCollisionSafe(ns, POOL_HEADERS[tab], tab);
  testNotLonger(ns, POOL_HEADERS[tab], tab, new Set());
}
testVendor();
console.log("ALL PASS — property tokens: poeregex.cz shape, + optional, lower bound proven 0–999, rarity lines distinct, one line per match, collision-safe, not longer, safeRegex budget");
