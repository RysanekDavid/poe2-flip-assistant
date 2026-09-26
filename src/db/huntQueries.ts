import { getDb } from "./database";

/** Hunts (saved live-search criteria), their hits, scanner runtime health and the autosnipe report. */

export type HuntMode = "SNIPE" | "CRAFT_BASE" | "RESELL";

export interface Hunt {
  id: number;
  user_id: number;
  label: string;
  mode: HuntMode;
  item_name: string | null;
  base_type: string | null;
  category: string | null; // trade2 category (e.g. "weapon.bow") when no single base type applies
  ilvl_min: number | null;
  rarity: string | null;
  stats_json: string | null;
  max_amount: number | null;
  max_ccy: string | null;
  target_div: number | null;
  active: number;
  last_scan_at: string | null;
  last_hit_at: string | null;
  last_error: string | null; // why the last scan of THIS hunt failed; null after a clean scan
  created_at: string;
}

export type HuntFields = Omit<
  Hunt,
  "id" | "user_id" | "active" | "last_scan_at" | "last_hit_at" | "last_error" | "created_at"
>;

/** All active hunts across every user — for the server/agent scanner. */
export function getHunts(activeOnly = false): Hunt[] {
  const sql = activeOnly
    ? "SELECT * FROM hunts WHERE active = 1 ORDER BY created_at DESC"
    : "SELECT * FROM hunts ORDER BY created_at DESC";
  return getDb().prepare(sql).all() as Hunt[];
}

/** One user's hunts — for the UI/routes. */
export function getHuntsForUser(userId: number, activeOnly = false): Hunt[] {
  const sql = activeOnly
    ? "SELECT * FROM hunts WHERE user_id = ? AND active = 1 ORDER BY created_at DESC"
    : "SELECT * FROM hunts WHERE user_id = ? ORDER BY created_at DESC";
  return getDb().prepare(sql).all(userId) as Hunt[];
}

export function addHunt(userId: number, league: string, h: HuntFields): number {
  const info = getDb()
    .prepare(
      `INSERT INTO hunts (user_id, league, label, mode, item_name, base_type, category, ilvl_min, rarity, stats_json, max_amount, max_ccy, target_div)
       VALUES (@userId, @league, @label, @mode, @item_name, @base_type, @category, @ilvl_min, @rarity, @stats_json, @max_amount, @max_ccy, @target_div)`,
    )
    .run({ ...h, userId, league });
  return Number(info.lastInsertRowid);
}

export function setHuntActive(userId: number, id: number, active: boolean): void {
  getDb().prepare("UPDATE hunts SET active = ? WHERE user_id = ? AND id = ?").run(active ? 1 : 0, userId, id);
}

/** Edit a hunt's criteria in place. Only columns present in `h` are written (null = clear). */
export function updateHunt(userId: number, id: number, h: Partial<HuntFields>): void {
  const cols = ["label", "mode", "item_name", "base_type", "category", "ilvl_min", "rarity", "stats_json", "max_amount", "max_ccy", "target_div"] as const;
  const sets: string[] = [];
  const vals: Record<string, unknown> = { id, userId };
  for (const c of cols) {
    if (c in h) {
      sets.push(`${c} = @${c}`);
      vals[c] = h[c] ?? null;
    }
  }
  if (sets.length === 0) return;
  // an edited hunt gets a clean slate — the old error described the old criteria
  getDb().prepare(`UPDATE hunts SET ${sets.join(", ")}, last_error = NULL WHERE user_id = @userId AND id = @id`).run(vals);
}

export function deleteHunt(userId: number, id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM hunt_hits WHERE user_id = ? AND hunt_id = ?").run(userId, id);
  db.prepare("DELETE FROM hunts WHERE user_id = ? AND id = ?").run(userId, id);
}

/**
 * Stamp a scan attempt. A FAILED scan is stamped too, with its error — otherwise a malformed hunt
 * failed forever while its last_scan_at froze, and the UI could not tell "idle" from "broken".
 */
export function touchHuntScan(id: number, hadHit: boolean, error: string | null = null): void {
  getDb()
    .prepare(
      `UPDATE hunts SET last_scan_at = CURRENT_TIMESTAMP, last_error = ?${hadHit ? ", last_hit_at = CURRENT_TIMESTAMP" : ""} WHERE id = ?`,
    )
    .run(error, id);
}

export interface HuntHit {
  id: number;
  user_id: number;
  hunt_id: number;
  item_name: string;
  base_type: string | null;
  price_amount: number;
  price_ccy: string;
  price_div: number | null; // null = ask in a currency outside the rates ladder (never a fake 0)
  margin_pct: number | null;
  account: string | null;
  whisper: string | null;
  listing_id: string | null;
  seller_online: number | null;
  listed_at: string | null;
  sig: string;
  seen: number;
  found_at: string;
}

/** True if an identical listing was already recorded recently for this user — avoids re-alerting. */
export function recentHitSig(userId: number, sig: string, minutes: number): boolean {
  const row = getDb()
    .prepare(`SELECT 1 FROM hunt_hits WHERE user_id = ? AND sig = ? AND found_at >= datetime('now', ?) LIMIT 1`)
    .get(userId, sig, `-${minutes} minutes`);
  return row != null;
}

/** True if this user already recorded this exact trade listing — the primary live-search dedupe. */
export function recentHitByListing(userId: number, listingId: string): boolean {
  if (!listingId) return false;
  const row = getDb()
    .prepare(`SELECT 1 FROM hunt_hits WHERE user_id = ? AND listing_id = ? LIMIT 1`)
    .get(userId, listingId);
  return row != null;
}

export function insertHit(userId: number, h: Omit<HuntHit, "id" | "user_id" | "seen" | "found_at">): void {
  getDb()
    .prepare(
      `INSERT INTO hunt_hits (user_id, hunt_id, item_name, base_type, price_amount, price_ccy, price_div, margin_pct, account, whisper, listing_id, seller_online, listed_at, sig)
       VALUES (@userId, @hunt_id, @item_name, @base_type, @price_amount, @price_ccy, @price_div, @margin_pct, @account, @whisper, @listing_id, @seller_online, @listed_at, @sig)`,
    )
    .run({ ...h, userId });
}

export function getHits(userId: number, limit = 100): HuntHit[] {
  return getDb()
    .prepare("SELECT * FROM hunt_hits WHERE user_id = ? ORDER BY found_at DESC LIMIT ?")
    .all(userId, limit) as HuntHit[];
}

export function markHitsSeen(userId: number, ids: number[]): void {
  if (ids.length === 0) return;
  const ph = ids.map(() => "?").join(",");
  getDb().prepare(`UPDATE hunt_hits SET seen = 1 WHERE user_id = ? AND id IN (${ph})`).run(userId, ...ids);
}

export interface HuntRuntime {
  connections: number;
  last_event_at: string | null;
  last_error: string | null;
  updated_at: string | null;
}

export function getRuntime(): HuntRuntime {
  const row = getDb().prepare("SELECT connections, last_event_at, last_error, updated_at FROM hunt_runtime WHERE id = 1").get() as
    | HuntRuntime
    | undefined;
  return row ?? { connections: 0, last_event_at: null, last_error: null, updated_at: null };
}

export function setRuntime(connections: number, lastError: string | null, bumpEvent = false): void {
  getDb()
    .prepare(
      `INSERT INTO hunt_runtime (id, connections, last_error, last_event_at, updated_at)
       VALUES (1, @connections, @lastError, ${bumpEvent ? "CURRENT_TIMESTAMP" : "NULL"}, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         connections = excluded.connections,
         last_error = excluded.last_error,
         ${bumpEvent ? "last_event_at = CURRENT_TIMESTAMP," : ""}
         updated_at = CURRENT_TIMESTAMP`,
    )
    .run({ connections, lastError });
}

// --- auto-snipe scan report (cross-process: poller writes, web UI reads) ---

export function saveSnipeReport(reportJson: string): void {
  getDb()
    .prepare(
      `INSERT INTO autosnipe_report (id, report_json, scanned_at) VALUES (1, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET report_json = excluded.report_json, scanned_at = CURRENT_TIMESTAMP`,
    )
    .run(reportJson);
}

export function getSnipeReport(): { report_json: string; scanned_at: string } | null {
  const row = getDb().prepare("SELECT report_json, scanned_at FROM autosnipe_report WHERE id = 1").get() as
    | { report_json: string; scanned_at: string }
    | undefined;
  return row ?? null;
}
