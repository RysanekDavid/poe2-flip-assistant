/*
 * Build the entity catalog (src/data/poe2/entities.json.gz) from the committed RePoE snapshot plus
 * two offline fetches (trade2 data/static art, poe2scout unique art). Re-run after every
 * `npm run sync:poe2-data` — test:coach fails while the stamp differs from repoe/manifest.json.
 * Run: npm run sync:entities [-- --cache <dir>]   (--cache reuses earlier fetched bodies)
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import {
  ENTITY_CATALOG_SCHEMA_VERSION,
  ENTITY_KINDS,
  entityCatalogSchema,
  type EntityCatalog,
  type EntityRow,
} from "../core/entities/schema";
import { DATA_DIR, parseSnapshotShape, readSnapshot } from "./repoe/snapshot";
import { entityRepoeSchema } from "./entities/repoeText";
import { assertCatalogIntegrity, exchangeRows, uniqueRows } from "./entities/rows";
import { loadEntitySources } from "./entities/sources";

export const ENTITY_CATALOG_PATH = join(DATA_DIR, "entities.json.gz");

function cacheDirArg(argv: string[]): string | null {
  const index = argv.indexOf("--cache");
  if (index < 0) return null;
  const dir = argv[index + 1];
  if (!dir) throw new Error("--cache needs a directory");
  return dir;
}

const kindOrder = (row: EntityRow): number => ENTITY_KINDS.indexOf(row.kind);

function report(rows: EntityRow[]): void {
  const byKind = ENTITY_KINDS.map((kind) => {
    const of = rows.filter((r) => r.kind === kind);
    return of.length > 0 ? `${kind} ${of.length}` : null;
  }).filter((s): s is string => s !== null);
  const pct = (n: number, d: number): string => `${((n / Math.max(d, 1)) * 100).toFixed(1)}%`;
  const exchange = rows.filter((r) => r.exchange_id !== null);
  console.log(`[entities] ${rows.length} rows: ${byKind.join(", ")}`);
  console.log(`[entities] icons: all ${pct(rows.filter((r) => r.icon_url).length, rows.length)}, exchange ${pct(exchange.filter((r) => r.icon_url).length, exchange.length)}`);
  console.log(`[entities] summaries: all ${pct(rows.filter((r) => r.summary).length, rows.length)}, exchange ${pct(exchange.filter((r) => r.summary).length, exchange.length)}`);
  const missing = rows.filter((r) => !r.icon_url).map((r) => `${r.name} (${r.kind})`);
  if (missing.length > 0) console.log(`[entities] missing icons (${missing.length}): ${missing.join(", ")}`);
}

async function main(): Promise<void> {
  const { manifest, decoded, gameDataPatch } = readSnapshot();
  const repoe = parseSnapshotShape(entityRepoeSchema, decoded, "RePoE entity sources").sources;
  const sources = await loadEntitySources(cacheDirArg(process.argv.slice(2)));
  const exchange = exchangeRows(sources, repoe);
  const uniques = uniqueRows(sources, repoe, new Set(exchange.map((r) => r.name)));
  const rows = [...exchange, ...uniques].sort((a, b) => kindOrder(a) - kindOrder(b) || a.name.localeCompare(b.name));
  assertCatalogIntegrity(rows);
  const catalog: EntityCatalog = entityCatalogSchema.parse({
    schema_version: ENTITY_CATALOG_SCHEMA_VERSION,
    source_sha256: manifest.artifact_sha256,
    repoe_version: manifest.repoe_version,
    game_data_patch: gameDataPatch,
    trade_static_sha256: sources.tradeStaticSha256,
    fetched_on: new Date().toISOString().slice(0, 10),
    entities: rows,
  });
  // Node's gzip header carries mtime 0, so identical rows on the same day rebuild to identical bytes.
  const bytes = gzipSync(`${JSON.stringify(catalog)}\n`, { level: 9 });
  writeFileSync(ENTITY_CATALOG_PATH, bytes);
  report(rows);
  console.log(`[entities] wrote ${ENTITY_CATALOG_PATH} (${(bytes.length / 1024).toFixed(0)} KB) — data ${gameDataPatch} / RePoE ${manifest.repoe_version}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
