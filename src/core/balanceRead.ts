import { readCurrencyFromTrade, type AccountCurrency } from "../api/accountScan";
import { insertBalance, insertTabs, type BalanceSnapshot } from "../db/queries";
import { annotateBalanceScan } from "../db/balanceQueries";
import type { TradeCred } from "../api/tradeClient";
import type { ExchangeRates } from "./priceEngine";

/**
 * One trade-read net-worth snapshot: read own public listings → store the snapshot, its per-tab
 * breakdown, and what the read actually saw (truncation + gear valued at own asks). Kept in one
 * place so every caller records the same provenance; the UI warns off the annotation columns.
 */
export async function recordTradeBalance(
  userId: number,
  league: string,
  account: string,
  rates: ExchangeRates,
  cred: TradeCred,
): Promise<{ snapshot: BalanceSnapshot; scan: AccountCurrency }> {
  const c = await readCurrencyFromTrade(account, rates, cred);
  const snap = insertBalance(userId, league, {
    divine: c.divine,
    exalted: c.exalted,
    chaos: c.chaos,
    exaltPerDiv: rates.exaltPerDivine,
    chaosPerDiv: rates.chaosPerDivine,
    otherDiv: c.otherDiv,
    source: "trade",
    note: `${c.listingsSeen}/${c.total} listed · gear ~${c.otherDiv.toFixed(1)} Div · ${c.tabs.length} tabs${c.unpriced ? ` · ${c.unpriced} unpriced` : ""}`,
  });
  insertTabs(snap.id, c.tabs);
  annotateBalanceScan(snap.id, { listedSeen: c.listingsSeen, listedTotal: c.total, gearAtAskDiv: c.gearAtAskDiv });
  return {
    snapshot: { ...snap, listed_seen: c.listingsSeen, listed_total: c.total, gear_at_ask_div: c.gearAtAskDiv },
    scan: c,
  };
}
