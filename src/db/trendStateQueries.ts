import { getDb } from "./database";

/** Last recorded trend-alert state of one item in one league, or null if never recorded. */
export function getTrendState(league: string, itemId: string): string | null {
  const row = getDb()
    .prepare("SELECT state FROM trend_state WHERE league = ? AND item_id = ?")
    .get(league, itemId) as { state: string } | undefined;
  return row?.state ?? null;
}

/** Record an item's current trend-alert state (idempotent). */
export function setTrendState(league: string, itemId: string, state: string): void {
  getDb()
    .prepare(
      `INSERT INTO trend_state (league, item_id, state) VALUES (?, ?, ?)
       ON CONFLICT(league, item_id) DO UPDATE SET state = excluded.state, updated_at = CURRENT_TIMESTAMP`,
    )
    .run(league, itemId, state);
}
