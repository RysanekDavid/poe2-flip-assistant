import { z } from "zod";
import { parseBossLoot, type BossLootFile } from "./schema";
import abyss from "../../../data/poe2/bosses/loot/abyss.json";
import breach from "../../../data/poe2/bosses/loot/breach.json";
import delirium from "../../../data/poe2/bosses/loot/delirium.json";
import expedition from "../../../data/poe2/bosses/loot/expedition.json";
import meta from "../../../data/poe2/bosses/loot/meta.json";
import precursorFortress from "../../../data/poe2/bosses/loot/precursor-fortress.json";
import ritual from "../../../data/poe2/bosses/loot/ritual.json";
import trials from "../../../data/poe2/bosses/loot/trials.json";

/*
 * The curated boss tables live as one file per mechanic (src/data/poe2/bosses/loot/*.json) so each
 * stays small enough to review; this assembles them into the single BossLootFile shape the strict
 * schema validates. Each part declares the poe.ninja ids its own bosses reference.
 */

const PARTS: ReadonlyArray<readonly [string, unknown]> = [
  ["delirium", delirium],
  ["ritual", ritual],
  ["abyss", abyss],
  ["precursor-fortress", precursorFortress],
  ["trials", trials],
  ["expedition", expedition],
  ["breach", breach],
];

const partSchema = z.object({ ninjaCategories: z.record(z.string(), z.string().nullable()), bosses: z.array(z.unknown()).min(1) }).strict();

/** The assembled, NOT yet validated file — tests mutate a copy of it to prove the schema rejects. */
export function rawBossLoot(): Record<string, unknown> {
  const ninjaCategories: Record<string, string | null> = {};
  const bosses: unknown[] = [];
  for (const [name, raw] of PARTS) {
    const part = partSchema.safeParse(raw);
    if (!part.success) throw new Error(`boss loot part ${name}.json invalid — ${part.error.issues[0]?.message ?? "shape"}`);
    for (const [id, type] of Object.entries(part.data.ninjaCategories)) {
      // two parts may both use an id (a shared entry item), but never under different ninja types
      if (id in ninjaCategories && ninjaCategories[id] !== type) throw new Error(`boss loot: ${id} declared as ${ninjaCategories[id]} and ${type} (${name}.json)`);
      ninjaCategories[id] = type;
    }
    bosses.push(...part.data.bosses);
  }
  return structuredClone({ ...(meta as Record<string, unknown>), ninjaCategories, bosses });
}

/** The validated curated boss tables; throws with the offending paths when any part is malformed. */
export function loadBossLoot(): BossLootFile {
  return parseBossLoot(rawBossLoot());
}
