/*
 * Pure helpers behind the roll-and-sell and trade-method cards (Craft › Roll & sell, Trade ›
 * Methods): conversion labels, the EV text and its sign, the best priced conversions, and the
 * break-even maths of a gamble with a known loss chance. No React, so test:strategies pins them.
 */
import { fmtDivOrEx } from "../../../lib/format";
import type { ConversionEvView, ConversionView } from "../../../lib/strategiesContract";
import type { ItemRarity, SellUnit } from "../../../core/strategies/schema";

export const SELL_UNIT_LABEL: Record<SellUnit, string> = { single: "Sell one by one", set_of_3: "Sell in sets of 3" };
export const SELL_UNIT_TIP: Record<SellUnit, string> = {
  single: "Buyers want single items.",
  set_of_3: "A map takes up to three tablets, so buyers want matched sets of three.",
};
export const RARITY_LABEL: Record<ItemRarity, string> = { normal: "Normal", magic: "Magic", rare: "Rare" };

/** "3 × Lesser Desert Rune → Desert Rune": a quantity of 1 is not printed. */
export function conversionLabel(conversion: Pick<ConversionView, "inputs" | "outputs">): string {
  const side = (legs: ConversionView["inputs"]): string => legs.map((leg) => (leg.qty === 1 ? leg.ref.name : `${leg.qty} × ${leg.ref.name}`)).join(" + ");
  return `${side(conversion.inputs)} → ${side(conversion.outputs)}`;
}

/** A signed Divine/Exalted amount: "+12 ex", "−0.40 div"; a zero margin reads "0". */
export function fmtSignedDivOrEx(div: number, exPerDiv: number | null): string {
  if (div === 0) return "0";
  const amount = fmtDivOrEx(Math.abs(div), exPerDiv ?? 0);
  return div > 0 ? `+${amount}` : `−${amount}`;
}

export type EvTone = "up" | "down" | "flat" | "unpriced";

export function evTone(ev: ConversionEvView): EvTone {
  if (ev.status === "unpriced") return "unpriced";
  if (ev.ev_div === 0) return "flat";
  return ev.ev_div > 0 ? "up" : "down";
}

/** The EV cell: a signed amount, or "—" with the unpriced legs named in the hover text. */
export function evText(ev: ConversionEvView, exPerDiv: number | null): { text: string; tip: string } {
  if (ev.status === "unpriced") return { text: "—", tip: `No EV: no exchange price for ${ev.missing.join(", ")}.` };
  const cost = fmtDivOrEx(ev.cost_div, exPerDiv ?? 0);
  const value = fmtDivOrEx(ev.value_div, exPerDiv ?? 0);
  return {
    text: fmtSignedDivOrEx(ev.ev_div, exPerDiv),
    tip: `Inputs ${cost} → output ${value} at today's poe.ninja exchange prices; the gold fee and the buy/sell spread are not taken off.`,
  };
}

/** Priced conversions, best EV first; unpriced ones after, in data order. */
export function rankConversions(conversions: readonly ConversionView[]): ConversionView[] {
  const priced = conversions.filter((c) => c.ev.status === "priced");
  const unpriced = conversions.filter((c) => c.ev.status === "unpriced");
  const evOf = (c: ConversionView): number => (c.ev.status === "priced" ? c.ev.ev_div : 0);
  return [...priced.sort((a, b) => evOf(b) - evOf(a)), ...unpriced];
}

export interface ProfitHeadline {
  tone: "profit" | "loss" | "unpriced";
  text: string;
  tip: string;
  /** The best conversion's EV, for the pill when it pays. */
  best: ConversionView | null;
}

/**
 * A card's headline is profit only as live prices show it: the best fully priced conversion when
 * it pays, a muted "not profitable at current prices" when none does, and "—" when nothing is
 * priced. A creator's quoted profit never becomes a headline.
 */
export function profitHeadline(conversions: readonly ConversionView[], exPerDiv: number | null, unpricedTip: string): ProfitHeadline {
  const best = rankConversions(conversions)[0] ?? null;
  if (best === null || best.ev.status === "unpriced") {
    return { tone: "unpriced", text: "—", tip: best ? evText(best.ev, exPerDiv).tip : unpricedTip, best: null };
  }
  if (best.ev.ev_div > 0) return { tone: "profit", text: evText(best.ev, exPerDiv).text, tip: evText(best.ev, exPerDiv).tip, best };
  return { tone: "loss", text: "not profitable at current prices", tip: `Best step today: ${conversionLabel(best)} ${evText(best.ev, exPerDiv).text}. ${evText(best.ev, exPerDiv).tip}`, best };
}

/** "4 of 39 priced steps pay today" — the card's headline for a ladder; null when it has no conversion. */
export function ladderSummary(conversions: readonly ConversionView[]): string | null {
  if (conversions.length === 0) return null;
  const priced = conversions.filter((c) => c.ev.status === "priced");
  const paying = priced.filter((c) => c.ev.status === "priced" && c.ev.ev_div > 0).length;
  if (priced.length === 0) return `none of ${conversions.length} steps is priced yet`;
  return `${paying} of ${priced.length} priced steps pay today`;
}

/**
 * Expected cost of one attempt at a gamble that destroys the item with `lossChance`: the priced
 * consumables plus the expected loss of the item itself. Null when a consumable is unpriced or the
 * item value is not a positive number — never a cost that silently counts an unknown as 0.
 */
export function attemptCost(lossChance: number, itemDiv: number, consumables: readonly (number | null)[]): number | null {
  if (!(lossChance >= 0 && lossChance <= 1) || !(itemDiv > 0)) return null;
  if (consumables.some((div) => div === null || !(div > 0))) return null;
  return consumables.reduce<number>((sum, div) => sum + (div ?? 0), 0) + lossChance * itemDiv;
}
