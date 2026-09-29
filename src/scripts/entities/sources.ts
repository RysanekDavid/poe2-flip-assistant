/*
 * The two network inputs of the entity catalog, fetched once per build (offline, never at request
 * time): trade2 `data/static` (every Currency Exchange item with its signed poecdn art) and the
 * poe2scout unique list (unique art + base type). Both are validated before use; `--cache <dir>`
 * reuses earlier bodies so iterating on the builder does not hit either service again.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const TRADE_STATIC_URL = "https://www.pathofexile.com/api/trade2/data/static";
// Unique art and base types do not depend on the league; Standard lists every unique scout has seen.
const SCOUT_UNIQUES_URL = "https://api.poe2scout.com/poe2/Leagues/Standard/Items";
// Honest, descriptive agent: no browser spoofing and no personal contact in a committed file.
const USER_AGENT = "poe2-flip-assistant-entity-sync/1.0 (read-only static data)";

export const tradeStaticSchema = z.object({
  result: z.array(
    z.object({
      id: z.string().min(1),
      label: z.string().nullable(),
      entries: z.array(z.object({ id: z.string().min(1), text: z.string(), image: z.string().optional() }).strict()),
    }),
  ),
});
export type TradeStatic = z.infer<typeof tradeStaticSchema>;

export const scoutUniquesSchema = z.array(
  z
    .object({
      CategoryApiId: z.string(),
      Name: z.string().nullish(),
      Type: z.string().nullish(),
      IconUrl: z.string().nullish(),
    })
    .passthrough(),
);
export type ScoutUniques = z.infer<typeof scoutUniquesSchema>;

export interface EntitySources {
  tradeStatic: TradeStatic;
  tradeStaticSha256: string;
  scoutUniques: ScoutUniques;
}

async function fetchBody(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`entity source fetch failed: ${url} → HTTP ${res.status}`);
  return res.text();
}

/** Cached body when `cacheDir` holds it, else one sequential fetch (written back to the cache). */
async function body(url: string, cacheDir: string | null, file: string): Promise<string> {
  const cached = cacheDir ? join(cacheDir, file) : null;
  if (cached && existsSync(cached)) {
    console.log(`[entities] using cached ${file}`);
    return readFileSync(cached, "utf8");
  }
  console.log(`[entities] fetching ${url}`);
  const text = await fetchBody(url);
  if (cacheDir && cached) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cached, text);
  }
  return text;
}

function parseBody<T>(schema: z.ZodType<T>, text: string, label: string): T {
  const parsed = schema.safeParse(JSON.parse(text) as unknown);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`${label} response shape mismatch: ${where.join("; ")}`);
  }
  return parsed.data;
}

export async function loadEntitySources(cacheDir: string | null): Promise<EntitySources> {
  // Sequential on purpose: two small requests, and neither service should see a burst from us.
  const staticText = await body(TRADE_STATIC_URL, cacheDir, "trade2-static.json");
  const scoutText = await body(SCOUT_UNIQUES_URL, cacheDir, "scout-uniques.json");
  return {
    tradeStatic: parseBody(tradeStaticSchema, staticText, "trade2 data/static"),
    tradeStaticSha256: createHash("sha256").update(staticText).digest("hex"),
    scoutUniques: parseBody(scoutUniquesSchema, scoutText, "poe2scout uniques"),
  };
}

const artParamsSchema = z.tuple([z.number(), z.number(), z.object({ f: z.string().min(1) }).passthrough()]);

/**
 * The art path inside a signed poecdn image URL: `/gen/image/<base64 json>/<hash>/<file>.png`
 * carries `[25,14,{"f":"2DItems/Currency/FracturingOrb",…}]`, which is RePoE's
 * `visual_identity.dds_file` without the `Art/` prefix and `.dds` suffix — the join key between
 * trade2/scout art and RePoE items.
 */
export function artPathFromImage(image: string): string {
  const segment = image.split("/gen/image/")[1]?.split("/")[0];
  if (!segment) throw new Error(`not a poecdn gen/image URL: ${image}`);
  const decoded: unknown = JSON.parse(Buffer.from(segment, "base64").toString("utf8"));
  return artParamsSchema.parse(decoded)[2].f;
}

/** RePoE `Art/2DItems/Currency/FracturingOrb.dds` → `2DItems/Currency/FracturingOrb`. */
export function artPathFromDds(ddsFile: string): string {
  return ddsFile.replace(/^Art\//, "").replace(/\.dds$/, "");
}

/** trade2 static images are site-relative; the CDN host is where the browser loads them. */
export function absoluteIcon(image: string): string {
  return image.startsWith("https://") ? image : `https://web.poecdn.com${image}`;
}
