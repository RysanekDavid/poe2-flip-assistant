import type { MarketPriceItem } from "../../../lib/marketPricesContract";

/** Pure list logic of Market › Prices (no React), so the node test can pin sort + filter rules. */

export const PRICE_SORT_KEYS = ["name", "value", "change", "volume"] as const;
export type PriceSortKey = (typeof PRICE_SORT_KEYS)[number];
export type PriceSortDir = "asc" | "desc";

export interface PriceSort {
  key: PriceSortKey;
  dir: PriceSortDir;
}

export const DEFAULT_PRICE_SORT: PriceSort = { key: "value", dir: "desc" };

/** |7d| at or above this is a "mover". */
export const MOVER_PCT = 20;
/** Units per hour at or above this is "liquid"; below 1/h reads as thin. */
export const LIQUID_PER_HOUR = 10;
export const THIN_PER_HOUR = 1;

export interface PriceFilter {
  /** Category type to show; ignored while `query` is set (search spans every category). */
  category: string;
  query: string;
  movers: boolean;
  liquid: boolean;
}

function sortValue(item: MarketPriceItem, key: Exclude<PriceSortKey, "name">): number | null {
  if (key === "value") return item.valueDiv;
  if (key === "change") return item.change7d;
  return item.volumePerHour;
}

/** Unknown values sink to the bottom in BOTH directions: an unpriced row never tops a sort. */
export function comparePrices(a: MarketPriceItem, b: MarketPriceItem, sort: PriceSort): number {
  const sign = sort.dir === "asc" ? 1 : -1;
  if (sort.key === "name") return sign * a.name.localeCompare(b.name);
  const x = sortValue(a, sort.key);
  const y = sortValue(b, sort.key);
  if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
  return x === y ? a.name.localeCompare(b.name) : sign * (x - y);
}

export function matchesQuery(item: MarketPriceItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || item.name.toLowerCase().includes(q);
}

type ChipFilter = Pick<PriceFilter, "movers" | "liquid">;

function passesChips(i: MarketPriceItem, chips: ChipFilter): boolean {
  if (chips.movers && (i.change7d === null || Math.abs(i.change7d) < MOVER_PCT)) return false;
  return !chips.liquid || (i.volumePerHour !== null && i.volumePerHour >= LIQUID_PER_HOUR);
}

export function visibleItems(items: readonly MarketPriceItem[], filter: PriceFilter, sort: PriceSort): MarketPriceItem[] {
  const searching = filter.query.trim() !== "";
  return items
    .filter((i) => (searching ? matchesQuery(i, filter.query) : i.category === filter.category))
    .filter((i) => passesChips(i, filter))
    .sort((a, b) => comparePrices(a, b, sort));
}

/**
 * What the rail shows under the active chips, so a count always equals the rows a click reveals:
 * per category (a click clears the search) and the "All" search row (query + chips).
 */
export function railCounts(items: readonly MarketPriceItem[], filter: Omit<PriceFilter, "category">): { byCategory: Map<string, number>; matches: number } {
  const byCategory = new Map<string, number>();
  let matches = 0;
  for (const i of items) {
    if (!passesChips(i, filter)) continue;
    byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + 1);
    if (filter.query.trim() !== "" && matchesQuery(i, filter.query)) matches += 1;
  }
  return { byCategory, matches };
}

/** Clicking the active column flips it; a new column starts where its data is most useful. */
export function nextSort(current: PriceSort, key: PriceSortKey): PriceSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "name" ? "asc" : "desc" };
}

/** "+12%", "−3.4%"; one decimal only under 10% so a flat item never reads as "+0%". */
export function fmtChange(pct: number): string {
  const digits = Math.abs(pct) >= 10 ? 0 : 1;
  const text = Math.abs(pct).toLocaleString("en", { maximumFractionDigits: digits });
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${text}%`;
}

export function changeTone(pct: number | null): string {
  if (pct === null || Math.abs(pct) < 1) return "text-neutral-500";
  return pct > 0 ? "text-good" : "text-bad";
}
