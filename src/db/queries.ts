import { getDb } from "./database";

/**
 * Per-user application persistence (alerts, trades, flips, positions, holdings, hunts,
 * balances). Market tables moved to marketQueries.ts when they became league-scoped; the
 * watchlist moved to watchlistQueries.ts when the poller started filtering it by league.
 *
 * These tables CARRY the league a row was created under, and the CALLER passes it: provenance
 * has to name the economy the producing pipeline actually ran in, which for a user action is
 * their view but for the shared trade2 pipelines (hunts, autosnipe, balances) is the app
 * default. Resolving it in here would have quietly relabelled every one of those.
 *
 * It is written at INSERT time rather than backfilled later, because after a switch there is no
 * way to recover which market an untagged row belonged to.
 */

export interface AlertRow {
  id: number;
  type: string;
  item_id: string;
  item_name: string | null;
  message: string;
  value: number | null;
  threshold: number | null;
  whisper: string | null;
  link: string | null;
  seen: number;
  created_at: string;
}

export interface TradeRow {
  id: number;
  item_id: string;
  item_name: string;
  side: "BUY" | "SELL";
  currency: "CHAOS" | "EXALT" | "DIVINE";
  rate: number;
  quantity: number;
  total_currency: number;
  profit_chaos: number | null;
  traded_at: string;
  notes: string | null;
}

export function insertAlert(
  userId: number,
  league: string,
  a: {
    type: string;
    itemId: string;
    itemName: string;
    message: string;
    value: number;
    threshold: number;
    whisper?: string | null;
    link?: string | null;
  },
): void {
  getDb()
    .prepare(
      `INSERT INTO alerts (user_id, league, type, item_id, item_name, message, value, threshold, whisper, link)
       VALUES (@userId, @league, @type, @itemId, @itemName, @message, @value, @threshold, @whisper, @link)`,
    )
    .run({ ...a, whisper: a.whisper ?? null, link: a.link ?? null, userId, league });
}

/** True if an alert for this user's item+type fired within the last `minutes` — throttles repeats. */
export function hasRecentAlert(userId: number, itemId: string, type: string, minutes: number): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 FROM alerts WHERE user_id = ? AND item_id = ? AND type = ? AND created_at >= datetime('now', ?) LIMIT 1`,
    )
    .get(userId, itemId, type, `-${minutes} minutes`);
  return row != null;
}

export function getAlerts(userId: number, unseenOnly = false, limit = 100): AlertRow[] {
  const sql = unseenOnly
    ? "SELECT * FROM alerts WHERE user_id = ? AND seen = 0 ORDER BY created_at DESC LIMIT ?"
    : "SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?";
  return getDb().prepare(sql).all(userId, limit) as AlertRow[];
}

/** Mark alerts seen — scoped to the user so one account can't touch another's feed. */
export function markAlertsSeen(userId: number, ids: number[]): void {
  if (ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(",");
  getDb()
    .prepare(`UPDATE alerts SET seen = 1 WHERE user_id = ? AND id IN (${placeholders})`)
    .run(userId, ...ids);
}

export interface FlipRow {
  id: number;
  user_id: number;
  item_id: string;
  item_name: string;
  qty: number;
  buy_price: number;
  buy_ccy: string;
  sell_price: number;
  sell_ccy: string;
  profit_div: number;
  profit_chaos: number;
  notes: string | null;
  created_at: string;
}

export function insertFlip(
  userId: number,
  league: string,
  f: Omit<FlipRow, "id" | "user_id" | "created_at">,
): number {
  const info = getDb()
    .prepare(
      `INSERT INTO flips (user_id, league, item_id, item_name, qty, buy_price, buy_ccy, sell_price, sell_ccy, profit_div, profit_chaos, notes)
       VALUES (@userId, @league, @item_id, @item_name, @qty, @buy_price, @buy_ccy, @sell_price, @sell_ccy, @profit_div, @profit_chaos, @notes)`,
    )
    .run({ ...f, userId, league });
  return Number(info.lastInsertRowid);
}

/** This user's realized flips IN ONE LEAGUE. A flip belongs to the economy it was made in. */
export function getFlips(userId: number, league: string, limit = 200): FlipRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM flips WHERE user_id = ? AND league = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT ?",
    )
    .all(userId, league, limit) as FlipRow[];
}

export interface PnlPoint { t: string; cum: number; }
export interface PnlSummary {
  points: PnlPoint[]; // cumulative realized profit (Div) over time, oldest → newest
  total: number; // all-time realized profit in Div
  last7d: number;
  last24h: number;
  count: number;
}

/** Realized profit-and-loss from logged flips — the frictionless "wealth growth" curve.
 *  No stash read needed: every flip you log feeds it. Currency-base = Divine.
 *
 *  Scoped to ONE league: a Divine is not the same amount of wealth in two economies, so summing
 *  across them produces a number that describes nothing. A new league starts from zero. */
export function realizedPnl(userId: number, league: string): PnlSummary {
  const db = getDb();
  const flips = db
    .prepare(
      "SELECT created_at, profit_div FROM flips WHERE user_id = ? AND league = ? COLLATE NOCASE ORDER BY created_at ASC",
    )
    .all(userId, league) as Array<{ created_at: string; profit_div: number }>;
  let cum = 0;
  const points: PnlPoint[] = flips.map((f) => {
    cum += f.profit_div;
    return { t: f.created_at, cum };
  });
  const windowed = (expr: string): number =>
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(profit_div), 0) s FROM flips
           WHERE user_id = ? AND league = ? COLLATE NOCASE AND created_at >= datetime('now', ?)`,
        )
        .get(userId, league, expr) as { s: number }
    ).s;
  return { points, total: cum, last7d: windowed("-7 days"), last24h: windowed("-1 day"), count: flips.length };
}

export function deleteFlip(userId: number, id: number): void {
  getDb().prepare("DELETE FROM flips WHERE user_id = ? AND id = ?").run(userId, id);
}

// --- open positions (the BUY-now, SELL-later flip loop) ---

export interface PositionRow {
  id: number;
  user_id: number;
  /** The market this position was opened in — it is priced and closed against THIS league. */
  league: string | null;
  item_id: string;
  item_name: string;
  qty: number;
  buy_price: number;
  buy_ccy: string;
  buy_div_unit: number; // per-unit Div cost basis at open
  opened_at: string;
  notes: string | null;
}

export function insertPosition(
  userId: number,
  league: string,
  p: Omit<PositionRow, "id" | "user_id" | "league" | "opened_at">,
): PositionRow {
  const info = getDb()
    .prepare(
      `INSERT INTO positions (user_id, league, item_id, item_name, qty, buy_price, buy_ccy, buy_div_unit, notes)
       VALUES (@userId, @league, @item_id, @item_name, @qty, @buy_price, @buy_ccy, @buy_div_unit, @notes)`,
    )
    .run({ ...p, userId, league, notes: p.notes ?? null });
  return getDb().prepare("SELECT * FROM positions WHERE id = ?").get(Number(info.lastInsertRowid)) as PositionRow;
}

/**
 * This user's open positions IN ONE LEAGUE.
 *
 * A position is a commitment in one economy: its cost basis is Divine THERE, and marking it
 * against another league's mids would invent a profit. Filtering on read means the marks can
 * only ever come from the position's own market. Nothing is lost — switching back shows them.
 */
export function getOpenPositions(userId: number, league: string): PositionRow[] {
  return getDb()
    .prepare(
      "SELECT * FROM positions WHERE user_id = ? AND league = ? COLLATE NOCASE ORDER BY opened_at DESC",
    )
    .all(userId, league) as PositionRow[];
}

/** One open position, and only if it belongs to `league` — a foreign id simply does not exist. */
export function getPosition(userId: number, league: string, id: number): PositionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM positions WHERE user_id = ? AND league = ? COLLATE NOCASE AND id = ?")
    .get(userId, league, id) as PositionRow | undefined;
}

export function deletePosition(userId: number, league: string, id: number): void {
  getDb()
    .prepare("DELETE FROM positions WHERE user_id = ? AND league = ? COLLATE NOCASE AND id = ?")
    .run(userId, league, id);
}

export type Holdings = { DIVINE: number; EXALT: number; CHAOS: number };

export function getHoldings(userId: number): Holdings {
  const rows = getDb()
    .prepare("SELECT currency, amount FROM holdings WHERE user_id = ?")
    .all(userId) as Array<{ currency: string; amount: number }>;
  const h: Holdings = { DIVINE: 0, EXALT: 0, CHAOS: 0 };
  for (const r of rows) if (r.currency in h) h[r.currency as keyof Holdings] = r.amount;
  return h;
}

export function setHolding(userId: number, currency: string, amount: number): void {
  getDb()
    .prepare(
      `INSERT INTO holdings (user_id, currency, amount, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(user_id, currency) DO UPDATE SET amount = excluded.amount, updated_at = CURRENT_TIMESTAMP`,
    )
    .run(userId, currency, amount);
}

/** This user's manual trade log IN ONE LEAGUE — same rule as flips and positions. */
export function getTrades(userId: number, league: string): TradeRow[] {
  return getDb()
    .prepare("SELECT * FROM trades WHERE user_id = ? AND league = ? COLLATE NOCASE ORDER BY traded_at DESC")
    .all(userId, league) as TradeRow[];
}

export function insertTrade(userId: number, league: string, t: Omit<TradeRow, "id" | "traded_at">): number {
  const info = getDb()
    .prepare(
      `INSERT INTO trades (user_id, league, item_id, item_name, side, currency, rate, quantity, total_currency, profit_chaos, notes)
       VALUES (@userId, @league, @item_id, @item_name, @side, @currency, @rate, @quantity, @total_currency, @profit_chaos, @notes)`,
    )
    .run({ ...t, userId, league });
  return Number(info.lastInsertRowid);
}

export function deleteTrade(userId: number, id: number): void {
  getDb().prepare("DELETE FROM trades WHERE user_id = ? AND id = ?").run(userId, id);
}

// --- hunts (live-search criteria) + hits ---

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
  created_at: string;
}

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

export function addHunt(
  userId: number,
  league: string,
  h: Omit<Hunt, "id" | "user_id" | "active" | "last_scan_at" | "last_hit_at" | "created_at">,
): number {
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
export function updateHunt(
  userId: number,
  id: number,
  h: Partial<Omit<Hunt, "id" | "user_id" | "active" | "last_scan_at" | "last_hit_at" | "created_at">>,
): void {
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
  getDb().prepare(`UPDATE hunts SET ${sets.join(", ")} WHERE user_id = @userId AND id = @id`).run(vals);
}

export function deleteHunt(userId: number, id: number): void {
  const db = getDb();
  db.prepare("DELETE FROM hunt_hits WHERE user_id = ? AND hunt_id = ?").run(userId, id);
  db.prepare("DELETE FROM hunts WHERE user_id = ? AND id = ?").run(userId, id);
}

export function touchHuntScan(id: number, hadHit: boolean): void {
  getDb()
    .prepare(
      `UPDATE hunts SET last_scan_at = CURRENT_TIMESTAMP${hadHit ? ", last_hit_at = CURRENT_TIMESTAMP" : ""} WHERE id = ?`,
    )
    .run(id);
}

export interface HuntHit {
  id: number;
  user_id: number;
  hunt_id: number;
  item_name: string;
  base_type: string | null;
  price_amount: number;
  price_ccy: string;
  price_div: number;
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

// --- balance snapshots (net-worth tracking) ---

export type BalanceSource = "trade" | "stash" | "ocr" | "manual";

export interface BalanceSnapshot {
  id: number;
  divine: number;
  exalted: number;
  chaos: number;
  exalt_per_div: number;
  chaos_per_div: number;
  other_div: number;
  net_worth_div: number;
  source: BalanceSource;
  note: string | null;
  fetched_at: string;
  league: string | null;
  listed_seen: number | null; // listings trade2 returned (a trade read caps at 100)
  listed_total: number | null; // listings trade2 says exist — > listed_seen means truncated
  gear_at_ask_div: number | null; // part of other_div valued at the seller's own asking price
}

export interface BalanceInput {
  divine: number;
  exalted: number;
  chaos: number;
  exaltPerDiv: number;
  chaosPerDiv: number;
  otherDiv?: number; // listed gear value (Div) folded into net worth
  source: BalanceSource;
  note?: string | null;
}

/** Net worth in Divine — the canonical base unit for every value in this app.
 *  Currency (Div/Ex/Chaos) + listed gear value (otherDiv). */
export function netWorthDiv(b: {
  divine: number; exalted: number; chaos: number; exaltPerDiv: number; chaosPerDiv: number; otherDiv?: number;
}): number {
  const ex = b.exaltPerDiv > 0 ? b.exalted / b.exaltPerDiv : 0;
  const ch = b.chaosPerDiv > 0 ? b.chaos / b.chaosPerDiv : 0;
  return b.divine + ex + ch + (b.otherDiv ?? 0);
}

export function insertBalance(userId: number, league: string, b: BalanceInput): BalanceSnapshot {
  const net = netWorthDiv(b);
  const info = getDb()
    .prepare(
      `INSERT INTO balance_snapshots (user_id, league, divine, exalted, chaos, exalt_per_div, chaos_per_div, other_div, net_worth_div, source, note)
       VALUES (@userId, @league, @divine, @exalted, @chaos, @exaltPerDiv, @chaosPerDiv, @otherDiv, @net, @source, @note)`,
    )
    .run({ ...b, userId, league, otherDiv: b.otherDiv ?? 0, net, note: b.note ?? null });
  return getDb().prepare("SELECT * FROM balance_snapshots WHERE id = ?").get(Number(info.lastInsertRowid)) as BalanceSnapshot;
}

// --- per-stash-tab breakdown ---

export interface TabInput {
  tab: string;
  divine: number;
  exalted: number;
  chaos: number;
  otherDiv: number;
  valueDiv: number;
  items: number;
  unpriced: number;
}

/** Store the per-tab breakdown for one balance snapshot (one row per tab). */
export function insertTabs(snapshotId: number, tabs: TabInput[]): void {
  if (tabs.length === 0) return;
  const stmt = getDb().prepare(
    `INSERT INTO balance_tabs (snapshot_id, tab, divine, exalted, chaos, other_div, value_div, items, unpriced)
     VALUES (@snapshotId, @tab, @divine, @exalted, @chaos, @otherDiv, @valueDiv, @items, @unpriced)`,
  );
  const tx = getDb().transaction((rows: TabInput[]) => {
    for (const r of rows) stmt.run({ ...r, snapshotId });
  });
  tx(tabs);
}
