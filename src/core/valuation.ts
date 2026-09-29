import { latestSnapshots, uniqueValueMap, upsertItemValues, itemValuesAgeHours } from "../db/marketQueries";
import { fetchScout, fetchScoutLineage, type ScoutLineageGem } from "../api/scoutClient";
import { getDefaultLeague } from "./leagueState";

/**
 * Market valuation: resolve any stash item to a Divine value, generically, so every tab
 * (currency, essence, fragment, abyss, uniques…) gets a real worth instead of relying on
 * the item's own listing price (which is often a "~price 99999 mirror" showcase sentinel).
 *
 * Two sources, both already in our DB so a scan does ZERO network calls:
 *   - poe.ninja: every currency-exchange item, valued LIVE from price_snapshots (poller-fresh)
 *   - poe2scout: priced uniques and lineage gems, cached in item_values and refreshed every ~6h
 *     (refreshUniqueValues)
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
  const uniq = uniqueValueMap(league);

  return {
    value(name: string, stackSize: number): ItemValue | null {
      const key = name.toLowerCase();
      const qty = stackSize > 0 ? stackSize : 1;
      const n = ninja.get(key);
      if (n != null) return { div: n * qty, source: "ninja" };
      const u = uniq.get(key);
      if (u != null) return { div: u * qty, source: "scout" };
      return null;
    },
  };
}

const REFRESH_AFTER_H = 6;

/** item_values source tag for lineage gems — kept apart from "scout" so unique-only readers skip them. */
export const LINEAGE_SOURCE = "scout-lineage";

/** Lineage gems (priced in Exalted) → item_values rows in Divine; a 0 price never becomes a 0 value. */
export function lineageRows(gems: readonly ScoutLineageGem[], exaltPerDivine: number): Array<{ nameKey: string; div: number; source: string }> {
  if (!(exaltPerDivine > 0)) throw new Error(`lineage valuation needs a positive ex/div rate, got ${exaltPerDivine}`);
  return gems.filter((g) => g.priceExalt > 0).map((g) => ({ nameKey: g.name.toLowerCase(), div: g.priceExalt / exaltPerDivine, source: LINEAGE_SOURCE }));
}

/**
 * Refresh poe2scout unique and lineage-gem prices into item_values, at most once per 6 hours.
 * Returns rows written (0 if the cache is still fresh). Call before a balance scan so showcase
 * items get valued; the guard keeps it from hammering scout. Uniques are stored before the lineage
 * fetch, so a lineage failure still throws (and is logged by the caller) without losing them.
 */
export async function refreshUniqueValues(league: string = getDefaultLeague()): Promise<number> {
  const age = itemValuesAgeHours(league);
  if (age != null && age < REFRESH_AFTER_H) return 0;

  const { items, rates } = await fetchScout();
  const rows = items
    .filter((i) => i.priceExalt > 0 && i.name)
    .map((i) => ({ nameKey: i.name.toLowerCase(), div: i.priceExalt / rates.exaltPerDivine, source: "scout" }));
  upsertItemValues(league, rows);
  const lineage = lineageRows(await fetchScoutLineage(league), rates.exaltPerDivine);
  upsertItemValues(league, lineage);
  return rows.length + lineage.length;
}
