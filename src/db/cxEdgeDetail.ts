import type Database from "better-sqlite3";

/**
 * Rank-gate detail stored beside each published edge in cx_edge_outcomes.
 *
 * The Coach service (Python, read-only SQLite) answers "what flips now" from the published-edge
 * log. Persistence and slower-leg flow are computed from 24h of raw digest rows by the TS model;
 * storing the values the gate actually saw lets the Coach quote them instead of re-implementing
 * the whole exchange model in a second language. Nullable: rows published before this migration
 * have no detail, and readers must say so rather than guess.
 */
const DETAIL_COLUMNS: ReadonlyArray<readonly [string, string]> = [
  ["persistence6", "INTEGER"], // hours of the last 6 the edge held at ≥ the threshold
  ["slower_div_per_hour", "REAL"], // the rank gate's liquidity: slower leg's Div/h over 6h
  ["net_div_per_unit", "REAL"], // 6h median net profit per item unit, after priced fees
  ["buy_price", "REAL"], // last valid hour's buy leg, in buy_quote units per item
  ["sell_price", "REAL"], // last valid hour's sell leg, in sell_quote units per item
  ["fee_complete", "INTEGER"], // 0 when the item's own gold fee was unknown
];

/** Additive, idempotent: CREATE TABLE IF NOT EXISTS never adds columns to an existing table. */
export function ensureCxEdgeDetailColumns(conn: Database.Database): void {
  const existing = new Set(
    (conn.prepare("PRAGMA table_info(cx_edge_outcomes)").all() as Array<{ name: string }>).map((r) => r.name),
  );
  for (const [name, type] of DETAIL_COLUMNS) {
    if (!existing.has(name)) conn.exec(`ALTER TABLE cx_edge_outcomes ADD COLUMN ${name} ${type}`);
  }
}

/** What the rank gate saw for one published edge (see core/cx/cxPersistence). */
export interface PublishedEdgeDetail {
  persistence6: number;
  slowerDivPerHour: number;
  netDivPerUnit: number;
  buyPrice: number;
  sellPrice: number;
  feeComplete: boolean;
}
