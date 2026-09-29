/* Regex datasets: stamps vs repoe/manifest.json, schema, grouping, header-bonus filtering, zero-weight
 * exclusion, pool sizes, header spellings vs the corpus, and that every mod has a safe token.
 * Run: npm run test:tools:regex (chained) or tsx src/scripts/tools/testRegexPools.ts */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HEADER_BONUS_LINES } from "../regexData/pools";
import { OTHER_GROUP } from "../regexData/groups";
import { POOL_HEADERS, HEADER_VERIFICATION, VENDOR_HEADERS } from "../../core/tools/regex/pools/headers";
import { POOL_TABS, RegexPoolSchema, VendorDataSchema, type PoolTab, type RegexPool, type Stamp } from "../../core/tools/regex/pools/schema";
import { generalizeLine, slotCount } from "../../core/tools/regex/pools/template";
import { buildPoolNamespace, buildVendorNamespace } from "../../core/tools/regex/poolNamespace";
import { modToken } from "../../core/tools/regex/poolTokens";
import { tooltipLines } from "../../core/tools/regex/searchEmulator";

const ROOT = process.cwd();
const readJson = (rel: string): unknown => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

function assertStamp(stamp: Stamp, what: string): void {
  const manifest = readJson("src/data/poe2/repoe/manifest.json") as { artifact_sha256: string; repoe_version: string };
  const coverage = readJson("src/data/poe2/patch-coverage.json") as { game_data_patch: string };
  assert.equal(stamp.sourceSha256, manifest.artifact_sha256, `${what} is stale vs repoe/manifest.json — run npm run build:regex-data`);
  assert.equal(stamp.repoeVersion, manifest.repoe_version, `${what} repoeVersion`);
  assert.equal(stamp.gameDataPatch, coverage.game_data_patch, `${what} gameDataPatch`);
}

/** Expected sizes for RePoE 4.5.5.2 with generous slack: catches a broken walk, not a new tier. */
const SIZE: Record<PoolTab, { mods: [number, number]; tiers: [number, number] }> = {
  waystone: { mods: [40, 60], tiers: [100, 150] },
  tablet: { mods: [70, 110], tiers: [70, 110] },
  relic: { mods: [28, 45], tiers: [110, 160] },
  jewel: { mods: [170, 250], tiers: [300, 430] },
};

function testPool(tab: PoolTab): RegexPool {
  const pool = RegexPoolSchema.parse(readJson(`src/data/poe2/regex/${tab}.json`));
  assertStamp(pool.stamp, `regex/${tab}.json`);
  assert.equal(pool.tab, tab);
  const others = pool.mods.filter((m) => m.group === OTHER_GROUP.id).map((m) => m.id);
  assert.deepEqual(others, [], `${tab}: every mod is grouped`);
  for (const m of pool.mods) {
    assert.ok(m.lines.every((l) => l.segments.some((s) => s.trim().length > 0)), `${tab}/${m.id} has searchable text on every line`);
    for (const l of m.lines) {
      const filled = l.template.replaceAll("#", "10");
      assert.ok(!HEADER_BONUS_LINES.some((re) => re.test(filled)), `${tab}/${m.id} still carries header-bonus line "${l.template}"`);
    }
  }
  const tiers = pool.mods.reduce((n, m) => n + m.tiers.length, 0);
  const { mods: [loM, hiM], tiers: [loT, hiT] } = SIZE[tab];
  assert.ok(pool.mods.length >= loM && pool.mods.length <= hiM, `${tab}: ${pool.mods.length} mods outside ${loM}..${hiM}`);
  assert.ok(tiers >= loT && tiers <= hiT, `${tab}: ${tiers} tiers outside ${loT}..${hiT}`);
  for (const b of pool.bases) assert.ok((pool.baseBands[b] ?? []).length > 0, `${tab} base ${b} has a band`);
  return pool;
}

function testWaystoneFacts(pool: RegexPool): void {
  const fire = pool.mods.find((m) => m.id === "MapMonsterDamageAsFire");
  assert.deepEqual(fire?.lines.map((l) => l.template), ["Monsters deal #% of Damage as Extra Fire"], "the 0.5.5 'more Effectiveness' bonus line is dropped");
  assert.deepEqual(fire?.tiers.map((t) => [t.tier, t.bands.join(",")]), [[1, "low"], [2, "medium"], [3, "high"], [4, "highest"]]);
  const desecrated = pool.mods.filter((m) => m.desecrated);
  assert.equal(desecrated.length, 17, "17 desecrated waystone mods");
  assert.deepEqual([desecrated.filter((m) => m.side === "prefix").length, desecrated.filter((m) => m.side === "suffix").length], [11, 6]);
  assert.equal(pool.bases.length, 16, "Waystone (Tier 1..16)");
}

function testTabletFacts(pool: RegexPool): void {
  const tierIds = new Set(pool.mods.flatMap((m) => m.tiers.map((t) => t.modId)));
  for (const id of ["TowerExpeditionExplosionPlacement", "TowerExpeditionRareMonsters"]) assert.ok(!tierIds.has(id), `zero-weight ${id} is excluded`);
  assert.ok(pool.mods.some((m) => m.lines.some((l) => l.template.includes("Mirror Shards"))), "0.5.5 spelling 'Mirror Shards'");
  assert.ok(pool.mods.some((m) => m.id === "MapMonsterEffectiveness"), "a rolled '(10-15)% increased Effectiveness' tablet mod is not a header bonus");
  assert.equal(pool.groups.filter((g) => g.id === "expedition").length, 1);
  assert.equal(pool.bases.length, 8);
}

function testVendor(): void {
  const vendor = VendorDataSchema.parse(readJson("src/data/poe2/regex/vendor.json"));
  assertStamp(vendor.stamp, "regex/vendor.json");
  assert.ok(vendor.lines.includes("#% increased Movement Speed"), "vendor lines carry boots movement speed");
  assert.ok(vendor.lines.includes("+#% to Fire Resistance"));
  assert.ok(vendor.classes.includes("Rings") && vendor.bases.length > 1000);
  assert.ok(buildVendorNamespace(vendor, VENDOR_HEADERS).entries.length > vendor.lines.length);
}

function testHeaders(): void {
  const corpusLines = tooltipLines(readFileSync(join(ROOT, "src/scripts/tools/regexCorpus/sidekick-1276-waystone.txt"), "utf8"));
  const corpusTemplates = new Set(corpusLines.map((l) => generalizeLine(l).template));
  for (const [tab, headers] of [...Object.entries(POOL_HEADERS), ["vendor", VENDOR_HEADERS] as const]) {
    const ids = headers.map((h) => h.id);
    assert.equal(new Set(ids).size, ids.length, `${tab} header ids are unique`);
    for (const h of headers) {
      assert.ok(HEADER_VERIFICATION.includes(h.verified));
      if (h.kind === "property" || h.kind === "tier") assert.equal(slotCount(h.template), 1, `${tab}/${h.id} has one number`);
      if (h.verified === "corpus") assert.ok(corpusTemplates.has(h.template), `${tab}/${h.id} "${h.template}" is marked corpus but no corpus line reads so`);
      assert.equal(h.kind === "class", h.verified === "clipboard-only", `${tab}/${h.id}: exactly the Item Class lines are clipboard-only`);
    }
  }
  const waystone = POOL_HEADERS.waystone;
  for (const id of ["monsterEffectiveness", "packSize", "delirious", "unidentified"]) {
    assert.equal(waystone.find((h) => h.id === id)?.verified, "unverified", `${id} spelling is not in the corpus`);
  }
}

/** With nothing else allowed, every mod still has a safe (non-fallback) token. */
function testTokens(pool: RegexPool): void {
  const ns = buildPoolNamespace(pool, POOL_HEADERS[pool.tab]);
  const unsafe = pool.mods.filter((m) => modToken(ns, m, new Set(), { anchors: false, exclusive: true }).verify).map((m) => m.id);
  assert.deepEqual(unsafe, [], `${pool.tab}: mods without a safe token`);
}

const pools = POOL_TABS.map(testPool);
const byTab = (tab: PoolTab): RegexPool => {
  const p = pools.find((x) => x.tab === tab);
  assert.ok(p);
  return p;
};
testWaystoneFacts(byTab("waystone"));
testTabletFacts(byTab("tablet"));
testVendor();
testHeaders();
for (const p of pools) testTokens(p);
console.log(
  `ALL PASS — regex datasets: stamps, schema, groups, header-bonus/zero-weight filtering, sizes (${pools.map((p) => `${p.tab} ${p.mods.length}`).join(", ")}), headers vs corpus, safe tokens`,
);
