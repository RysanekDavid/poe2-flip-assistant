import type { LiquidateBundle, LiquidationPlan, PlanRow } from "../../../lib/tools/liquidateContract";
import type { Currency, ExchangeRates } from "../../priceEngine";
import { denominate, type Denom } from "../../treasury";
import { noteAmount } from "./tradeRoute";

/**
 * Copy-paste text for the rows the plan sends to trade: one WTS line for trade chat and one
 * stash-tab price note per item. Text only — nothing is ever posted or whispered for you. Pure.
 * Exchange rows are left out: an exchange order is placed in the exchange UI, not advertised.
 */

const CHAT_UNIT: Readonly<Record<Currency, string>> = { DIVINE: "div", EXALT: "ex", CHAOS: "chaos" };

export function chatPrice(d: Denom): string {
  return `${noteAmount(d)} ${CHAT_UNIT[d.unit]}`;
}

type TradeRow = PlanRow & { trade: NonNullable<PlanRow["trade"]> };

const isTradeRow = (r: PlanRow): r is TradeRow => r.recommended === "trade" && r.trade != null;

/** "10x Kulemak's Invitation @ 2.5 div (25 div)"; a single item drops the count and the total. */
function wtsPart(r: TradeRow, rates: ExchangeRates): string {
  const unit = chatPrice(r.trade.noteDenom);
  if (r.qty === 1) return `${r.name} @ ${unit}`;
  const total = chatPrice(denominate(r.trade.fairDiv * r.qty, rates));
  return `${r.qty}x ${r.name} @ ${unit} (${total})`;
}

export function bundleText(plan: LiquidationPlan, rates: ExchangeRates): LiquidateBundle {
  const rows = plan.rows.filter(isTradeRow);
  return {
    whisper: rows.length === 0 ? "" : `WTS ${rows.map((r) => wtsPart(r, rates)).join(" · ")}`,
    notes: rows.map((r) => ({ name: r.name, note: r.trade.note })),
  };
}
