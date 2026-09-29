import { z } from "zod";
import { getDb } from "./database";
import type { ScannedItem, ScannedRare } from "../api/accountScan";

/**
 * Per-item rows behind a trade-read balance snapshot (balance_items, tools schema). Written next
 * to the per-tab rows by recordTradeBalance, read by the Wealth Sell column (latest read), its
 * sold-since-last-read line (the read before it) and the reprice scan (a rare's stored rolls).
 *
 * Retention: balance_snapshots is never pruned, and a read stores up to 100 item rows. Only the
 * newest reads are ever read back, so item rows of older snapshots are dropped on each insert —
 * the snapshot and its per-tab rows (net-worth history) stay untouched.
 */
export const BALANCE_ITEMS_KEEP_SNAPSHOTS = 10;

const modMarkerSchema = z.enum(["implicit", "rune", "enchant", "crafted", "fractured", "desecrated", "explicit"]);

/** item_json: a rare's rolls exactly as ScannedRare carries them. */
export const storedRareSchema = z.object({
  itemLevel: z.number().int().nullable(),
  corrupted: z.boolean(),
  mirrored: z.boolean(),
  modLines: z.array(
    z.object({ text: z.string(), marker: modMarkerSchema, statId: z.string().nullable(), desecrated: z.boolean() }),
  ),
});

const rareFromJson = z
  .string()
  .nullable()
  .transform((s, ctx): ScannedRare | null => {
    if (s == null) return null;
    const parsed = storedRareSchema.safeParse(JSON.parse(s));
    if (parsed.success) return parsed.data;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `item_json: ${parsed.error.message}` });
    return z.NEVER;
  });

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
  /** NULL on rows stored before listing identity was captured. */
  listing_id: z.string().nullable(),
  indexed_at: z.string().nullable(),
  item_json: rareFromJson,
});
export type BalanceItemRow = z.infer<typeof balanceItemRowSchema>;

const snapshotHeadSchema = z.object({
  id: z.number().int(),
  fetched_at: z.string(),
  source: z.string(),
  listed_seen: z.number().int().nullable(),
  listed_total: z.number().int().nullable(),
});
export type StashSnapshotHead = z.infer<typeof snapshotHeadSchema>;

export interface StashRead {
  snapshot: StashSnapshotHead;
  items: BalanceItemRow[];
}

/** Store one read's items, then trim item rows of this user+league's older snapshots. */
export function insertBalanceItems(snapshotId: number, items: readonly ScannedItem[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO balance_items (snapshot_id, tab, item_name, base_type, rarity, stack_size, market_div, market_source,
       ask_amount, ask_currency, listing_id, indexed_at, item_json)
     VALUES (@snapshotId, @tab, @itemName, @baseType, @rarity, @stackSize, @marketDiv, @marketSource,
       @askAmount, @askCurrency, @listingId, @indexedAt, @itemJson)`,
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
        listingId: i.listingId || null, // the parser yields "" for an entry without an id — unknown, not an id
        indexedAt: i.indexed,
        itemJson: i.rare == null ? null : JSON.stringify(i.rare),
      });
    }
    trim.run({ snapshotId, keep: BALANCE_ITEMS_KEEP_SNAPSHOTS });
  })();
}

/**
 * The caller's newest `count` TRADE-read snapshots in `league` (only trade reads carry item rows),
 * newest first, each with its items.
 */
export function recentStashReads(userId: number, league: string, count: number): StashRead[] {
  const db = getDb();
  const heads = db
    .prepare(
      `SELECT id, fetched_at, source, listed_seen, listed_total FROM balance_snapshots
       WHERE user_id = ? AND league = ? AND source = 'trade' ORDER BY fetched_at DESC, id DESC LIMIT ?`,
    )
    .all(userId, league, count);
  const items = db.prepare(
    `SELECT tab, item_name, base_type, rarity, stack_size, market_div, market_source, ask_amount, ask_currency,
       listing_id, indexed_at, item_json
     FROM balance_items WHERE snapshot_id = ? ORDER BY id`,
  );
  return z
    .array(snapshotHeadSchema)
    .parse(heads)
    .map((snapshot) => ({ snapshot, items: z.array(balanceItemRowSchema).parse(items.all(snapshot.id)) }));
}

/** The newest trade read and its items; `snapshot` is null when the user never read this league. */
export function latestStashItems(userId: number, league: string): { snapshot: StashSnapshotHead | null; items: BalanceItemRow[] } {
  const [latest] = recentStashReads(userId, league, 1);
  return latest ?? { snapshot: null, items: [] };
}
