import type { PricedItem } from "../../api/types";
import type {
  LiquidationPlan,
  ListingCompetition,
  PlanInput,
  PlanRow,
  PlanTotals,
  StashItem,
  ValueSource,
} from "../../lib/wealthContract";
import type { CxItemStats } from "../cx/cxPersistence";
import { amountInDivine } from "../listingPrice";
import type { ExchangeRates } from "../priceEngine";
import { cxSellQuote } from "./cxRoute";
import { tradeListingQuote } from "./tradeRoute";

/**
 * Per stash item: sell on the Currency Exchange or list it on trade, and what it should fetch.
 * Pure — the route loads every map below from the DB (and poe2scout) and hands them in.
 *
 * Rule: an exchange item (it has a poe.ninja line) goes to the exchange unless its market is
 * `thin`; everything else is listed on trade at a market value — your own listing's trade2
 * comparables when a reprice check has run, else the poe2scout unique price. Anything without
 * either (most rares before a check) is unpriced: null, never 0.
 */

export interface ScoutListing {
  competition: ListingCompetition;
  icon: string | null;
}

export interface PlanContext {
  rates: ExchangeRates;
  /** Latest poe.ninja line per lowercased item name. */
  ninjaByName: ReadonlyMap<string, PricedItem>;
  /** Exchange stats per ninja item id (cxItemMarkets view); empty when there is no fresh history. */
  cxByItemId: ReadonlyMap<string, CxItemStats>;
  /** poe2scout unique value (Div per unit) per lowercased name. */
  uniqueDiv: ReadonlyMap<string, number>;
  /** Fair value (Div per unit) from your own listing's trade2 comparables, per lowercased name. */
  compDiv: ReadonlyMap<string, number>;
  /** poe2scout live-listing competition per lowercased unique name. */
  competition: ReadonlyMap<string, ScoutListing>;
  params: { goldPerExalt: number; flowSharePct: number; maxGridStepPct: number };
}

interface MergedInput {
  key: string;
  name: string;
  qty: number;
}

const nameKey = (name: string): string => name.trim().toLowerCase();

/** Same item listed twice → one row with the summed quantity. */
export function mergeInputs(items: readonly PlanInput[]): MergedInput[] {
  const byKey = new Map<string, MergedInput>();
  for (const it of items) {
    const key = nameKey(it.name);
    const seen = byKey.get(key);
    if (seen == null) byKey.set(key, { key, name: it.name.trim(), qty: it.qty });
    else seen.qty += it.qty;
  }
  return [...byKey.values()];
}

const fmtDivH = (n: number): string => (n >= 10 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1));

function unpricedRow(m: MergedInput, reason: string, icon: string | null): PlanRow {
  return {
    name: m.name, qty: m.qty, icon, valueSource: "none", unitDiv: null, cx: null, trade: null,
    recommended: "unpriced", reason, fastTotalDiv: null, patientTotalDiv: null, feeTotalDiv: null, warnings: [],
  };
}

const TRADE_REASON: Partial<Record<ValueSource, string>> = {
  scout: "unique — poe2scout price, list it on trade",
  trade: "trade2 comparables of your listing — list it on trade",
};

function tradeRow(m: MergedInput, unitDiv: number, source: ValueSource, ctx: PlanContext, icon: string | null = null): PlanRow {
  const listing = ctx.competition.get(m.key) ?? null;
  const trade = tradeListingQuote(unitDiv, m.qty, listing?.competition ?? null, ctx.rates);
  return {
    name: m.name, qty: m.qty, icon: listing?.icon ?? icon, valueSource: source, unitDiv, cx: null, trade,
    recommended: "trade", reason: TRADE_REASON[source] ?? "list it on trade",
    fastTotalDiv: trade.quickDiv * m.qty, patientTotalDiv: trade.patientDiv * m.qty, feeTotalDiv: null, warnings: [],
  };
}

function exchangeRow(m: MergedInput, line: PricedItem, ctx: PlanContext): PlanRow {
  const { goldPerExalt, flowSharePct, maxGridStepPct } = ctx.params;
  const stats = ctx.cxByItemId.get(line.itemId) ?? null;
  const midDiv = stats != null ? stats.midDiv : line.baseValue;
  if (!(midDiv > 0)) return unpricedRow({ ...m, name: line.itemName }, "exchange item with no usable price right now", line.icon);
  const base = { name: line.itemName, qty: m.qty, icon: line.icon };
  const cx = cxSellQuote(line, stats, m.qty, ctx.rates, goldPerExalt, flowSharePct, maxGridStepPct);
  const marketSource: ValueSource = cx.observed ? "cx" : "ninja";
  const flow = cx.observed ? `${fmtDivH((cx.unitsPerHour ?? 0) * cx.midDiv)} Div/h observed` : "ninja volume, unit unverified";
  if (cx.tier === "thin") {
    const trade = tradeListingQuote(midDiv, m.qty, null, ctx.rates);
    return {
      ...base, warnings: [], valueSource: marketSource, unitDiv: midDiv, cx, trade, recommended: "trade",
      reason: `exchange too thin (${flow}) — list it on trade`,
      fastTotalDiv: trade.quickDiv * m.qty, patientTotalDiv: trade.patientDiv * m.qty, feeTotalDiv: null,
    };
  }
  const feeTotalDiv = cx.feeDivPerUnit == null ? null : cx.feeDivPerUnit * m.qty;
  return {
    ...base, warnings: [], valueSource: marketSource, unitDiv: midDiv, cx, trade: null, recommended: "cx",
    reason: `${cx.tier} exchange market (${flow})`,
    fastTotalDiv: cx.fastDiv * m.qty - (feeTotalDiv ?? 0),
    patientTotalDiv: cx.patientDiv * m.qty - (feeTotalDiv ?? 0),
    feeTotalDiv,
  };
}

function planRow(m: MergedInput, ctx: PlanContext): PlanRow {
  const line = ctx.ninjaByName.get(m.key);
  if (line != null) return exchangeRow(m, line, ctx);
  // Your own listing's comparables are fresher and closer to the exact item than poe2scout's daily price.
  const comp = ctx.compDiv.get(m.key);
  if (comp != null && comp > 0) return tradeRow(m, comp, "trade", ctx);
  const scout = ctx.uniqueDiv.get(m.key);
  if (scout != null && scout > 0) return tradeRow(m, scout, "scout", ctx);
  const icon = ctx.competition.get(m.key)?.icon ?? null;
  return unpricedRow(m, "no market price yet — a reprice check values it from trade2", icon);
}

export function planTotals(rows: readonly PlanRow[]): PlanTotals {
  const totals: PlanTotals = { fastDiv: 0, patientDiv: 0, feeDiv: 0, unpricedCount: 0, feeIncompleteCount: 0 };
  for (const r of rows) {
    if (r.recommended === "unpriced") totals.unpricedCount++;
    totals.fastDiv += r.fastTotalDiv ?? 0;
    totals.patientDiv += r.patientTotalDiv ?? 0;
    totals.feeDiv += r.feeTotalDiv ?? 0;
    if (r.recommended === "cx" && r.cx != null && !r.cx.feeComplete) totals.feeIncompleteCount++;
  }
  return totals;
}

/** Raw currency is what you sell INTO — never planned. */
export const RAW_ORBS: ReadonlySet<string> = new Set(["divine orb", "exalted orb", "chaos orb"]);

export interface StoredStashItem {
  tab: string | null;
  item_name: string;
  rarity: string | null;
  stack_size: number;
  ask_amount: number | null;
  ask_currency: string | null;
  listing_id: string | null;
  indexed_at: string | null;
}

interface StashGroup {
  item: StashItem;
  /** Σ unit ask × stack, in Div — the whole group at your own asks. */
  askTotal: number;
  askComplete: boolean;
}

/** Oldest-indexed listing wins: it is the one that has sat unsold longest. */
function keepOldestListing(item: StashItem, r: StoredStashItem): void {
  if (r.listing_id == null) return;
  const older = item.listedAt == null || (r.indexed_at != null && r.indexed_at < item.listedAt);
  if (item.listingId == null || older) {
    item.listingId = r.listing_id;
    item.listedAt = r.indexed_at;
  }
}

function addToGroup(g: StashGroup, r: StoredStashItem, rates: ExchangeRates): void {
  g.item.qty += r.stack_size;
  if (r.tab != null && !g.item.tabs.includes(r.tab)) g.item.tabs.push(r.tab);
  keepOldestListing(g.item, r);
  // ask_amount is the note's amount and a stash note on a stack prices ONE unit (Maxroll
  // bulk-selling guide; PoE2 forum thread 3688218 — `~price N/M cur` exists to price several
  // units), so it is used as-is per unit and weighted by the stack it sits on.
  const unitAsk = r.ask_amount == null || r.ask_currency == null ? null : amountInDivine(r.ask_amount, r.ask_currency, rates);
  if (unitAsk == null || !(unitAsk > 0)) g.askComplete = false;
  else g.askTotal += unitAsk * r.stack_size;
}

/**
 * The stored rows of one stash read → one entry per item name (stacks and tabs merged), raw orbs
 * left out and counted. `askDiv` is your per-unit ask (stack-weighted mean when the same item sits
 * in several listings at different asks), only when every listing of the item carried a
 * ladder-priced ask.
 */
export function groupStashItems(rows: readonly StoredStashItem[], rates: ExchangeRates): { items: StashItem[]; skippedOrbs: number } {
  const groups = new Map<string, StashGroup>();
  let skippedOrbs = 0;
  for (const r of rows) {
    const key = nameKey(r.item_name);
    if (RAW_ORBS.has(key)) {
      skippedOrbs++;
      continue;
    }
    let g = groups.get(key);
    if (g == null) {
      const item: StashItem = { name: r.item_name, qty: 0, rarity: r.rarity, tabs: [], askDiv: null, listingId: null, listedAt: null };
      g = { item, askTotal: 0, askComplete: true };
      groups.set(key, g);
    }
    addToGroup(g, r, rates);
  }
  const items = [...groups.values()].map((g) => ({ ...g.item, askDiv: g.askComplete && g.item.qty > 0 ? g.askTotal / g.item.qty : null }));
  return { items, skippedOrbs };
}

/** Plan every item (duplicates merged), in entry order. */
export function planLiquidation(items: readonly PlanInput[], ctx: PlanContext): LiquidationPlan {
  const rows = mergeInputs(items).map((m) => planRow(m, ctx));
  return { rows, totals: planTotals(rows) };
}
