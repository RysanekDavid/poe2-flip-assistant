/*
 * Server-side assembly of the regex namespace from cached data only: ninja snapshots and the
 * scout valuation cache from the DB, trade2 reference data from tradeMeta's 24h in-process cache.
 * tradeMeta calls /api/trade2/data directly, not the trade2 search governor, so the regex tool
 * spends none of the search budget.
 */
import { fetchTradeMeta } from "../../../api/tradeMeta";
import {
  latestFetchedAt,
  latestItemValuesUpdatedAt,
  SCOUT_UNIQUE_SOURCE,
  latestSnapshots,
  uniqueValueMap,
} from "../../../db/marketQueries";
import { parseSqliteTimestamp } from "../../../lib/sqliteTime";
import type { DataAsOf } from "../../../lib/tools/regexContract";
import { buildNamespace, memoNamespace, type Namespace } from "./namespace";

export interface LoadedNamespace {
  ns: Namespace;
  dataAsOf: DataAsOf;
}

function sqliteUtcToIso(stamp: string | null): string | null {
  return stamp ? new Date(parseSqliteTimestamp(stamp)).toISOString() : null;
}

export async function loadRegexNamespace(league: string): Promise<LoadedNamespace> {
  const meta = await fetchTradeMeta();
  const dataAsOf: DataAsOf = {
    ninja: sqliteUtcToIso(latestFetchedAt(league)),
    uniques: sqliteUtcToIso(latestItemValuesUpdatedAt(league, SCOUT_UNIQUE_SOURCE)),
    tradeMeta: new Date(meta.at).toISOString(),
  };
  // uniques only: lineage-gem rows share item_values but must never be offered as a "Unique"
  const uniqueValues = uniqueValueMap(league);
  const signature = `${dataAsOf.ninja}|${dataAsOf.uniques}|${uniqueValues.size}|${meta.at}`;
  const ns = memoNamespace(league, signature, () =>
    buildNamespace({
      exchange: latestSnapshots(league),
      uniqueValues,
      uniqueNames: meta.uniques.map((u) => u.name),
      bases: meta.bases.flatMap((g) => g.types),
      statTexts: meta.stats.map((s) => s.text),
    }),
  );
  return { ns, dataAsOf };
}
