/* npm run strategies:check [-- explicit.stat_<n> …] — resolve every strategy tablet against the LIVE
 * trade2 data catalog (read-only endpoints, no POESESSID; needs DATA_SOURCE_CONTACT or POE_CONTACT
 * for the UA): each trade_stat_id must be an explicit stat, each tablet type a trade2 base, each unique
 * tablet a trade2 unique on that base. A wrong id would open a search for a different mod, so this
 * prints the mod text next to EVERY text trade2 files under that id (trade2 repeats an id with
 * "Area"/"Map" wordings, and the one that matches is what proves the id) and exits 1 on any miss.
 * Extra ids on the command line are printed the same way, to settle a stat left null in the data.
 * Network-bound, so not part of CI. */
import "../config/env";
import { fetchTradeMeta } from "../api/tradeMeta";
import { loadStrategies } from "../core/strategies/load";
import { TRADE_STAT_ID_PATTERN, type FarmStrategy } from "../core/strategies/schema";

interface Catalog {
  explicit: ReadonlyMap<string, readonly string[]>;
  bases: ReadonlySet<string>;
  uniques: ReadonlySet<string>;
}

const texts = (list: readonly string[]): string => list.map((t) => `"${t}"`).join(" | ");

function checkStrategy(strategy: FarmStrategy, catalog: Catalog): number {
  let misses = 0;
  console.log(strategy.id);
  for (const tablet of strategy.tablets) {
    const baseOk = catalog.bases.has(tablet.type);
    console.log(`  ${baseOk ? "ok  " : "MISS"} base "${tablet.type}"`);
    if (!baseOk) misses += 1;
    if (tablet.unique !== null) {
      const uniqueOk = catalog.uniques.has(`${tablet.unique}|${tablet.type}`);
      console.log(`  ${uniqueOk ? "ok  " : "MISS"} unique "${tablet.unique}" on ${tablet.type}`);
      if (!uniqueOk) misses += 1;
    }
    for (const mod of tablet.mods) {
      if (mod.trade_stat_id === null) {
        console.log(`  --   "${mod.text}" (no stat id: ${mod.claim.note ?? "no note"})`);
        continue;
      }
      const found = catalog.explicit.get(mod.trade_stat_id);
      console.log(`  ${found ? "ok  " : "MISS"} "${mod.text}" → ${mod.trade_stat_id}${found ? ` = ${texts(found)}` : " (not an explicit trade2 stat)"}`);
      if (!found) misses += 1;
    }
  }
  return misses;
}

function printExtraIds(ids: readonly string[], catalog: Catalog): number {
  let misses = 0;
  if (ids.length > 0) console.log("\nrequested ids");
  for (const id of ids) {
    if (!TRADE_STAT_ID_PATTERN.test(id)) throw new Error(`"${id}" is not an explicit.stat_<n> id`);
    const found = catalog.explicit.get(id);
    console.log(`  ${found ? "ok  " : "MISS"} ${id}${found ? ` = ${texts(found)}` : " (not an explicit trade2 stat)"}`);
    if (!found) misses += 1;
  }
  return misses;
}

async function main(): Promise<void> {
  const meta = await fetchTradeMeta();
  const explicit = new Map<string, string[]>();
  for (const stat of meta.stats) {
    if (stat.group !== "explicit") continue;
    const list = explicit.get(stat.id) ?? [];
    if (!list.includes(stat.text)) list.push(stat.text);
    explicit.set(stat.id, list);
  }
  const catalog: Catalog = {
    explicit,
    bases: new Set(meta.bases.flatMap((g) => g.types)),
    uniques: new Set(meta.uniques.map((u) => `${u.name}|${u.type}`)),
  };
  console.log(`trade2 catalog: ${catalog.explicit.size} explicit stat ids, ${catalog.bases.size} bases, ${catalog.uniques.size} uniques`);
  const strategyMisses = loadStrategies().reduce((sum, strategy) => sum + checkStrategy(strategy, catalog), 0);
  const misses = strategyMisses + printExtraIds(process.argv.slice(2), catalog);
  console.log(misses === 0 ? "\nALL RESOLVED" : `\n${misses} UNRESOLVED`);
  process.exit(misses === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
