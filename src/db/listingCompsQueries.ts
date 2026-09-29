import { z } from "zod";
import { getDb } from "./database";
import type { ListingComp } from "../lib/wealthContract";

/**
 * listing_comps (trade2 comparables of a user's own listings) and reprice_runs (the per-user
 * cooldown + last-run status). Written only by the poller's reprice drain; read by the Sell route.
 */
export const REPRICE_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const compRowSchema = z.object({
  listing_id: z.string(),
  item_name: z.string(),
  fair_div: z.number().nullable(),
  cheapest_div: z.number().nullable(),
  samples: z.number().int(),
  search_url: z.string().nullable(),
  checked_at: z.string(),
});

export interface StoredComp extends ListingComp {
  itemName: string;
}

export interface CompWrite {
  listingId: string;
  itemName: string;
  fairDiv: number | null;
  cheapestDiv: number | null;
  samples: number;
  searchUrl: string | null;
}

/** One check replaces the listing's previous comps — only the newest answer is ever shown. */
export function upsertListingComp(userId: number, league: string, c: CompWrite, at: Date = new Date()): void {
  getDb()
    .prepare(
      `INSERT INTO listing_comps (user_id, listing_id, league, item_name, fair_div, cheapest_div, samples, search_url, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, listing_id) DO UPDATE SET league = excluded.league, item_name = excluded.item_name,
         fair_div = excluded.fair_div, cheapest_div = excluded.cheapest_div, samples = excluded.samples,
         search_url = excluded.search_url, checked_at = excluded.checked_at`,
    )
    .run(userId, c.listingId, league, c.itemName, c.fairDiv, c.cheapestDiv, c.samples, c.searchUrl, at.toISOString());
}

export function listingComps(userId: number, league: string): StoredComp[] {
  const rows = getDb()
    .prepare(
      `SELECT listing_id, item_name, fair_div, cheapest_div, samples, search_url, checked_at
       FROM listing_comps WHERE user_id = ? AND league = ? ORDER BY checked_at DESC`,
    )
    .all(userId, league);
  return z
    .array(compRowSchema)
    .parse(rows)
    .map((r) => ({
      listingId: r.listing_id, itemName: r.item_name, fairDiv: r.fair_div, cheapestDiv: r.cheapest_div,
      samples: r.samples, searchUrl: r.search_url, checkedAt: r.checked_at,
    }));
}

/**
 * Drop comps of listings that are no longer in the user's latest read (sold, delisted) — they
 * would otherwise price an item name forever from a listing that is gone. Returns rows removed.
 */
export function pruneListingComps(userId: number, league: string, keepListingIds: readonly string[]): number {
  const db = getDb();
  const ids = db.prepare("SELECT listing_id FROM listing_comps WHERE user_id = ? AND league = ?").all(userId, league) as Array<{ listing_id: string }>;
  const keep = new Set(keepListingIds);
  const del = db.prepare("DELETE FROM listing_comps WHERE user_id = ? AND listing_id = ?");
  let removed = 0;
  db.transaction(() => {
    for (const { listing_id } of ids) {
      if (!keep.has(listing_id)) removed += del.run(userId, listing_id).changes;
    }
  })();
  return removed;
}

const runSchema = z.object({
  requested_at: z.string(),
  finished_at: z.string().nullable(),
  checked: z.number().int(),
  searches: z.number().int(),
  error: z.string().nullable(),
});
export type RepriceRun = z.infer<typeof runSchema>;

export function getRepriceRun(userId: number): RepriceRun | null {
  const row = getDb().prepare("SELECT requested_at, finished_at, checked, searches, error FROM reprice_runs WHERE user_id = ?").get(userId);
  return row === undefined ? null : runSchema.parse(row);
}

/**
 * When the next check may be requested, or null if now. A run that failed before spending a
 * single search (budget busy, no candidates' search reached trade2) does not hold the cooldown.
 */
export function repriceNextAt(run: RepriceRun | null, nowMs: number): Date | null {
  if (run == null) return null;
  if (run.finished_at != null && run.error != null && run.searches === 0) return null;
  const next = Date.parse(run.requested_at) + REPRICE_COOLDOWN_MS;
  if (!Number.isFinite(next)) throw new Error(`reprice_runs.requested_at unparseable: ${run.requested_at}`);
  return next > nowMs ? new Date(next) : null;
}

/** Start a run: stamps the cooldown and clears the previous outcome. */
export function markRepriceRequested(userId: number, at: Date): void {
  getDb()
    .prepare(
      `INSERT INTO reprice_runs (user_id, requested_at, finished_at, checked, searches, error) VALUES (?, ?, NULL, 0, 0, NULL)
       ON CONFLICT(user_id) DO UPDATE SET requested_at = excluded.requested_at, finished_at = NULL, checked = 0, searches = 0, error = NULL`,
    )
    .run(userId, at.toISOString());
}

export function finishRepriceRun(userId: number, r: { checked: number; searches: number; error: string | null }, at: Date = new Date()): void {
  const res = getDb()
    .prepare("UPDATE reprice_runs SET finished_at = ?, checked = ?, searches = ?, error = ? WHERE user_id = ?")
    .run(at.toISOString(), r.checked, r.searches, r.error == null ? null : r.error.slice(0, 300), userId);
  if (res.changes !== 1) throw new Error(`finishRepriceRun: no reprice run for user ${userId}`);
}
