import { modSignature, summarizePrices, snipeVerdict, type SnipeResult } from "./priceBook";
import { observedPrices } from "../db/queries";
import { config } from "../config/env";

export interface ItemValuation extends SnipeResult {
  baseType: string;
  snipeUnderDiv: number | null; // ask at/below this would flag as a snipe
}

/**
 * Value an item from the price book and (if `askDiv` given) judge whether it's a snipe.
 * `askDiv = 0` → pure valuation. This is the function the AI agent and the price-check UI
 * call: "what's this worth, and what would I snipe it at?"
 */
export function evaluateItem(baseType: string, mods: string[], askDiv = 0): ItemValuation {
  const sig = modSignature(baseType, mods);
  const stats = summarizePrices(observedPrices(sig));
  const verdict = snipeVerdict(sig, askDiv, stats);
  const snipeUnderDiv = stats.median != null ? stats.median * (1 - config.snipe.discountPct / 100) : null;
  return { ...verdict, baseType, snipeUnderDiv };
}
