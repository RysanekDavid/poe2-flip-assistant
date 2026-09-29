/* npm run strategies:check — resolve every strategy tablet against the LIVE trade2 data catalog
 * (read-only endpoints, no POESESSID; needs DATA_SOURCE_CONTACT or POE_CONTACT for the UA): each
 * trade_stat_id must be an explicit stat, each tablet type a trade2 base, each unique tablet a
 * trade2 unique on that base. A wrong id would open a search for a different mod, so this prints
 * both texts side by side and exits 1 on any miss. Network-bound, so not part of CI. */
import "../config/env";
import { fetchTradeMeta, type StatOption } from "../api/tradeMeta";
import { loadStrategies } from "../core/strategies/load";
import type { FarmStrategy } from "../core/strategies/schema";

interface Catalog {
  explicit: ReadonlyMap<string, StatOption>;
  bases: ReadonlySet<string>;
  uniques: ReadonlySet<string>;
}

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
      const stat = catalog.explicit.get(mod.trade_stat_id);
      console.log(`  ${stat ? "ok  " : "MISS"} "${mod.text}" → ${mod.trade_stat_id}${stat ? ` = "${stat.text}"` : " (not an explicit trade2 stat)"}`);
      if (!stat) misses += 1;
    }
  }
  return misses;
}

async function main(): Promise<void> {
  const meta = await fetchTradeMeta();
  const catalog: Catalog = {
    // First text per id: trade2 repeats an id with "Area"/"Map" wordings.
    explicit: new Map(meta.stats.filter((s) => s.group === "explicit").reverse().map((s) => [s.id, s])),
    bases: new Set(meta.bases.flatMap((g) => g.types)),
    uniques: new Set(meta.uniques.map((u) => `${u.name}|${u.type}`)),
  };
  console.log(`trade2 catalog: ${catalog.explicit.size} explicit stat ids, ${catalog.bases.size} bases, ${catalog.uniques.size} uniques`);
  const misses = loadStrategies().reduce((sum, strategy) => sum + checkStrategy(strategy, catalog), 0);
  console.log(misses === 0 ? "\nALL RESOLVED" : `\n${misses} UNRESOLVED`);
  process.exit(misses === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
