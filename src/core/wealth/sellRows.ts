import type { PricedItem } from "../../api/types";
import type { BalanceItemRow } from "../../db/balanceItemQueries";
import type { LiquidationPlan, ListingComp, SellRow, SellTotals, SellVerdict, StashItem } from "../../lib/wealthContract";
import { amountInDivine } from "../listingPrice";
import type { ExchangeRates } from "../priceEngine";
import { RAW_ORBS } from "./plan";
import type { ReadListing } from "./soldSince";
import { sellVerdict } from "./sellVerdict";
import { stashNote } from "./tradeRoute";

/**
 * Planned rows + the stash items behind them + market context → the Sell table, most actionable
 * first. Pure.
 */
export interface SellRowContext {
  ninjaByName: ReadonlyMap<string, PricedItem>;
  compsByListing: ReadonlyMap<string, ListingComp>;
  rates: ExchangeRates;
}

/** Reprice first (money left on the table), then what to sell now, then what to list, hold, look at. */
const VERDICT_ORDER: Record<SellVerdict, number> = { reprice: 0, "sell-cx": 1, list: 2, hold: 3, unpriced: 4 };

const key = (name: string): string => name.trim().toLowerCase();

function sellRow(row: LiquidationPlan["rows"][number], item: StashItem, ctx: SellRowContext): SellRow {
  const ninja = ctx.ninjaByName.get(key(row.name)) ?? null;
  const comp = item.listingId == null ? null : (ctx.compsByListing.get(item.listingId) ?? null);
  const v = sellVerdict({
    row, askDiv: item.askDiv, change7d: ninja?.change7d ?? null, volume: ninja?.volume ?? null, comp,
    exPerDiv: ctx.rates.exaltPerDivine,
  });
  const listable = (v.verdict === "list" || v.verdict === "reprice") && v.targetDiv != null;
  const { reason: routeReason, ...plan } = row;
  return {
    ...plan, rarity: item.rarity, tabs: item.tabs, askDiv: item.askDiv, change7d: ninja?.change7d ?? null,
    verdict: v.verdict, targetDiv: v.targetDiv, reason: v.reason, routeReason,
    note: listable && v.targetDiv != null ? stashNote(v.targetDiv, ctx.rates).note : null,
    listingId: item.listingId, listedAt: item.listedAt, comp,
  };
}

export function buildSellRows(items: readonly StashItem[], plan: LiquidationPlan, ctx: SellRowContext): SellRow[] {
  const byName = new Map(items.map((i) => [key(i.name), i]));
  const rows = plan.rows.map((row) => {
    const item = byName.get(key(row.name));
    if (item == null) throw new Error(`buildSellRows: planned row ${row.name} has no stash item`);
    return sellRow(row, item, ctx);
  });
  return rows.sort(
    (a, b) => VERDICT_ORDER[a.verdict] - VERDICT_ORDER[b.verdict] || (b.patientTotalDiv ?? -1) - (a.patientTotalDiv ?? -1),
  );
}

export function sellTotals(plan: LiquidationPlan, rows: readonly SellRow[]): SellTotals {
  const byVerdict: Record<SellVerdict, number> = { "sell-cx": 0, list: 0, reprice: 0, hold: 0, unpriced: 0 };
  for (const r of rows) byVerdict[r.verdict]++;
  return { ...plan.totals, byVerdict };
}

/**
 * A stored read's rows as sold-since inputs: the whole listing's ask (unit ask × stack). Raw orb
 * stacks are left out — spending your own Divines is not a sale.
 */
export function readListings(rows: readonly BalanceItemRow[], rates: ExchangeRates): ReadListing[] {
  return rows.filter((r) => !RAW_ORBS.has(key(r.item_name))).map((r) => {
    const unit = r.ask_amount == null || r.ask_currency == null ? null : amountInDivine(r.ask_amount, r.ask_currency, rates);
    return { listingId: r.listing_id, name: r.item_name, askDiv: unit == null ? null : unit * r.stack_size };
  });
}
