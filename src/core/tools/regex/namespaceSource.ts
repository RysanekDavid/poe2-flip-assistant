/*
 * Server-side assembly of the regex namespace from cached data only: ninja snapshots and the
 * scout valuation cache from the DB, trade2 reference data from tradeMeta's 24h in-process cache.
 * tradeMeta calls /api/trade2/data directly, not the trade2 search governor, so the regex tool
 * spends none of the search budget.
 */
import { z } from "zod";
import { fetchTradeMeta } from "../../../api/tradeMeta";
import { itemValuesAgeHours, latestFetchedAt, latestSnapshots, uniqueValueMap } from "../../../db/marketQueries";
import type { DataAsOf } from "../../../lib/tools/regexContract";
import { buildNamespace, memoNamespace, type Namespace } from "./namespace";

export interface LoadedNamespace {
  ns: Namespace;
  dataAsOf: DataAsOf;
}

// fetchTradeMeta returns its cache object, which carries its load time at runtime but not in its
// declared type. Read it through a schema so a refactor that drops it fails here, loudly.
const TradeMetaStamp = z.object({ at: z.number() });

function tradeMetaLoadedAt(meta: unknown): number {
  const parsed = TradeMetaStamp.safeParse(meta);
  if (!parsed.success) throw new Error("fetchTradeMeta() no longer exposes its load time (`at`) — the regex namespace memo needs it");
  return parsed.data.at;
}

/** sqlite "YYYY-MM-DD HH:MM:SS" (UTC, no zone marker) → ISO. */
function sqliteUtcToIso(stamp: string | null): string | null {
  return stamp ? new Date(`${stamp.replace(" ", "T")}Z`).toISOString() : null;
}

function uniquesRefreshedAt(league: string): string | null {
  const ageH = itemValuesAgeHours(league);
  if (ageH === null) return null;
  // item_values stamps are whole seconds, so rounding recovers the exact stored time.
  return new Date(Math.round((Date.now() - ageH * 3600_000) / 1000) * 1000).toISOString();
}

export async function loadRegexNamespace(league: string): Promise<LoadedNamespace> {
  const meta = await fetchTradeMeta();
  const metaAt = tradeMetaLoadedAt(meta);
  const dataAsOf: DataAsOf = {
    ninja: sqliteUtcToIso(latestFetchedAt(league)),
    uniques: uniquesRefreshedAt(league),
    tradeMeta: new Date(metaAt).toISOString(),
  };
  const uniqueValues = uniqueValueMap(league);
  const signature = `${dataAsOf.ninja}|${dataAsOf.uniques}|${uniqueValues.size}|${metaAt}`;
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
