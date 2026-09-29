/*
 * Derive the static regex datasets (src/data/poe2/regex/{waystone,tablet,relic,jewel,vendor}.json)
 * from the committed RePoE snapshot. The Regex tool's pool tabs build search strings in the
 * browser from these files, so they are plain JSON the client lazy-imports per tab. Run after every
 * `npm run sync:poe2-data` — test:tools:regex fails while a stamp differs from repoe/manifest.json.
 * Run: npm run build:regex-data
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  POOL_TABS,
  REGEX_DATA_SCHEMA_VERSION,
  RegexPoolSchema,
  VendorDataSchema,
  type RegexPool,
  type Stamp,
} from "../core/tools/regex/pools/schema";
import { DATA_DIR, loadSnapshot } from "./repoe/snapshot";
import { buildPool } from "./regexData/pools";
import { buildVendor } from "./regexData/vendor";

const OUT_DIR = join(DATA_DIR, "regex");
// Each file is one lazy chunk in the client bundle; past this a tab's first paint gets sluggish.
const MAX_BYTES = 400 * 1024;

function write(name: string, value: unknown): number {
  const json = `${JSON.stringify(value)}\n`;
  const bytes = Buffer.byteLength(json);
  if (bytes > MAX_BYTES) throw new Error(`${name}.json would be ${(bytes / 1024).toFixed(0)} KB — over the ${MAX_BYTES / 1024} KB budget`);
  writeFileSync(join(OUT_DIR, `${name}.json`), json);
  return bytes;
}

function describePool(pool: RegexPool): string {
  const tiers = pool.mods.reduce((n, m) => n + m.tiers.length, 0);
  const lines = pool.mods.reduce((n, m) => n + m.lines.length, 0);
  const groups = pool.groups.map((g) => `${g.id} ${pool.mods.filter((m) => m.group === g.id).length}`).join(", ");
  return `${pool.mods.length} mods / ${tiers} tiers / ${lines} lines [${groups}], ${pool.bases.length} bases, ${pool.foreignLines.length} foreign lines`;
}

function main(): void {
  const { manifest, repoe, gameDataPatch } = loadSnapshot();
  const stamp: Stamp = {
    schemaVersion: REGEX_DATA_SCHEMA_VERSION,
    sourceSha256: manifest.artifact_sha256,
    repoeVersion: manifest.repoe_version,
    gameDataPatch,
  };
  mkdirSync(OUT_DIR, { recursive: true });
  for (const tab of POOL_TABS) {
    const { pool, stats } = buildPool(repoe, tab, stamp);
    const bytes = write(tab, RegexPoolSchema.parse(pool));
    console.log(`[regex-data] ${tab}: ${describePool(pool)} — ${(bytes / 1024).toFixed(0)} KB`);
    if (stats.zeroWeight.length > 0) console.log(`[regex-data]   ${tab} excluded zero-weight: ${stats.zeroWeight.join(", ")}`);
    if (stats.hiddenText.length > 0) console.log(`[regex-data]   ${tab} excluded no-text: ${stats.hiddenText.join(", ")}`);
  }
  const vendor = VendorDataSchema.parse(buildVendor(repoe, stamp));
  const bytes = write("vendor", vendor);
  console.log(
    `[regex-data] vendor: ${vendor.lines.length} lines, ${vendor.bases.length} bases, ${vendor.classes.length} classes — ${(bytes / 1024).toFixed(0)} KB`,
  );
  console.log(`[regex-data] wrote ${OUT_DIR} — data ${gameDataPatch} / RePoE ${manifest.repoe_version}`);
}

main();
