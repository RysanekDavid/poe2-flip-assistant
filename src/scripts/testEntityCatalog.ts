/*
 * Entity catalog contract: the committed artifact parses, is stamped against the current RePoE
 * snapshot, carries art + game text for the entities the Coach mentions most, and keeps exchange
 * icon coverage ≥ 95% (rows missing art are printed so a regression names its items).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { entityCatalogSchema, type EntityKind } from "../core/entities/schema";
import { DATA_DIR, ManifestSchema, PatchCoverageSchema } from "./repoe/snapshot";

const catalog = entityCatalogSchema.parse(
  JSON.parse(gunzipSync(readFileSync(join(DATA_DIR, "entities.json.gz"))).toString("utf8")) as unknown,
);
const manifest = ManifestSchema.parse(JSON.parse(readFileSync(join(DATA_DIR, "repoe", "manifest.json"), "utf8")));
const coverage = PatchCoverageSchema.parse(JSON.parse(readFileSync(join(DATA_DIR, "patch-coverage.json"), "utf8")));

assert.equal(catalog.source_sha256, manifest.artifact_sha256, "entities.json.gz is stale — run npm run sync:entities");
assert.equal(catalog.repoe_version, manifest.repoe_version);
assert.equal(catalog.game_data_patch, coverage.game_data_patch);
console.log(`PASS  entity catalog stamped against RePoE ${catalog.repoe_version} / data ${catalog.game_data_patch}`);

const byName = new Map(catalog.entities.map((row) => [row.name, row]));
const KNOWN: Array<[string, EntityKind]> = [
  ["Fracturing Orb", "currency"],
  ["Divine Orb", "currency"],
  ["Exalted Orb", "currency"],
  ["Greater Exalted Orb", "currency"],
  ["Omen of Light", "omen"],
  ["Simulacrum Splinter", "fragment"],
  ["Breachlord Sac", "fragment"],
];
for (const [name, kind] of KNOWN) {
  const row = byName.get(name);
  assert.ok(row, `${name} missing from the entity catalog`);
  assert.equal(row.kind, kind, `${name} kind`);
  assert.ok(row.icon_url, `${name} has no icon`);
  assert.ok(row.summary, `${name} has no summary`);
  assert.ok(row.exchange_id, `${name} has no exchange id`);
}
assert.match(byName.get("Fracturing Orb")?.summary ?? "", /Fracture a random modifier/);
assert.doesNotMatch(byName.get("Omen of Light")?.summary ?? "", /\[/, "game markup must be stripped");
console.log(`PASS  ${KNOWN.length} known entities carry icon, summary and the right kind`);

const exchange = catalog.entities.filter((row) => row.exchange_id !== null);
const missingIcon = exchange.filter((row) => row.icon_url === null);
const iconCoverage = (exchange.length - missingIcon.length) / exchange.length;
if (missingIcon.length > 0) console.log(`INFO  exchange rows without icon: ${missingIcon.map((r) => r.name).join(", ")}`);
assert.ok(iconCoverage >= 0.95, `exchange icon coverage ${(iconCoverage * 100).toFixed(1)}% < 95%`);
console.log(`PASS  exchange icon coverage ${(iconCoverage * 100).toFixed(1)}% over ${exchange.length} rows`);

// Bare words that are also ordinary game vocabulary ("Trial of Chaos", "chaos damage") must never be a surface.
const FORBIDDEN_SURFACES = new Set(["chaos", "divine", "exalted", "exalt", "div", "ex"]);
for (const row of catalog.entities) {
  for (const surface of [row.name, ...row.aliases]) {
    assert.ok(!FORBIDDEN_SURFACES.has(surface.toLowerCase()), `${row.id} exposes forbidden surface "${surface}"`);
  }
}
assert.equal(new Set(catalog.entities.map((r) => r.id)).size, catalog.entities.length, "entity ids are unique");
assert.ok(catalog.entities.some((r) => r.kind === "unique" && r.icon_url), "uniques carry art");
console.log(`PASS  ${catalog.entities.length} rows: unique ids, no ambiguous bare-currency surfaces`);
