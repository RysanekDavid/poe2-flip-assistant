/*
 * Server-side reader for the committed entity catalog (src/data/poe2/entities.json.gz). It is
 * immutable for a release, so one parse per process; any defect throws instead of degrading to an
 * empty catalog, because every lookup would then silently answer "unknown item".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { entityCatalogSchema, type EntityCatalog, type EntityRow } from "./schema";

export const ENTITY_CATALOG_PATH = join(process.cwd(), "src", "data", "poe2", "entities.json.gz");

interface SearchEntry {
  row: EntityRow;
  /** Name first, then aliases, each as a search key. */
  keys: readonly string[];
}

interface EntityIndex {
  catalog: EntityCatalog;
  byId: ReadonlyMap<string, EntityRow>;
  byExchangeId: ReadonlyMap<string, EntityRow>;
  search: readonly SearchEntry[];
}

let cached: EntityIndex | null = null;

/**
 * Mirrors services/coach/src/entities/catalog.py `normalize`: curly apostrophes become straight,
 * whitespace runs collapse, then case folds. The Coach and the web must agree on what one surface is.
 */
export function normalizeEntityText(text: string): string {
  return text.replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim().toLowerCase();
}

// A typeahead user rarely types the apostrophe ("kulemaks"), so search drops it on both sides.
const searchKey = (text: string): string => normalizeEntityText(text).replace(/'/g, "");

function uniqueIndex(rows: readonly EntityRow[], keyOf: (row: EntityRow) => string | null, label: string): Map<string, EntityRow> {
  const index = new Map<string, EntityRow>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    const owner = index.get(key);
    if (owner) throw new Error(`entity catalog: ${label} "${key}" belongs to both ${owner.id} and ${row.id}`);
    index.set(key, row);
  }
  return index;
}

function buildIndex(catalog: EntityCatalog): EntityIndex {
  return {
    catalog,
    byId: uniqueIndex(catalog.entities, (row) => row.id, "id"),
    byExchangeId: uniqueIndex(catalog.entities, (row) => row.exchange_id, "exchange id"),
    search: catalog.entities.map((row) => ({ row, keys: [row.name, ...row.aliases].map(searchKey) })),
  };
}

function readCatalog(path: string): EntityCatalog {
  const raw: unknown = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
  const parsed = entityCatalogSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`entity catalog ${path} is malformed — rebuild with npm run sync:entities (${where.join("; ")})`);
  }
  return parsed.data;
}

function index(): EntityIndex {
  cached ??= buildIndex(readCatalog(ENTITY_CATALOG_PATH));
  return cached;
}

/** The whole validated catalog (parsed once per process; throws when missing or malformed). */
export function loadEntityCatalog(): EntityCatalog {
  return index().catalog;
}

export function entityById(id: string): EntityRow | null {
  return index().byId.get(id) ?? null;
}

/** The row whose trade2 static id (= poe.ninja exchange item id) is `exchangeId`. */
export function entityByExchangeId(exchangeId: string): EntityRow | null {
  return index().byExchangeId.get(exchangeId) ?? null;
}

/**
 * Typeahead over names and aliases: every prefix hit ranks above every substring hit, then shorter
 * names first (an exact name is the shortest prefix), then alphabetical for a stable order.
 */
export function searchEntities(query: string, limit: number): EntityRow[] {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError(`searchEntities limit must be a positive integer, got ${limit}`);
  const needle = searchKey(query);
  if (!needle) return [];
  const hits: Array<{ row: EntityRow; tier: 0 | 1 }> = [];
  for (const { row, keys } of index().search) {
    if (keys.some((key) => key.startsWith(needle))) hits.push({ row, tier: 0 });
    else if (keys.some((key) => key.includes(needle))) hits.push({ row, tier: 1 });
  }
  hits.sort((a, b) => a.tier - b.tier || a.row.name.length - b.row.name.length || a.row.name.localeCompare(b.row.name));
  return hits.slice(0, limit).map((hit) => hit.row);
}
