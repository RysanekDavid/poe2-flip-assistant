import { getDb } from "./database";
import type { BalanceSnapshot } from "./queries";

/**
 * Net-worth READS, split out of queries.ts (over the file-size cap). Writes stay there because
 * the poller imports them.
 *
 * Every read is LEAGUE-SCOPED: a Divine in one economy is not the same wealth in another, and a
 * chart that mixed them would draw a league switch as a crash or a windfall. Callers pass the
 * league the read pipeline ran in (the app default league), which is what snapshots are tagged with.
 */

export interface BalanceStats {
  latest: BalanceSnapshot | null;
  first: BalanceSnapshot | null; // earliest same-source snapshot — all-time baseline
  change24hPct: number | null;
  change7dPct: number | null;
  changeAllPct: number | null;
  count: number;
}

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

export interface TabSeriesPoint {
  tab: string;
  fetched_at: string;
  value_div: number;
}

export function getBalances(userId: number, league: string, limit = 500): BalanceSnapshot[] {
  return getDb()
    .prepare("SELECT * FROM balance_snapshots WHERE user_id = ? AND league = ? ORDER BY fetched_at DESC, id DESC LIMIT ?")
    .all(userId, league, limit) as BalanceSnapshot[];
}

/**
 * Newest snapshot at or before `agoHours` ago with the SAME source — for %-change baselines.
 * A manual entry (currency typed by hand) compared against a trade read (currency + gear) would
 * report the gear as a gain or loss that never happened.
 */
function balanceBefore(
  userId: number,
  league: string,
  source: BalanceSnapshot["source"],
  agoHours: number,
): BalanceSnapshot | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM balance_snapshots
       WHERE user_id = ? AND league = ? AND source = ? AND fetched_at <= datetime('now', ?)
       ORDER BY fetched_at DESC, id DESC LIMIT 1`,
    )
    .get(userId, league, source, `-${agoHours} hours`) as BalanceSnapshot | undefined;
}

function pctDelta(now: number, then: number | undefined): number | null {
  if (then == null || !(then > 0)) return null;
  return ((now - then) / then) * 100;
}

export function balanceStats(userId: number, league: string): BalanceStats {
  const db = getDb();
  const latest = db
    .prepare("SELECT * FROM balance_snapshots WHERE user_id = ? AND league = ? ORDER BY fetched_at DESC, id DESC LIMIT 1")
    .get(userId, league) as BalanceSnapshot | undefined;
  const count = (
    db.prepare("SELECT COUNT(*) c FROM balance_snapshots WHERE user_id = ? AND league = ?").get(userId, league) as { c: number }
  ).c;
  if (!latest) return { latest: null, first: null, change24hPct: null, change7dPct: null, changeAllPct: null, count: 0 };
  const first = db
    .prepare(
      "SELECT * FROM balance_snapshots WHERE user_id = ? AND league = ? AND source = ? ORDER BY fetched_at ASC, id ASC LIMIT 1",
    )
    .get(userId, league, latest.source) as BalanceSnapshot | undefined;
  const now = latest.net_worth_div;
  return {
    latest,
    first: first ?? null,
    change24hPct: pctDelta(now, balanceBefore(userId, league, latest.source, 24)?.net_worth_div),
    change7dPct: pctDelta(now, balanceBefore(userId, league, latest.source, 24 * 7)?.net_worth_div),
    changeAllPct: pctDelta(now, first?.net_worth_div),
    count,
  };
}

/** Record what a trade read actually saw, so the UI can say loudly when it was truncated. */
export function annotateBalanceScan(
  snapshotId: number,
  a: { listedSeen: number; listedTotal: number; gearAtAskDiv: number },
): void {
  getDb()
    .prepare("UPDATE balance_snapshots SET listed_seen = ?, listed_total = ?, gear_at_ask_div = ? WHERE id = ?")
    .run(a.listedSeen, a.listedTotal, a.gearAtAskDiv, snapshotId);
}

/** This user's per-tab breakdown of their most recent snapshot (in `league`) that has tabs. */
export function latestTabs(userId: number, league: string): TabRow[] {
  const snap = getDb()
    .prepare(
      `SELECT bt.snapshot_id FROM balance_tabs bt
       JOIN balance_snapshots bs ON bt.snapshot_id = bs.id
       WHERE bs.user_id = ? AND bs.league = ? ORDER BY bt.id DESC LIMIT 1`,
    )
    .get(userId, league) as { snapshot_id: number } | undefined;
  if (!snap) return [];
  return getDb()
    .prepare(
      "SELECT tab, divine, exalted, chaos, other_div, value_div, items, unpriced FROM balance_tabs WHERE snapshot_id = ? ORDER BY value_div DESC",
    )
    .all(snap.snapshot_id) as TabRow[];
}

/** This user's per-tab value over time in `league` — pivot client-side for charts. */
export function tabSeries(userId: number, league: string, limitSnapshots = 60): TabSeriesPoint[] {
  return getDb()
    .prepare(
      `SELECT bt.tab, bs.fetched_at, bt.value_div
       FROM balance_tabs bt JOIN balance_snapshots bs ON bt.snapshot_id = bs.id
       WHERE bs.id IN (
         SELECT id FROM balance_snapshots WHERE user_id = ? AND league = ? ORDER BY fetched_at DESC, id DESC LIMIT ?
       )
       ORDER BY bs.fetched_at ASC, bs.id ASC`,
    )
    .all(userId, league, limitSnapshots) as TabSeriesPoint[];
}
