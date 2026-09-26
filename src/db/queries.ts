import { getDb } from "./database";

/**
 * Per-user application persistence (trades, flips, positions, holdings, balances). Market tables
 * moved to marketQueries.ts when they became league-scoped; the watchlist moved to
 * watchlistQueries.ts, alerts to alertQueries.ts and hunts to huntQueries.ts.
 *
 * These tables CARRY the league a row was created under, and the CALLER passes it: provenance
 * has to name the economy the producing pipeline actually ran in, which for a user action is
 * their view but for the shared trade2 pipelines (hunts, autosnipe, balances) is the app
 * default. Resolving it in here would have quietly relabelled every one of those.
 *
 * It is written at INSERT time rather than backfilled later, because after a switch there is no
 * way to recover which market an untagged row belonged to.
 */

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

export function getBalances(userId: number, limit = 500): BalanceSnapshot[] {
  return getDb()
    .prepare("SELECT * FROM balance_snapshots WHERE user_id = ? ORDER BY fetched_at DESC LIMIT ?")
    .all(userId, limit) as BalanceSnapshot[];
}

/** Newest snapshot at or before `agoHours` ago — for %-change baselines. */
function balanceBefore(userId: number, agoHours: number): BalanceSnapshot | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM balance_snapshots WHERE user_id = ? AND fetched_at <= datetime('now', ?) ORDER BY fetched_at DESC LIMIT 1`,
    )
    .get(userId, `-${agoHours} hours`) as BalanceSnapshot | undefined;
}

export interface BalanceStats {
  latest: BalanceSnapshot | null;
  first: BalanceSnapshot | null; // earliest snapshot — all-time baseline
  change24hPct: number | null;
  change7dPct: number | null;
  changeAllPct: number | null;
  count: number;
}

function pctDelta(now: number, then: number | undefined): number | null {
  if (then == null || !(then > 0)) return null;
  return ((now - then) / then) * 100;
}

export function balanceStats(userId: number): BalanceStats {
  const db = getDb();
  const latest = db
    .prepare("SELECT * FROM balance_snapshots WHERE user_id = ? ORDER BY fetched_at DESC LIMIT 1")
    .get(userId) as BalanceSnapshot | undefined;
  const first = db
    .prepare("SELECT * FROM balance_snapshots WHERE user_id = ? ORDER BY fetched_at ASC LIMIT 1")
    .get(userId) as BalanceSnapshot | undefined;
  const count = (db.prepare("SELECT COUNT(*) c FROM balance_snapshots WHERE user_id = ?").get(userId) as { c: number }).c;
  if (!latest) return { latest: null, first: null, change24hPct: null, change7dPct: null, changeAllPct: null, count: 0 };
  const now = latest.net_worth_div;
  return {
    latest,
    first: first ?? null,
    change24hPct: pctDelta(now, balanceBefore(userId, 24)?.net_worth_div),
    change7dPct: pctDelta(now, balanceBefore(userId, 24 * 7)?.net_worth_div),
    changeAllPct: pctDelta(now, first?.net_worth_div),
    count,
  };
}

// --- per-stash-tab breakdown ---

export interface TabRow {
  tab: string;
  divine: number;
  exalted: number;
  chaos: number;
  other_div: number;
  value_div: number;
  items: number;
  unpriced: number;
}
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

/** This user's per-tab breakdown of their most recent snapshot that has tabs, value-descending. */
export function latestTabs(userId: number): TabRow[] {
  const snap = getDb()
    .prepare(
      `SELECT bt.snapshot_id FROM balance_tabs bt
       JOIN balance_snapshots bs ON bt.snapshot_id = bs.id
       WHERE bs.user_id = ? ORDER BY bt.id DESC LIMIT 1`,
    )
    .get(userId) as { snapshot_id: number } | undefined;
  if (!snap) return [];
  return getDb()
    .prepare("SELECT tab, divine, exalted, chaos, other_div, value_div, items, unpriced FROM balance_tabs WHERE snapshot_id = ? ORDER BY value_div DESC")
    .all(snap.snapshot_id) as TabRow[];
}

export interface TabSeriesPoint {
  tab: string;
  fetched_at: string;
  value_div: number;
}

/** This user's per-tab value over time (joined to snapshot timestamps) — pivot client-side for charts. */
export function tabSeries(userId: number, limitSnapshots = 60): TabSeriesPoint[] {
  return getDb()
    .prepare(
      `SELECT bt.tab, bs.fetched_at, bt.value_div
       FROM balance_tabs bt JOIN balance_snapshots bs ON bt.snapshot_id = bs.id
       WHERE bs.user_id = ? AND bs.id IN (
         SELECT id FROM balance_snapshots WHERE user_id = ? ORDER BY fetched_at DESC LIMIT ?
       )
       ORDER BY bs.fetched_at ASC`,
    )
    .all(userId, userId, limitSnapshots) as TabSeriesPoint[];
}
