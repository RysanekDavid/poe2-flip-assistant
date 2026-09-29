import type Database from "better-sqlite3";
import type { PricedItem } from "../../api/types";
import { config } from "../../config/env";
import { balanceStats } from "../../db/balanceQueries";
import { getDb } from "../../db/database";
import { latestSnapshots } from "../../db/marketQueries";
import { dueBoardUserIds, enqueueBoard } from "../../db/notifyQueries";
import { loadCxRoutes } from "../cx/cxRouteView";
import { loadFarmBoard } from "../farm/farmLoad";
import { getDefaultLeague } from "../leagueState";
import { leagueForUser } from "../leagueUsers";
import { scoreWatchlist } from "../watchlistSpreads";
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
 * One section failing (a missing table, a malformed curated file) must not blank the whole board.
 * The detail goes to the server log only — exception text (paths, SQL) never reaches a Discord
 * channel; the board says the section is unavailable.
 */
function section<T>(userId: number, name: string, load: () => T): BoardSection<T> {
  try {
    return { ok: true, value: load() };
  } catch (e) {
    const error = redactWebhook(e instanceof Error ? (e.stack ?? e.message) : String(e));
    console.error(`[notify] board for user ${userId}: ${name} section failed: ${error}`);
    return { ok: false };
  }
}

/** Fallback when the exchange has no fresh loops: the user's watchlist, scored exactly like GET /api/spreads. */
function watchlistTrades(userId: number, league: string, prices: readonly PricedItem[], nowMs: number): BoardTrades {
  const spreads = (scoreWatchlist(userId, league, prices, nowMs)?.spreads ?? [])
    .filter((r) => r.ranked)
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
