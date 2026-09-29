import {
  itemValuesAgeHours,
  latestSnapshots,
  SCOUT_LINEAGE_SOURCE,
  SCOUT_UNIQUE_SOURCE,
  scoutKeysOf,
  scoutValueMap,
  upsertItemValues,
  type ScoutValueSource,
} from "../db/marketQueries";
import { fetchScout, fetchScoutLineage, fetchScoutRates, type ScoutLineageGem } from "../api/scoutClient";
import { getDefaultLeague } from "./leagueState";

/**
 * Market valuation: resolve any stash item to a Divine value, generically, so every tab
 * (currency, essence, fragment, abyss, uniques…) gets a real worth instead of relying on
 * the item's own listing price (which is often a "~price 99999 mirror" showcase sentinel).
 *
 * Two sources, both already in our DB so a scan does ZERO network calls:
 *   - poe.ninja: every currency-exchange item, valued LIVE from price_snapshots (poller-fresh)
 *   - poe2scout: priced uniques and lineage gems, cached in item_values; the poller refreshes
 *     each on its own ~6h cadence (refreshUniqueValues / refreshLineageValues)
 */
export interface ItemValue {
  div: number; // total value (unit × stack)
  source: "ninja" | "scout";
}

export interface Valuer {
  value(name: string, stackSize: number): ItemValue | null;
}

/** Build a resolver from one league's cached DB maps (no network). ninja wins over scout. */
export function buildValuer(league: string = getDefaultLeague()): Valuer {
  const ninja = new Map<string, number>();
  for (const s of latestSnapshots(league)) ninja.set(s.itemName.toLowerCase(), s.baseValue);
  // uniques and lineage gems both sit in stashes; both are poe2scout values
  const scout = scoutValueMap(league);

  return {
    value(name: string, stackSize: number): ItemValue | null {
      const key = name.toLowerCase();
      const qty = stackSize > 0 ? stackSize : 1;
      const n = ninja.get(key);
      if (n != null) return { div: n * qty, source: "ninja" };
      const u = scout.get(key);
      if (u != null) return { div: u * qty, source: "scout" };
      return null;
    },
  };
}

export const REFRESH_AFTER_H = 6;

type ValueRow = { nameKey: string; div: number; source: ScoutValueSource };

/**
 * Exalted prices → item_values rows in Divine. A 0 price is KEPT as a 0 row: it records "listed
 * by poe2scout, no current price" (readers skip value 0), distinct from "not listed at all".
 */
export function scoutRows(items: ReadonlyArray<{ name: string; priceExalt: number }>, exaltPerDivine: number, source: ScoutValueSource): ValueRow[] {
  if (!(exaltPerDivine > 0)) throw new Error(`scout valuation needs a positive ex/div rate, got ${exaltPerDivine}`);
  return items.map((i) => ({ nameKey: i.name.toLowerCase(), div: Math.max(0, i.priceExalt) / exaltPerDivine, source }));
}

/** Lineage gems → item_values rows (see scoutRows). */
export const lineageRows = (gems: readonly ScoutLineageGem[], exaltPerDivine: number): ValueRow[] => scoutRows(gems, exaltPerDivine, SCOUT_LINEAGE_SOURCE);

/**
 * item_values is keyed by name alone, so a lineage gem and a unique sharing a name would silently
 * overwrite each other's value (and source). Refuse to write instead.
 */
export function assertDisjoint(rows: readonly ValueRow[], otherKeys: ReadonlySet<string>, otherSource: ScoutValueSource): void {
  const clash = rows.filter((r) => otherKeys.has(r.nameKey)).map((r) => r.nameKey);
  if (clash.length > 0) throw new Error(`poe2scout names collide with stored ${otherSource} rows: ${clash.slice(0, 5).join(", ")}`);
}

const fresh = (league: string, source: ScoutValueSource): boolean => {
  const age = itemValuesAgeHours(league, source);
  return age != null && age < REFRESH_AFTER_H;
};

/** Refresh `league`'s poe2scout unique prices (≤ once per 6h). Returns rows written, 0 when still fresh. */
export async function refreshUniqueValues(league: string = getDefaultLeague()): Promise<number> {
  if (fresh(league, SCOUT_UNIQUE_SOURCE)) return 0;
  const { items, rates } = await fetchScout(league);
  const rows = scoutRows(items.filter((i) => i.name), rates.exaltPerDivine, SCOUT_UNIQUE_SOURCE);
  assertDisjoint(rows, scoutKeysOf(league, SCOUT_LINEAGE_SOURCE), SCOUT_LINEAGE_SOURCE);
  upsertItemValues(league, rows);
  return rows.length;
}

/**
 * Refresh `league`'s lineage-gem prices (≤ once per 6h), on their own age: a failing lineage fetch
 * stays visibly stale instead of hiding behind a fresh uniques timestamp.
 */
export async function refreshLineageValues(league: string = getDefaultLeague()): Promise<number> {
  if (fresh(league, SCOUT_LINEAGE_SOURCE)) return 0;
  const rates = await fetchScoutRates(league);
  const rows = lineageRows(await fetchScoutLineage(league), rates.exaltPerDivine);
  assertDisjoint(rows, scoutKeysOf(league, SCOUT_UNIQUE_SOURCE), SCOUT_UNIQUE_SOURCE);
  upsertItemValues(league, rows);
  return rows.length;
}
