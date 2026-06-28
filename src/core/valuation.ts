import { latestSnapshots, uniqueValueMap, upsertItemValues, itemValuesAgeHours } from "../db/queries";
import { fetchScout } from "../api/scoutClient";

/**
 * Market valuation: resolve any stash item to a Divine value, generically, so every tab
 * (currency, essence, fragment, abyss, uniques…) gets a real worth instead of relying on
 * the item's own listing price (which is often a "~price 99999 mirror" showcase sentinel).
 *
 * Two sources, both already in our DB so a scan does ZERO network calls:
 *   - poe.ninja: every currency-exchange item, valued LIVE from price_snapshots (poller-fresh)
 *   - poe2scout: priced uniques, cached in item_values and refreshed ~daily (refreshUniqueValues)
 */
export interface ItemValue {
  div: number; // total value (unit × stack)
  source: "ninja" | "scout";
}

export interface Valuer {
  value(name: string, stackSize: number): ItemValue | null;
}

/** Build a resolver from the cached DB maps (no network). ninja wins over scout on name clash. */
export function buildValuer(): Valuer {
  const ninja = new Map<string, number>();
  for (const s of latestSnapshots()) ninja.set(s.itemName.toLowerCase(), s.baseValue);
  const uniq = uniqueValueMap();

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

const REFRESH_AFTER_H = 24;

/**
 * Refresh poe2scout unique prices into item_values, at most once per day. Returns rows
 * written (0 if the cache is still fresh). Call before a balance scan so showcase items
 * get valued; the daily guard keeps it from hammering scout.
 */
export async function refreshUniqueValues(): Promise<number> {
  const age = itemValuesAgeHours();
  if (age != null && age < REFRESH_AFTER_H) return 0;

  const { items, rates } = await fetchScout();
  const rows = items
    .filter((i) => i.priceExalt > 0 && i.name)
    .map((i) => ({ nameKey: i.name.toLowerCase(), div: i.priceExalt / rates.exaltPerDivine, source: "scout" }));
  upsertItemValues(rows);
  return rows.length;
}
