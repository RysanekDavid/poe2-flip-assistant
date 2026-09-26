import { getDb } from "./database";

/** Persistence for the edge outcome loop (table cx_edge_outcomes, see cxMigrations.ts). */

export interface PublishedEdge {
  item: string;
  hour: number;
  buyQuote: string;
  sellQuote: string;
  edgePct: number;
}

export interface PendingOutcome {
  item: string;
  hour: number;
  buy_quote: string;
  sell_quote: string;
}

export type Outcome = "hit" | "miss";

/** Record published edges. Idempotent: the first publication of an item-hour wins. */
export function recordPublished(league: string, edges: readonly PublishedEdge[]): number {
  if (edges.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO cx_edge_outcomes (league, item, hour, buy_quote, sell_quote, edge_pct)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(league, item, hour) DO NOTHING`,
  );
  let added = 0;
  db.transaction(() => {
    for (const e of edges) added += stmt.run(league, e.item, e.hour, e.buyQuote, e.sellQuote, e.edgePct).changes;
  })();
  return added;
}

/** Published edges still waiting for their next hour. */
export function pendingOutcomes(league: string): PendingOutcome[] {
  return getDb()
    .prepare("SELECT item, hour, buy_quote, sell_quote FROM cx_edge_outcomes WHERE league = ? AND outcome IS NULL")
    .all(league) as PendingOutcome[];
}

export function resolveOutcome(league: string, item: string, hour: number, nextNetPct: number | null, outcome: Outcome): void {
  getDb()
    .prepare("UPDATE cx_edge_outcomes SET next_net_pct = ?, outcome = ? WHERE league = ? AND item = ? AND hour = ?")
    .run(nextNetPct, outcome, league, item, hour);
}

/** Resolved hits and total resolved for a league since `fromHour`. */
export function outcomeCounts(league: string, fromHour: number): { hits: number; resolved: number } {
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(outcome = 'hit'), 0) AS hits, COUNT(outcome) AS resolved
       FROM cx_edge_outcomes WHERE league = ? AND hour >= ?`,
    )
    .get(league, fromHour) as { hits: number; resolved: number };
  return row;
}
