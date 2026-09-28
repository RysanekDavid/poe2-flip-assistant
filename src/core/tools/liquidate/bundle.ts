import type { LiquidateBundle, LiquidationPlan, PlanRow } from "../../../lib/tools/liquidateContract";
import type { Currency, ExchangeRates } from "../../priceEngine";
import { denominateIn, pickUnit, type Denom } from "../../treasury";
import { noteAmount } from "./tradeRoute";

/**
 * Copy-paste text for the rows the plan sends to trade: WTS lines for trade chat and one
 * stash-tab price note per item. Text only — nothing is ever posted or whispered for you. Pure.
 * Exchange rows are left out: an exchange order is placed in the exchange UI, not advertised.
 */

/**
 * Longest WTS line we emit. PoE2's chat input limit is not documented anywhere we could verify;
 * 240 stays under the 255-character cap commonly reported for PoE1 chat.
 */
export const WTS_MAX_CHARS = 240;

const CHAT_UNIT: Readonly<Record<Currency, string>> = { DIVINE: "div", EXALT: "ex", CHAOS: "chaos" };
/** Value ladder, cheapest first — the order treasury.pickUnit climbs. */
const LADDER: readonly Currency[] = ["EXALT", "CHAOS", "DIVINE"];

const unitsPerDivine = (c: Currency, r: ExchangeRates): number =>
  c === "DIVINE" ? 1 : c === "EXALT" ? r.exaltPerDivine : r.chaosPerDivine;

export function chatPrice(d: Denom): string {
  return `${noteAmount(d)} ${CHAT_UNIT[d.unit]}`;
}

/** A total keeps one decimal in Divines — rounding 12.5 div to 13 would contradict the unit price. */
function chatTotal(d: Denom): string {
  const amount = d.unit === "DIVINE" ? Math.round(d.amount * 10) / 10 : Math.round(d.amount);
  return `${amount} ${CHAT_UNIT[d.unit]}`;
}

/**
 * The order total, from the SAME rounded unit price the note shows (qty × note amount), kept in the
 * note's currency while that stays within treasury's item cap, else climbed up the ladder.
 */
export function orderTotal(unit: Denom, qty: number, rates: ExchangeRates): Denom {
  const inUnit: Denom = { amount: noteAmount(unit) * qty, unit: unit.unit };
  const totalDiv = inUnit.amount / unitsPerDivine(unit.unit, rates);
  const target = pickUnit(totalDiv, rates);
  return LADDER.indexOf(target) <= LADDER.indexOf(unit.unit) ? inUnit : denominateIn(totalDiv, target, rates);
}

type TradeRow = PlanRow & { trade: NonNullable<PlanRow["trade"]> };

const isTradeRow = (r: PlanRow): r is TradeRow => r.recommended === "trade" && r.trade != null;

/** "10x Kulemak's Invitation @ 50 chaos (500 chaos)"; a single item drops the count and the total. */
function wtsPart(r: TradeRow, rates: ExchangeRates): string {
  const unit = chatPrice(r.trade.noteDenom);
  if (r.qty === 1) return `${r.name} @ ${unit}`;
  return `${r.qty}x ${r.name} @ ${unit} (${chatTotal(orderTotal(r.trade.noteDenom, r.qty, rates))})`;
}

/** Pack parts into "WTS a · b" lines of at most `max` characters; a part too long alone gets its own line. */
export function packLines(parts: readonly string[], max: number = WTS_MAX_CHARS): string[] {
  const lines: string[] = [];
  let current = "";
  for (const part of parts) {
    const next = current === "" ? `WTS ${part}` : `${current} · ${part}`;
    if (current !== "" && next.length > max) {
      lines.push(current);
      current = `WTS ${part}`;
    } else {
      current = next;
    }
  }
  if (current !== "") lines.push(current);
  return lines;
}

export function bundleText(plan: LiquidationPlan, rates: ExchangeRates): LiquidateBundle {
  const rows = plan.rows.filter(isTradeRow);
  return {
    lines: packLines(rows.map((r) => wtsPart(r, rates))),
    notes: rows.map((r) => ({ name: r.name, note: r.trade.note })),
  };
}
