import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { z } from "zod";

/**
 * GGG base item id → in-game name, from the committed RePoE snapshot (src/data/poe2/repoe,
 * written by `npm run sync:poe2-data`).
 *
 * The currency-exchange digest names items only by metadata id; poe.ninja names them by display
 * name. The catalog is the one deterministic bridge between the two — no fuzzy matching.
 *
 * Only the poller process loads this: the catalog is ~60 MB decoded. The map is kept (a few
 * thousand strings) and the raw payload dropped as soon as it has been read.
 */

const REPOE_DIR = join(process.cwd(), "src/data/poe2/repoe");

const ManifestSchema = z.object({ artifact: z.string().regex(/^catalog-[0-9a-f]{16}\.json\.gz$/) });

const CatalogSchema = z.object({
  sources: z.object({
    base_items: z.record(z.object({ name: z.string().nullish() }).passthrough()),
  }),
});

let cached: Map<string, string> | null = null;

/** Every base item id with a non-empty name. Throws loudly if the snapshot is missing or malformed. */
export function repoeBaseItemNames(): Map<string, string> {
  if (cached != null) return cached;
  const manifestRaw: unknown = JSON.parse(readFileSync(join(REPOE_DIR, "manifest.json"), "utf8"));
  const manifest = ManifestSchema.parse(manifestRaw);
  const decoded: unknown = JSON.parse(gunzipSync(readFileSync(join(REPOE_DIR, manifest.artifact))).toString("utf8"));
  const parsed = CatalogSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new Error(`RePoE catalog shape mismatch: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join(".")).join("; ")}`);
  }
  const names = new Map<string, string>();
  for (const [id, record] of Object.entries(parsed.data.sources.base_items)) {
    const name = record.name?.trim();
    if (name) names.set(id, name);
  }
  cached = names;
  return names;
}

/** Names for the requested ids; ids the catalog does not know are simply absent from the result. */
export function resolveBaseItemNames(ids: readonly string[]): Map<string, string> {
  const catalog = repoeBaseItemNames();
  const out = new Map<string, string>();
  for (const id of ids) {
    const name = catalog.get(id);
    if (name != null) out.set(id, name);
  }
  return out;
}
