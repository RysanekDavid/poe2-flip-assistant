import { z } from "zod";
import { getDb } from "./database";
import type { ScannedItem } from "../api/accountScan";

/**
 * Per-item rows behind a trade-read balance snapshot (balance_items, tools schema). Written next
 * to the per-tab rows by recordTradeBalance, read by the Liquidate tool's "import last stash read".
 *
 * Retention: balance_snapshots is never pruned, and a read stores up to 100 item rows. Only the
 * newest reads are ever imported, so item rows of older snapshots are dropped on each insert —
 * the snapshot and its per-tab rows (net-worth history) stay untouched.
 */
export const BALANCE_ITEMS_KEEP_SNAPSHOTS = 10;

const balanceItemRowSchema = z.object({
  tab: z.string().nullable(),
  item_name: z.string(),
  base_type: z.string().nullable(),
  rarity: z.string().nullable(),
  stack_size: z.number().int(),
  market_div: z.number().nullable(),
  market_source: z.string().nullable(),
  ask_amount: z.number().nullable(),
  ask_currency: z.string().nullable(),
});
export type BalanceItemRow = z.infer<typeof balanceItemRowSchema>;

const snapshotHeadSchema = z.object({
  id: z.number().int(),
  fetched_at: z.string(),
  source: z.string(),
  listed_seen: z.number().int().nullable(),
});
export type StashSnapshotHead = z.infer<typeof snapshotHeadSchema>;

/** Store one read's items, then trim item rows of this user+league's older snapshots. */
export function insertBalanceItems(snapshotId: number, items: readonly ScannedItem[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO balance_items (snapshot_id, tab, item_name, base_type, rarity, stack_size, market_div, market_source, ask_amount, ask_currency)
     VALUES (@snapshotId, @tab, @itemName, @baseType, @rarity, @stackSize, @marketDiv, @marketSource, @askAmount, @askCurrency)`,
  );
  // The trim keys on the snapshot's own owner and league, so it can never touch another user's rows.
  const trim = db.prepare(
    `DELETE FROM balance_items WHERE snapshot_id IN (
       SELECT old.id FROM balance_snapshots old
       JOIN balance_snapshots cur ON cur.id = @snapshotId
       WHERE old.user_id = cur.user_id AND old.league IS cur.league
         AND old.id NOT IN (
           SELECT keep.id FROM balance_snapshots keep
           WHERE keep.user_id = cur.user_id AND keep.league IS cur.league
           ORDER BY keep.fetched_at DESC, keep.id DESC LIMIT @keep))`,
  );
  db.transaction(() => {
    for (const i of items) {
      stmt.run({
        snapshotId,
        tab: i.tab,
        itemName: i.itemName,
        baseType: i.baseType || null,
        rarity: i.rarity,
        stackSize: Math.max(1, Math.round(i.stackSize)),
        marketDiv: i.marketDiv,
        marketSource: i.marketSource,
        askAmount: i.ask?.amount ?? null, // per unit, as the note lists it — never a stack total
        askCurrency: i.ask?.currency ?? null,
      });
    }
    trim.run({ snapshotId, keep: BALANCE_ITEMS_KEEP_SNAPSHOTS });
  })();
}

/**
 * The caller's newest TRADE-read snapshot in `league` (only trade reads carry item rows) and its
 * items. `snapshot` is null when the user never read their stash in this league.
 */
export function latestStashItems(userId: number, league: string): { snapshot: StashSnapshotHead | null; items: BalanceItemRow[] } {
  const db = getDb();
  const head = db
    .prepare(
      `SELECT id, fetched_at, source, listed_seen FROM balance_snapshots
       WHERE user_id = ? AND league = ? AND source = 'trade' ORDER BY fetched_at DESC, id DESC LIMIT 1`,
    )
    .get(userId, league);
  if (head === undefined) return { snapshot: null, items: [] };
  const snapshot = snapshotHeadSchema.parse(head);
  const rows = db
    .prepare(
      `SELECT tab, item_name, base_type, rarity, stack_size, market_div, market_source, ask_amount, ask_currency
       FROM balance_items WHERE snapshot_id = ? ORDER BY id`,
    )
    .all(snapshot.id);
  return { snapshot, items: z.array(balanceItemRowSchema).parse(rows) };
}
