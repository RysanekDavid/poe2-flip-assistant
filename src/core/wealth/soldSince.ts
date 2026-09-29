/**
 * Own listings that were in the previous stash read and are gone from the latest one. Pure.
 *
 * "Gone" is sold OR delisted OR moved to a private tab — trade2 cannot tell them apart, so the UI
 * says so. Two guards keep it from over-counting:
 *  - a relist (price edit, tab move) can change the listing id, so per item name no more listings
 *    count as gone than the name's listing count actually dropped;
 *  - a truncated latest read (trade2 caps a search at 100 ids, most expensive first) did not see
 *    its cheapest listings, so a previous listing at or under the cheapest ask it did see is not
 *    evidence of anything.
 * Rows stored before listing ids were captured (listingId null) are ignored.
 */
export interface ReadListing {
  listingId: string | null;
  name: string;
  /** Your ask for the whole listing (unit ask × stack), Div; null when not ladder-priced. */
  askDiv: number | null;
}

export interface SoldSinceResult {
  count: number;
  /** Σ asks of the gone listings; null when none of them had one (unknown, not 0). */
  askDiv: number | null;
  names: string[];
}

const countByName = (rows: readonly ReadListing[]): Map<string, number> => {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.name.toLowerCase(), (m.get(r.name.toLowerCase()) ?? 0) + 1);
  return m;
};

function truncationFloor(current: readonly ReadListing[], truncated: boolean): number | null {
  if (!truncated) return null;
  const asks = current.map((r) => r.askDiv).filter((a): a is number => a != null);
  // truncated with no priced listing seen: nothing previous can be told apart from "not read"
  return asks.length > 0 ? Math.min(...asks) : Number.POSITIVE_INFINITY;
}

/** Null when the previous read carried no listing ids — there is nothing to compare. */
export function soldSince(
  previous: readonly ReadListing[],
  current: readonly ReadListing[],
  currentTruncated: boolean,
): SoldSinceResult | null {
  const prev = previous.filter((r) => r.listingId != null);
  if (prev.length === 0) return null;
  const nowIds = new Set(current.map((r) => r.listingId).filter((id): id is string => id != null));
  const floor = truncationFloor(current, currentTruncated);
  const budget = countByName(prev);
  for (const [name, n] of countByName(current)) budget.set(name, (budget.get(name) ?? 0) - n);

  const gone: ReadListing[] = [];
  for (const r of prev) {
    if (nowIds.has(r.listingId ?? "")) continue;
    if (floor != null && (r.askDiv == null || r.askDiv <= floor)) continue;
    const key = r.name.toLowerCase();
    const left = budget.get(key) ?? 0;
    if (left <= 0) continue;
    budget.set(key, left - 1);
    gone.push(r);
  }
  const asks = gone.map((r) => r.askDiv).filter((a): a is number => a != null);
  return {
    count: gone.length,
    askDiv: asks.length > 0 ? asks.reduce((s, a) => s + a, 0) : null,
    names: gone.map((r) => r.name),
  };
}
