/*
 * npm run craft:eval:prices [-- --league "<name>"]
 * Refreshes docs/research/craft-mining/golden/prices.snapshot.json from the app's own poe.ninja
 * client (src/api/ninjaClient.ts, rate-limited: ~25 s per category, so about three minutes). Only
 * the categories that price planner materials are read. The league defaults to the app's configured
 * league (LEAGUE_NAME, else config's fallback); the runtime Settings league lives in the server DB,
 * which an offline script must not open or create.
 */
import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import { config } from "../../config/env";
import { fetchCategory, normalize } from "../../api/ninjaClient";
import { CATEGORIES } from "../../api/types";
import { buildSnapshot } from "../../core/research/craftMining/goldenPrices";
import { PRICE_SNAPSHOT_PATH } from "../../core/research/craftMining/goldenLoad";

/** ninja categories behind the planner's material groups: currency, omens (Ritual), essences, catalysts (Breach), bones (Abyss), liquids (Delirium), runes. */
const PLANNER_CATEGORIES = ["Currency", "Ritual", "Essences", "Breach", "Abyss", "Delirium", "Runes"] as const;

function parseLeague(argv: readonly string[]): string {
  if (argv.length === 0) return config.league;
  if (argv.length === 2 && argv[0] === "--league" && argv[1]!.trim() !== "") return argv[1]!.trim();
  throw new Error(`craft:eval:prices: unknown arguments "${argv.join(" ")}" (usage: --league "<name>")`);
}

async function main(): Promise<void> {
  const league = parseLeague(process.argv.slice(2));
  const categories = CATEGORIES.filter((c) => (PLANNER_CATEGORIES as readonly string[]).includes(c.type));
  if (categories.length !== PLANNER_CATEGORIES.length) throw new Error(`craft:eval:prices: ninja categories changed; expected ${PLANNER_CATEGORIES.join(", ")}`);
  const divPerUnit = new Map<string, number>();
  for (const category of categories) {
    console.log(`fetching poe.ninja ${category.type} (${league})…`);
    for (const row of normalize(await fetchCategory(category, league), category.type)) divPerUnit.set(row.itemId, row.baseValue);
  }
  const fetchedAt = new Date();
  const source = `poe.ninja PoE2 currency exchange overview via src/api/ninjaClient.ts fetchCategory (categories ${PLANNER_CATEGORIES.join(", ")}; primaryValue = Divine per unit), read ${fetchedAt.toISOString().slice(0, 10)}`;
  const snapshot = buildSnapshot({ league, fetchedAt, source, divPerUnit });
  writeFileSync(PRICE_SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`wrote ${relative(process.cwd(), PRICE_SNAPSHOT_PATH)}: ${Object.keys(snapshot.prices).length} priced, ${snapshot.unpriced.length} unpriced, ${snapshot.exaltPerDivine?.toFixed(1) ?? "no"} Exalted per Divine`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
