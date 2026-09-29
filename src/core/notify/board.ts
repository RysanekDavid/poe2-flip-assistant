/**
 * Discord live board: one message per user, edited in place every interval, summarising what to
 * do right now — best exchange loops, what to farm, and where net worth is heading. Pure: the data
 * is gathered by boardData.ts; this only renders it inside Discord's embed limits (fitEmbeds).
 */
import type { NetBound } from "../../lib/farmContract";
import type { FlipMode } from "../flipModel";
import type { Currency } from "../priceEngine";
import { embedMessage, truncate, type DiscordEmbed, type DiscordEmbedField, type DiscordMessage } from "./discordMessage";

/** A board section either loaded or failed; a failure is shown on the board, never dropped. */
export type BoardSection<T> = { ok: true; value: T } | { ok: false }; // failure detail stays in the server log

export interface BoardCxRoute {
  item: string;
  from: Currency;
  to: Currency;
  edgePct: number;
  held6: number;
  capDivPerHour: number;
}

export interface BoardSpread {
  item: string;
  edgePct: number;
  profitDiv: number;
  mode: FlipMode;
}

export type BoardTrades =
  | { source: "cx"; routes: BoardCxRoute[] }
  | { source: "watchlist"; spreads: BoardSpread[] }; // no fresh exchange loops for the league

export interface BoardBoss {
  name: string;
  netDiv: number;
  netBound: NetBound;
}

export interface BoardMechanic {
  label: string;
  change7dPct: number;
}

export interface BoardFarm {
  bosses: BoardBoss[];
  hot: BoardMechanic[];
}

export interface BoardWorth {
  league: string;
  netWorthDiv: number;
  change24hPct: number | null;
  change7dPct: number | null;
  fetchedAt: string;
}

export interface BoardData {
  league: string;
  nowMs: number;
  trades: BoardSection<BoardTrades>;
  farm: BoardSection<BoardFarm>;
  worth: BoardSection<BoardWorth | null>; // null = no snapshot recorded yet
}

export const BOARD_LIMITS = { routes: 5, bosses: 3, hot: 5 } as const;
const BOARD_COLOR = 0xfbbf24; // the app's one accent (amber-400), as on amber alert embeds
const UNAVAILABLE = "unavailable — see server log";
const FIELD_MAX = 1000; // Discord caps a field value at 1024
const CCY: Readonly<Record<Currency, string>> = { DIVINE: "Div", EXALT: "Ex", CHAOS: "Chaos" };

/** Names come from third-party market data: keep them from turning into Discord markdown. */
function plain(text: string, max = 60): string {
  return truncate(text.replace(/[\\`*_~|>[\]]/g, (c) => `\\${c}`), max);
}

function num(n: number): string {
  return Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
}

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}%`;
}

const BOUND: Readonly<Record<NetBound, string>> = { exact: "", lower: "≥", upper: "≤", unknown: "?" };
const MODE: Readonly<Record<FlipMode, string>> = { REAL: "your Ange prices", RECO: "estimate" };

function tradesField(s: BoardSection<BoardTrades>): DiscordEmbedField {
  if (!s.ok) return { name: "Trades", value: UNAVAILABLE };
  if (s.value.source === "cx") {
    const lines = s.value.routes.map(
      (r) => `• ${CCY[r.from]} → ${plain(r.item)} → ${CCY[r.to]} · ${pct(r.edgePct)} · held ${r.held6}/6 h · cap ${num(r.capDivPerHour)} div/h`,
    );
    return { name: "Top exchange loops", value: truncate(lines.join("\n"), FIELD_MAX) };
  }
  const lines = s.value.spreads.map((r) => `• ${plain(r.item)} · ${pct(r.edgePct)} · ${num(r.profitDiv)} div/flip · ${MODE[r.mode]}`);
  const value = lines.length ? lines.join("\n") : "no fresh exchange loops and no scored watchlist items";
  return { name: "Watchlist spreads (no fresh exchange loops)", value: truncate(value, FIELD_MAX) };
}

function farmFields(s: BoardSection<BoardFarm>): DiscordEmbedField[] {
  if (!s.ok) return [{ name: "Farm", value: UNAVAILABLE }];
  const bosses = s.value.bosses.map((b) => `• ${plain(b.name)} · ${BOUND[b.netBound]}${num(b.netDiv)} div/kill`);
  const hot = s.value.hot.map((m) => `${plain(m.label, 40)} ${pct(m.change7dPct)}`);
  return [
    { name: "Farm — best bosses", value: truncate(bosses.length ? bosses.join("\n") : "no priced bosses yet", FIELD_MAX) },
    { name: "Hot mechanics (7 d)", value: truncate(hot.length ? hot.join(" · ") : "nothing hot right now", FIELD_MAX) },
  ];
}

function worthField(s: BoardSection<BoardWorth | null>, league: string): DiscordEmbedField {
  if (!s.ok) return { name: "Net worth", value: UNAVAILABLE };
  const w = s.value;
  if (w == null) return { name: "Net worth", value: "no snapshot yet — record one in the Wealth tab" };
  const other = w.league !== league ? ` · ${plain(w.league, 60)}` : "";
  return {
    name: "Net worth",
    value: `${num(w.netWorthDiv)} div · 24 h ${pct(w.change24hPct)} · 7 d ${pct(w.change7dPct)} · as of ${w.fetchedAt.slice(0, 16)} UTC${other}`,
  };
}

/** "updated 14:05 UTC · this message is edited in place" */
export function boardFooter(nowMs: number): string {
  return `updated ${new Date(nowMs).toISOString().slice(11, 16)} UTC · this message is edited in place`;
}

/** Pure: the whole board as one webhook message, guaranteed inside Discord's limits. */
export function boardMessage(data: BoardData): DiscordMessage {
  const embed: DiscordEmbed = {
    title: truncate(`Live board · ${data.league}`, 200),
    color: BOARD_COLOR,
    fields: [tradesField(data.trades), ...farmFields(data.farm), worthField(data.worth, data.league)],
    timestamp: new Date(data.nowMs).toISOString(),
    footer: { text: boardFooter(data.nowMs) },
  };
  return embedMessage(`Live board · ${truncate(data.league, 100)}`, [embed]);
}
