/*
 * Reader for the golden craft set and its two companion files. Fails loudly like load.ts: a
 * malformed entry, an id that is not its filename or a stray file is a defect, never skipped,
 * because a silently dropped entry would raise the pass rate.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { goldenEntrySchema, GOLDEN_RESERVED_FILES, type GoldenEntry } from "./goldenSchema";
import { priceSnapshotSchema, type PriceSnapshot } from "./goldenPrices";
import { scoreboardSchema, type Scoreboard } from "./goldenScore";
import { CRAFT_MINING_DIR, GOLDEN_DIR_NAME, parseResearchFile } from "./load";

export const GOLDEN_DIR = join(CRAFT_MINING_DIR, GOLDEN_DIR_NAME);
export const PRICE_SNAPSHOT_PATH = join(GOLDEN_DIR, "prices.snapshot.json");
export const SCOREBOARD_PATH = join(GOLDEN_DIR, "scoreboard.json");

const RESERVED = new Set<string>(GOLDEN_RESERVED_FILES);

/** Every golden entry in `dir`, sorted by id; prose (*.md) may sit beside them. */
export function readGoldenEntries(dir: string = GOLDEN_DIR): GoldenEntry[] {
  if (!existsSync(dir)) throw new Error(`craft:eval: no golden directory at ${dir}`);
  const files = readdirSync(dir).sort();
  const stray = files.filter((f) => !f.endsWith(".json") && !f.endsWith(".md"));
  if (stray.length > 0) throw new Error(`craft:eval ${dir}: only <id>.json entries and *.md notes belong here, found ${stray.join(", ")}`);
  const entries = files
    .filter((f) => f.endsWith(".json") && !RESERVED.has(f))
    .map((file) => {
      const path = join(dir, file);
      const entry = parseResearchFile(path, goldenEntrySchema);
      const id = file.replace(/\.json$/, "");
      if (entry.id !== id) throw new Error(`craft:eval ${path}: id "${entry.id}" must equal the filename "${id}"`);
      return entry;
    });
  if (entries.length === 0) throw new Error(`craft:eval ${dir}: no golden entries`);
  return entries;
}

export const readPriceSnapshot = (path: string = PRICE_SNAPSHOT_PATH): PriceSnapshot => {
  if (!existsSync(path)) throw new Error(`craft:eval: no price snapshot at ${path}; run npm run craft:eval:prices`);
  return parseResearchFile(path, priceSnapshotSchema);
};

export const readScoreboard = (path: string = SCOREBOARD_PATH): Scoreboard => {
  if (!existsSync(path)) throw new Error(`craft:eval --check: no baseline at ${path}; run npm run craft:eval first and commit it`);
  return parseResearchFile(path, scoreboardSchema);
};
