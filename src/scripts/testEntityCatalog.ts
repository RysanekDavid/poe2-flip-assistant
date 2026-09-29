/*
 * Entity catalog contract: the committed artifact parses, is stamped against the current RePoE
 * snapshot, carries art + game text for the entities the Coach mentions most, and keeps exchange
 * icon coverage ≥ 95% (rows missing art are printed so a regression names its items). Also the
 * server loader/typeahead and the exchange-id price join, the latter against a TEMP DB
 * (npm run test:coach runs this through runWithTestEnv, which sets DB_PATH).
 */
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import type { PricedItem } from "../api/types";
import { config } from "../config/env";
import { entityByExchangeId, entityById, loadEntityCatalog, normalizeEntityText, searchEntities } from "../core/entities/load";
import { exchangePriceMap } from "../core/entities/prices";
import { entityCatalogSchema, type EntityKind } from "../core/entities/schema";
import { getDb } from "../db/database";
import { insertSnapshots } from "../db/marketQueries";
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

// --- server loader + typeahead (src/core/entities/load.ts) ---
assert.equal(loadEntityCatalog().entities.length, catalog.entities.length, "loader serves the committed artifact");
assert.equal(loadEntityCatalog(), loadEntityCatalog(), "parsed once per process");
assert.equal(entityById("divine")?.name, "Divine Orb");
assert.equal(entityById("no-such-entity"), null);
assert.equal(entityByExchangeId("omen-of-whittling")?.name, "Omen of Whittling");
assert.equal(entityByExchangeId("no-such-exchange-id"), null);
assert.equal(normalizeEntityText("  Arcanist’s \t Etcher "), "arcanist's etcher", "mirrors catalog.py normalize");
assert.equal(searchEntities("omen of wh", 8)[0]?.name, "Omen of Whittling");
assert.equal(searchEntities("  OMEN   of\tWH ", 8)[0]?.name, "Omen of Whittling", "case- and whitespace-insensitive");
assert.equal(searchEntities("arcanists etch", 8)[0]?.name, "Arcanist's Etcher", "apostrophe optional");
assert.equal(searchEntities("arcanist’s etch", 8)[0]?.name, "Arcanist's Etcher", "curly apostrophe");
assert.equal(searchEntities("divine orb", 5)[0]?.name, "Divine Orb", "exact name ranks first");
assert.ok(searchEntities("whittling", 20).some((row) => row.name === "Omen of Whittling"), "substring hits are included");
const isPrefix = searchEntities("orb", 50).map((row) => searchKeyOf(row.name).startsWith("orb"));
const firstContains = isPrefix.indexOf(false);
assert.ok(firstContains === -1 || !isPrefix.slice(firstContains).includes(true), "prefix hits rank above substring hits");
assert.equal(searchEntities("orb", 3).length, 3, "limit respected");
assert.deepEqual(searchEntities("   ", 5), [], "blank query finds nothing");
assert.throws(() => searchEntities("orb", 0), RangeError);
console.log("PASS  entity loader: id / exchange-id lookup, prefix-then-contains search mirroring catalog.py normalize");

function searchKeyOf(name: string): string {
  return normalizeEntityText(name).replace(/'/g, "");
}

// --- seeded exchange prices keyed by exchange id (src/core/entities/prices.ts) ---
if (!/scratchpad|tmp|temp/.test(config.dbPath)) throw new Error(`refusing to seed prices into ${config.dbPath}; run via npm run test:coach`);
for (const suffix of ["", "-wal", "-shm"]) rmSync(`${config.dbPath}${suffix}`, { force: true });
const PRICE_LEAGUE = "Entity Price League";
const seed = (itemId: string, baseValue: number): PricedItem => ({
  itemId,
  itemName: itemId,
  category: "Ritual",
  baseValue,
  volume: 10,
  change7d: null,
  spark7d: null,
  icon: null,
});
insertSnapshots(PRICE_LEAGUE, [seed("omen-of-whittling", 2.5), seed("worthless", 0)]);
getDb().prepare("UPDATE price_snapshots SET fetched_at = '2026-09-29 10:00:00' WHERE league = ?").run(PRICE_LEAGUE);
insertSnapshots(PRICE_LEAGUE, [seed("omen-of-whittling", 3)]);
getDb()
  .prepare("UPDATE price_snapshots SET fetched_at = '2026-09-29 11:00:00' WHERE league = ? AND chaos_equiv = 3")
  .run(PRICE_LEAGUE);
const priced = exchangePriceMap(PRICE_LEAGUE);
assert.deepEqual(priced.get("omen-of-whittling"), { div: 3, fetchedAt: "2026-09-29T11:00:00.000Z" }, "latest row, UTC ISO time");
assert.equal(priced.has("worthless"), false, "a zero price is unpriced, never 0");
assert.equal(exchangePriceMap("Some Other League").size, 0, "league-scoped");
assert.equal(entityByExchangeId([...priced.keys()][0] ?? "")?.name, "Omen of Whittling", "price keys join entity exchange ids");
console.log("PASS  exchangePriceMap: latest Divine price + UTC time per exchange id, league-scoped, zero = unpriced");
