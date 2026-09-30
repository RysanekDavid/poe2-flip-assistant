import type { DemandRow } from "./demandContract";

/*
 * Market › board "Unique demand" filters and sort, kept pure so the default view is testable
 * without rendering the panel.
 */

export type SortKey = "name" | "marketDivine" | "quantity" | "listedAvg" | "sellThrough" | "momentumPct" | "heat";
export type SortDir = "asc" | "desc";

/** "Worth talking about": most scout uniques are vendor-tier, so the default view starts here. */
export const MIN_VALUE_DIV = 1;

export interface DemandFilters {
  q: string;
  cat: string;
  /** Hide rows with too few listings or too short a log. Rows with NO log are not thin. */
  trustedOnly: boolean;
  /** Only rows worth at least MIN_VALUE_DIV. */
  valuableOnly: boolean;
  budget: string; // Divine on hand — filter to affordable
}

export const DEFAULT_FILTERS: DemandFilters = { q: "", cat: "", trustedOnly: true, valuableOnly: true, budget: "" };
export const DEFAULT_SORT: { key: SortKey; dir: SortDir } = { key: "marketDivine", dir: "desc" };

export function applyFilters(rows: readonly DemandRow[], f: DemandFilters): DemandRow[] {
  const query = f.q.trim().toLowerCase();
  const bud = Number(f.budget) || 0;
  return rows.filter((r) => {
    if (f.trustedOnly && r.trust === "thin") return false;
    if (f.valuableOnly && r.marketDivine < MIN_VALUE_DIV) return false;
    if (f.cat && r.category !== f.cat) return false;
    if (bud > 0 && r.marketDivine > bud) return false; // only what your budget affords
    if (query && !r.name.toLowerCase().includes(query) && !r.type.toLowerCase().includes(query)) return false;
    return true;
  });
}

/** Unknown (null) figures sort last in both directions: an unknown is not the smallest value. */
export function compareRows(a: DemandRow, b: DemandRow, key: SortKey, dir: SortDir): number {
  if (key === "name") {
    const d = a.name.localeCompare(b.name);
    return dir === "asc" ? d : -d;
  }
  const av = a[key];
  const bv = b[key];
  if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1;
  return dir === "asc" ? av - bv : bv - av;
}

export function sortRows(rows: readonly DemandRow[], key: SortKey, dir: SortDir): DemandRow[] {
  return [...rows].sort((a, b) => compareRows(a, b, key, dir));
}

/** A typed search, a budget or a picked category — the two default toggles are not "typed". */
export const hasTypedFilter = (f: DemandFilters): boolean => f.q.trim() !== "" || f.budget.trim() !== "" || f.cat !== "";
