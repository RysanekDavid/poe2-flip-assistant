import { MIN_VALUE_DIV } from "../../../lib/demandView";
import type { MarketUniqueItem } from "../../../lib/marketUniquesContract";

/** Pure list logic of the UNIQUES group (no React), so the node test can pin sort + filter rules. */

export { MIN_VALUE_DIV };

export const UNIQUE_SORT_KEYS = ["name", "value", "age", "listings", "change"] as const;
export type UniqueSortKey = (typeof UNIQUE_SORT_KEYS)[number];

export interface UniqueSort {
  key: UniqueSortKey;
  dir: "asc" | "desc";
}

export const DEFAULT_UNIQUE_SORT: UniqueSort = { key: "value", dir: "desc" };

export interface UniqueFilter {
  /** scout category id to show; ignored while `query` is set (search spans every unique category). */
  category: string;
  query: string;
  /** Only uniques worth at least MIN_VALUE_DIV — on by default, as on the Market board. */
  valuableOnly: boolean;
}

function sortValue(item: MarketUniqueItem, key: Exclude<UniqueSortKey, "name">): number | null {
  if (key === "value") return item.valueDiv;
  if (key === "listings") return item.listings;
  if (key === "change") return item.change7d;
  // age sorts by when the price was set: newest = "smallest age" ascending
  return item.priceAt === null ? null : -Date.parse(item.priceAt);
}

/** Unknown values sink to the bottom in BOTH directions: an unpriced unique never tops a sort. */
export function compareUniques(a: MarketUniqueItem, b: MarketUniqueItem, sort: UniqueSort): number {
  const sign = sort.dir === "asc" ? 1 : -1;
  if (sort.key === "name") return sign * a.name.localeCompare(b.name);
  const x = sortValue(a, sort.key);
  const y = sortValue(b, sort.key);
  if (x === null || y === null) return x === y ? a.name.localeCompare(b.name) : x === null ? 1 : -1;
  return x === y ? a.name.localeCompare(b.name) : sign * (x - y);
}

/** Name or base type, so "silk robe" finds Temporalis. */
export function matchesUnique(item: MarketUniqueItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || item.name.toLowerCase().includes(q) || item.base.toLowerCase().includes(q);
}

/** An unknown value fails "≥ 1 Div": the filter hides what it cannot vouch for. */
const passesValue = (i: MarketUniqueItem, valuableOnly: boolean): boolean => !valuableOnly || (i.valueDiv !== null && i.valueDiv >= MIN_VALUE_DIV);

export function visibleUniques(items: readonly MarketUniqueItem[], filter: UniqueFilter, sort: UniqueSort): MarketUniqueItem[] {
  const searching = filter.query.trim() !== "";
  return items
    .filter((i) => (searching ? matchesUnique(i, filter.query) : i.category === filter.category))
    .filter((i) => passesValue(i, filter.valuableOnly))
    .sort((a, b) => compareUniques(a, b, sort));
}

/**
 * Why the table is empty. Blames "≥ 1 Div" only when rows in scope (the category, or the search
 * matches) exist and the filter hid them all; a search that matches nothing says exactly that.
 */
export function emptyUniquesSentence(items: readonly MarketUniqueItem[], filter: UniqueFilter): string {
  const searching = filter.query.trim() !== "";
  const inScope = items.some((i) => (searching ? matchesUnique(i, filter.query) : i.category === filter.category));
  if (inScope && filter.valuableOnly) return `Nothing here is worth ${MIN_VALUE_DIV} Div or more — turn off "≥ ${MIN_VALUE_DIV} Div" to see the rest.`;
  if (searching) return "No unique matches your search.";
  return "poe2scout lists no uniques in this category yet.";
}

/** Rail counts under the value filter, so a count always equals the rows a click reveals. */
export function uniqueRailCounts(items: readonly MarketUniqueItem[], filter: Omit<UniqueFilter, "category">): { byCategory: Map<string, number>; matches: number } {
  const byCategory = new Map<string, number>();
  let matches = 0;
  for (const i of items) {
    if (!passesValue(i, filter.valuableOnly)) continue;
    byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + 1);
    if (filter.query.trim() !== "" && matchesUnique(i, filter.query)) matches += 1;
  }
  return { byCategory, matches };
}

export function nextUniqueSort(current: UniqueSort, key: UniqueSortKey): UniqueSort {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "name" || key === "age" ? "asc" : "desc" };
}

/** Why a 7-day change is missing: how many scout points the window held. */
export function changeGapReason(item: MarketUniqueItem): string {
  const n = item.spark7d.length;
  if (item.valueSource === null && n === 0) return "poe2scout has no price for it, so no trend either";
  if (n === 0) return "no poe2scout price point in the last 7 days — too thin for a trend";
  return `only ${n} poe2scout price point${n === 1 ? "" : "s"} in the last 7 days — too thin for a trend`;
}

/** The small source line under a value; trade-priced rows say so on the row, not just in a tooltip. */
export function valueSourceLabel(item: MarketUniqueItem): string | null {
  return item.valueSource === "trade" ? "trade listings" : null;
}
