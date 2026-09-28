import type { PricedItem } from "../../../api/types";
import type {
  LiquidateInput,
  LiquidationPlan,
  ListingCompetition,
  PlanRow,
  PlanTotals,
  StashItem,
  ValueSource,
} from "../../../lib/tools/liquidateContract";
import type { CxItemStats } from "../../cx/cxPersistence";
import { amountInDivine } from "../../listingPrice";
import type { ExchangeRates } from "../../priceEngine";
import { cxSellQuote } from "./cxRoute";
import { tradeListingQuote } from "./tradeRoute";

/**
 * Per item: sell on the Currency Exchange or list it on trade, and what it should fetch. Pure —
 * the route loads every map below from the DB (and poe2scout) and hands them in.
 *
 * Rule: an exchange item (it has a poe.ninja line) goes to the exchange unless its market is
 * `thin`; everything else is listed on trade at a market value (poe2scout unique) or your own
 * `manualDiv`. Rares have neither in v1 (no valuation searches), so they come back `manual`:
 * unpriced until you type a value.
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
  /** poe2scout live-listing competition per lowercased unique name. */
  competition: ReadonlyMap<string, ScoutListing>;
  params: { goldPerExalt: number; flowSharePct: number; maxGridStepPct: number };
}

interface MergedInput {
  key: string;
  name: string;
  qty: number;
  manualDiv: number | undefined;
  warnings: string[];
}

const nameKey = (name: string): string => name.trim().toLowerCase();

/** Same item entered twice → one row with the summed quantity; the first manual value wins, loudly. */
export function mergeInputs(items: readonly LiquidateInput[]): MergedInput[] {
  const byKey = new Map<string, MergedInput>();
  for (const it of items) {
    const key = nameKey(it.name);
    const seen = byKey.get(key);
    if (seen == null) {
      byKey.set(key, { key, name: it.name.trim(), qty: it.qty, manualDiv: it.manualDiv, warnings: [] });
      continue;
    }
    seen.qty += it.qty;
    if (seen.manualDiv == null) seen.manualDiv = it.manualDiv;
    else if (it.manualDiv != null && it.manualDiv !== seen.manualDiv) {
      seen.warnings.push(`entered twice with different values — using ${seen.manualDiv} Div, not ${it.manualDiv}`);
    }
  }
  return [...byKey.values()];
}

const fmtDivH = (n: number): string => (n >= 10 ? Math.round(n).toLocaleString("en-US") : n.toFixed(1));

function unpricedRow(m: MergedInput, reason: string, icon: string | null): PlanRow {
  return {
    name: m.name, qty: m.qty, icon, valueSource: "none", unitDiv: null, cx: null, trade: null,
    recommended: "manual", reason, fastTotalDiv: null, patientTotalDiv: null, feeTotalDiv: null, warnings: m.warnings,
  };
}

function tradeRow(m: MergedInput, unitDiv: number, source: ValueSource, ctx: PlanContext, extra: string[], icon: string | null = null): PlanRow {
  const listing = ctx.competition.get(m.key) ?? null;
  const trade = tradeListingQuote(unitDiv, m.qty, listing?.competition ?? null, ctx.rates);
  return {
    name: m.name, qty: m.qty, icon: listing?.icon ?? icon, valueSource: source, unitDiv, cx: null, trade,
    recommended: "trade",
    reason: source === "scout" ? "unique — poe2scout price, list it on trade" : "your own value — list it on trade",
    fastTotalDiv: trade.quickDiv * m.qty, patientTotalDiv: trade.patientDiv * m.qty, feeTotalDiv: null,
    warnings: [...m.warnings, ...extra],
  };
}

function exchangeRow(m: MergedInput, line: PricedItem, ctx: PlanContext): PlanRow {
  const { goldPerExalt, flowSharePct, maxGridStepPct } = ctx.params;
  const stats = ctx.cxByItemId.get(line.itemId) ?? null;
  const midDiv = stats != null ? stats.midDiv : line.baseValue;
  if (!(midDiv > 0)) {
    const named = { ...m, name: line.itemName };
    if (m.manualDiv != null) return tradeRow(named, m.manualDiv, "manual", ctx, ["no usable market price right now"], line.icon);
    return unpricedRow(named, "exchange item with no usable price right now", line.icon);
  }
  const base = { name: line.itemName, qty: m.qty, icon: line.icon };
  const cx = cxSellQuote(line, stats, m.qty, ctx.rates, goldPerExalt, flowSharePct, maxGridStepPct);
  const marketSource: ValueSource = cx.observed ? "cx" : "ninja";
  const flow = cx.observed ? `${fmtDivH((cx.unitsPerHour ?? 0) * cx.midDiv)} Div/h observed` : "ninja volume, unit unverified";
  if (cx.tier === "thin") {
    // A listing is priced by its seller, so your own value is exactly what goes on the note.
    const unitDiv = m.manualDiv ?? midDiv;
    const trade = tradeListingQuote(unitDiv, m.qty, null, ctx.rates);
    return {
      ...base, warnings: m.warnings, valueSource: m.manualDiv != null ? "manual" : marketSource, unitDiv, cx, trade,
      recommended: "trade",
      reason: `exchange too thin (${flow}) — list it on trade`,
      fastTotalDiv: trade.quickDiv * m.qty, patientTotalDiv: trade.patientDiv * m.qty, feeTotalDiv: null,
    };
  }
  const warnings = [...m.warnings];
  if (m.manualDiv != null) warnings.push(`your value (${m.manualDiv} Div) is ignored — the exchange fills at the market price`);
  const feeTotalDiv = cx.feeDivPerUnit == null ? null : cx.feeDivPerUnit * m.qty;
  return {
    ...base, warnings, valueSource: marketSource, unitDiv: midDiv, cx, trade: null, recommended: "cx",
    reason: `${cx.tier} exchange market (${flow})`,
    fastTotalDiv: cx.fastDiv * m.qty - (feeTotalDiv ?? 0),
    patientTotalDiv: cx.patientDiv * m.qty - (feeTotalDiv ?? 0),
    feeTotalDiv,
  };
}

function planRow(m: MergedInput, ctx: PlanContext): PlanRow {
  const line = ctx.ninjaByName.get(m.key);
  if (line != null) return exchangeRow(m, line, ctx);
  const scout = ctx.uniqueDiv.get(m.key);
  if (m.manualDiv != null) {
    const extra = scout != null ? [`your value overrides poe2scout's ${scout.toPrecision(3)} Div`] : [];
    return tradeRow(m, m.manualDiv, "manual", ctx, extra);
  }
  if (scout != null && scout > 0) return tradeRow(m, scout, "scout", ctx, []);
  const icon = ctx.competition.get(m.key)?.icon ?? null;
  return unpricedRow(m, "no market value — enter your own per-unit price (rares are not auto-valued in v1)", icon);
}

export function planTotals(rows: readonly PlanRow[]): PlanTotals {
  const totals: PlanTotals = { fastDiv: 0, patientDiv: 0, feeDiv: 0, unpricedCount: 0, feeIncompleteCount: 0 };
  for (const r of rows) {
    if (r.recommended === "manual") totals.unpricedCount++;
    totals.fastDiv += r.fastTotalDiv ?? 0;
    totals.patientDiv += r.patientTotalDiv ?? 0;
    totals.feeDiv += r.feeTotalDiv ?? 0;
    if (r.recommended === "cx" && r.cx != null && !r.cx.feeComplete) totals.feeIncompleteCount++;
  }
  return totals;
}

/** Raw currency is what you liquidate INTO — never offered for import. */
export const RAW_ORBS: ReadonlySet<string> = new Set(["divine orb", "exalted orb", "chaos orb"]);

export interface StoredStashItem {
  tab: string | null;
  item_name: string;
  rarity: string | null;
  stack_size: number;
  ask_amount: number | null;
  ask_currency: string | null;
}

interface StashGroup {
  item: StashItem;
  askTotal: number;
  askComplete: boolean;
}

function addToGroup(g: StashGroup, r: StoredStashItem, rates: ExchangeRates): void {
  g.item.qty += r.stack_size;
  if (r.tab != null && !g.item.tabs.includes(r.tab)) g.item.tabs.push(r.tab);
  const ask = r.ask_amount == null || r.ask_currency == null ? null : amountInDivine(r.ask_amount, r.ask_currency, rates);
  // Assumes a listing's ask prices the whole listing (as accountScan values it), so it is spread
  // over the stack: "listing ask ÷ stack". PoE2's per-unit vs per-stack note semantics are unverified.
  if (ask == null || !(ask > 0)) g.askComplete = false;
  else g.askTotal += ask;
}

/**
 * The stored rows of one stash read → one import entry per item name (stacks and tabs merged),
 * raw orbs left out and counted. `askDiv` is listing ask ÷ stack, only when every listing of the
 * item carried a ladder-priced ask.
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
      g = { item: { name: r.item_name, qty: 0, rarity: r.rarity, tabs: [], askDiv: null }, askTotal: 0, askComplete: true };
      groups.set(key, g);
    }
    addToGroup(g, r, rates);
  }
  const items = [...groups.values()].map((g) => ({ ...g.item, askDiv: g.askComplete && g.item.qty > 0 ? g.askTotal / g.item.qty : null }));
  return { items, skippedOrbs };
}

/** Plan every item (duplicates merged), in entry order. */
export function planLiquidation(items: readonly LiquidateInput[], ctx: PlanContext): LiquidationPlan {
  const rows = mergeInputs(items).map((m) => planRow(m, ctx));
  return { rows, totals: planTotals(rows) };
}
