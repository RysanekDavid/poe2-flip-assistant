import type Database from "better-sqlite3";
import { z } from "zod";
import type { PricedItem } from "../../api/types";
import { config } from "../../config/env";
import { balanceStats } from "../../db/balanceQueries";
import { getDb } from "../../db/database";
import { latestSnapshots } from "../../db/marketQueries";
import { dueBoardUserIds, enqueueBoard } from "../../db/notifyQueries";
import { getWatchlistForLeague, manualAgeMs, type WatchItem } from "../../db/watchlistQueries";
import { loadCxMarketView } from "../cx/cxItemMarkets";
import { loadCxRoutes } from "../cx/cxRouteView";
import { loadFarmBoard } from "../farm/farmLoad";
import { scoreItem, type ManualPrice } from "../flipModel";
import { getDefaultLeague } from "../leagueState";
import { leagueForUser } from "../leagueUsers";
import { resolveRates } from "../rates";
import { BOARD_LIMITS, boardMessage, type BoardData, type BoardFarm, type BoardSection, type BoardTrades, type BoardWorth } from "./board";
import type { DiscordMessage } from "./discordMessage";
import { redactWebhook } from "./webhookUrl";

/** Board refresh period (DISCORD_BOARD_INTERVAL_MIN, default 60). */
export function boardIntervalMs(): number {
  return config.discordBoard.intervalMin * 60_000;
}

/**
 * Queue a board update for every user whose board is due (see dueBoardUserIds). Mirrors
 * enqueueDueDigests; the content is rendered at send time, not here.
 */
export function enqueueDueBoards(now: number, db: Database.Database = getDb()): number {
  let queued = 0;
  for (const userId of dueBoardUserIds(now, boardIntervalMs(), db)) {
    if (enqueueBoard(userId, db)) queued++;
  }
  return queued;
}

/**
 * One section failing (a missing table, a malformed curated file) must not blank the whole board:
 * it is logged loudly and shown on the board as "unavailable: …".
 */
function section<T>(userId: number, name: string, load: () => T): BoardSection<T> {
  try {
    return { ok: true, value: load() };
  } catch (e) {
    const error = redactWebhook(e instanceof Error ? e.message : String(e));
    console.error(`[notify] board for user ${userId}: ${name} section failed: ${error}`);
    return { ok: false, error: error.slice(0, 200) };
  }
}

const CurrencySchema = z.enum(["DIVINE", "EXALT", "CHAOS"]);

/** A watch row's manual Ange price, unless it has gone stale (the Watchlist view applies the same rule). */
function manual(amount: number | null, ccy: string | null, fallback: "EXALT" | "CHAOS", stale: boolean): ManualPrice | null {
  if (stale || amount == null) return null;
  return { amount, ccy: CurrencySchema.parse(ccy ?? fallback) };
}

/** Fallback when the exchange has no fresh loops: the user's watchlist, scored like GET /api/spreads. */
function watchlistTrades(userId: number, league: string, prices: readonly PricedItem[], nowMs: number): BoardTrades {
  const resolved = resolveRates(league, nowMs);
  if (!resolved) return { source: "watchlist", spreads: [] };
  const byId = new Map(prices.map((p) => [p.itemId, p]));
  const cx = loadCxMarketView(league, prices, nowMs);
  const staleMs = config.manualStaleHours * 3600_000;
  const rows = getWatchlistForLeague(userId, league).flatMap((w: WatchItem) => {
    const price = byId.get(w.item_id);
    if (!price) return [];
    const age = manualAgeMs(w.manual_set_at);
    const stale = age != null && age > staleMs;
    const buy = manual(w.manual_buy_exalt, w.manual_buy_ccy, "EXALT", stale);
    const sell = manual(w.manual_sell_chaos, w.manual_sell_ccy, "CHAOS", stale);
    return [scoreItem(price, resolved.rates, buy, sell, cx?.byItemId.get(w.item_id) ?? null)];
  });
  const spreads = rows
    .filter((r) => r.ranked)
    .sort((a, b) => b.worthScore - a.worthScore)
    .slice(0, BOARD_LIMITS.routes)
    .map((r) => ({ item: r.item, edgePct: r.edgePct, profitDiv: r.profitDiv, mode: r.mode }));
  return { source: "watchlist", spreads };
}

function trades(userId: number, league: string, nowMs: number): BoardTrades {
  const prices = latestSnapshots(league);
  const cx = loadCxRoutes(league, prices, nowMs);
  if (cx != null && cx.routes.length > 0) {
    const routes = cx.routes.slice(0, BOARD_LIMITS.routes).map((r) => ({
      item: r.item,
      from: r.from,
      to: r.to,
      edgePct: r.edgePct,
      held6: r.held6,
      capDivPerHour: r.capDivPerHour,
    }));
    return { source: "cx", routes };
  }
  return watchlistTrades(userId, league, prices, nowMs);
}

function farm(league: string, nowMs: number): BoardFarm {
  const board = loadFarmBoard(league, nowMs);
  return {
    bosses: board.bosses.slice(0, BOARD_LIMITS.bosses).map((b) => ({ name: b.name, netDiv: b.netDiv, netBound: b.netBound })),
    hot: board.mechanics
      .filter((m) => m.signal === "HOT")
      .slice(0, BOARD_LIMITS.hot)
      .map((m) => ({ label: m.label, change7dPct: m.wAvgChange7d })),
  };
}

/** Net worth is only ever recorded in the app default league (the read pipeline's league). */
function worth(userId: number): BoardWorth | null {
  const league = getDefaultLeague();
  const stats = balanceStats(userId, league);
  if (!stats.latest) return null;
  return {
    league,
    netWorthDiv: stats.latest.net_worth_div,
    change24hPct: stats.change24hPct,
    change7dPct: stats.change7dPct,
    fetchedAt: stats.latest.fetched_at,
  };
}

/** Everything the board shows for one user, in the league they are viewing. */
export function loadBoardData(userId: number, nowMs: number): BoardData {
  const league = leagueForUser(userId);
  return {
    league,
    nowMs,
    trades: section(userId, "trades", () => trades(userId, league, nowMs)),
    farm: section(userId, "farm", () => farm(league, nowMs)),
    worth: section(userId, "net worth", () => worth(userId)),
  };
}

/** The drainer's default board renderer. */
export function renderBoard(userId: number, nowMs: number): DiscordMessage {
  return boardMessage(loadBoardData(userId, nowMs));
}
