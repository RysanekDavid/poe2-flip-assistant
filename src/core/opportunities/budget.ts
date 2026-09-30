import type { Budget } from "../../lib/opportunitiesContract";

/**
 * The Opportunities budget is automatic: a share of the viewer's latest net worth, so a
 * recommendation never costs more than a player can sensibly put into one buy. There is no manual
 * setting; with no net worth on record there is no cap, and the tool says why.
 */
export const BUDGET_SHARE_OF_NET_WORTH = 0.1;

/** Budget from the latest net-worth snapshot (null = never read). A non-positive total is no net worth. */
export function budgetFromNetWorth(latest: { netWorthDiv: number; at: string } | null, share: number = BUDGET_SHARE_OF_NET_WORTH): Budget {
  if (!(share > 0 && share <= 1)) throw new Error(`budget: share of net worth must be in (0, 1], got ${share}`);
  const sharePct = share * 100;
  if (latest == null || !Number.isFinite(latest.netWorthDiv) || latest.netWorthDiv <= 0) {
    return { netWorthDiv: null, netWorthAt: null, capDiv: null, sharePct };
  }
  return { netWorthDiv: latest.netWorthDiv, netWorthAt: latest.at, capDiv: latest.netWorthDiv * share, sharePct };
}

/** Rows priced at or under the cap, and how many were hidden. No cap keeps everything. */
export function withinBudget<T>(rows: readonly T[], priceDiv: (row: T) => number, budget: Budget): { kept: T[]; hidden: number } {
  const cap = budget.capDiv;
  if (cap == null) return { kept: [...rows], hidden: 0 };
  const kept = rows.filter((r) => priceDiv(r) <= cap);
  return { kept, hidden: rows.length - kept.length };
}
