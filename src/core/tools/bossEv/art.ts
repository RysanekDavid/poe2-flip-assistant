import { z } from "zod";
import { artUrlSchema } from "./schema";

/*
 * Curated drop art (src/data/poe2/bosses/boss-art.json): poecdn URLs keyed by the item's display
 * name, fetched once offline — trade2 `data/static` for exchange items and lineage gems, poe2scout
 * `/Items` for uniques. poe.ninja's own image wins at runtime; this fills the gaps (uniques and
 * lineage gems are never on the exchange, and ninja has `image: null` for a few fragments).
 * Plain zod only: client-safe like schema.ts.
 */

export const bossArtFileSchema = z
  .object({
    provenance: z.string().min(1),
    fetched: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD"),
    icons: z.record(z.string().min(1), artUrlSchema),
  })
  .strict();
export type BossArtFile = z.infer<typeof bossArtFileSchema>;

/** Display name → art URL. */
export type BossArt = ReadonlyMap<string, string>;

/** Parse the curated art file, throwing with the first issue paths so the bad entry is findable. */
export function parseBossArt(raw: unknown): BossArt {
  const parsed = bossArtFileSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`boss-art.json invalid — ${issues.join("; ")}`);
  }
  return new Map(Object.entries(parsed.data.icons));
}
