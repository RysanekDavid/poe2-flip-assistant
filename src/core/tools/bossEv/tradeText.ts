import type { UniqueTradeRow } from "../../../db/uniqueTradeQueries";

/*
 * Wording for the trade2 fallback price of a boss unique, pure and client-safe (type-only import),
 * so the loot table and the unpriced reasons say the same thing and the rules are unit-tested.
 */

const HOUR_MS = 3_600_000;

/** "<1h", "7h", "3d" — the age of a trade search. */
export function fmtAgeHours(hours: number): string {
  if (!Number.isFinite(hours)) throw new Error(`trade price age is not a number: ${hours}`);
  const h = Math.max(0, hours);
  if (h < 1) return "<1h";
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

/** The visible source line under a trade-priced drop: "trade listings · 14 listed · 3h". */
export function tradeSourceLabel(p: { listed: number; ageHours: number | null }): string {
  return `trade listings · ${p.listed.toLocaleString("en-US")} listed${p.ageHours == null ? "" : ` · ${fmtAgeHours(p.ageHours)}`}`;
}

/** Its tooltip: where the number comes from and why it is not poe2scout's. */
export function tradeSourceTitle(p: { listed: number; samples: number; ageHours: number | null }): string {
  const age = p.ageHours == null ? "" : `, searched ${fmtAgeHours(p.ageHours)} ago`;
  return [
    "poe2scout has no price for this unique, so it is priced from the official trade site:",
    `median of the cheapest instant-buyout, uncorrupted listings after dropping bait — ${p.samples} listing(s) behind it, ${p.listed} listed${age}.`,
    "An asking price, not a sale: expect to sell a little under it.",
  ].join("\n");
}

/** The trade half of an unpriced unique's reason in any league but the default one. */
export const TRADE_DEFAULT_LEAGUE_ONLY = "trade prices are gathered for the default league only";

/**
 * The trade half of an unpriced unique's reason. The last attempt wins: a failed search says why,
 * a successful one says how thin the market was.
 */
export function tradeUnpricedNote(row: UniqueTradeRow | null, nowMs: number): string {
  if (row == null) return "not searched on trade yet";
  const ago = (ms: number): string => `${fmtAgeHours((nowMs - ms) / HOUR_MS)} ago`;
  if (row.error != null) {
    // an attempt that sent nothing (trade2's catalog does not know the name) is not a failed search
    const sent = row.searchedAtMs === row.checkedAtMs;
    return sent ? `trade search failed ${ago(row.checkedAtMs)}: ${row.error}` : `not searchable on trade (checked ${ago(row.checkedAtMs)}): ${row.error}`;
  }
  const seen = row.observed;
  if (seen == null) throw new Error(`unique_trade_values ${row.nameKey}: no observation and no error`);
  if (seen.listed === 0) return `no instant-buyout listings on trade (searched ${ago(seen.atMs)})`;
  return `only ${seen.samples} usable of ${seen.listed} trade listing(s), too few to price (searched ${ago(seen.atMs)})`;
}
