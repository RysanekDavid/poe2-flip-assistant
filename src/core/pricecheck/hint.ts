import type { SellHint } from "../../lib/priceCheckContract";
import type { PlanRow } from "../../lib/wealthContract";
import type { ExchangeRates } from "../priceEngine";
import { RAW_ORBS } from "../wealth/plan";
import { sellVerdict } from "../wealth/sellVerdict";
import { tradeListingQuote } from "../wealth/tradeRoute";

/**
 * The sell hint under a price check, built from the Stash › Sell planner's own pieces
 * (planLiquidation rows, sellVerdict, tradeListingQuote) so a price check and the Sell column can
 * never disagree about the same item. Pure.
 */

const EMPTY: Omit<SellHint, "action" | "reason"> = {
  cxFastTotalDiv: null,
  cxPatientTotalDiv: null,
  feeTotalDiv: null,
  tier: null,
  etaHours: null,
  listAtDiv: null,
  quickDiv: null,
  patientDiv: null,
  note: null,
  competitionNote: null,
};

/** Nothing priced a tradeable item yet — the two ways a price check can still get a number. */
export const UNPRICED_TRADE = "no market price — value it live (1 search) or open the trade link";

export function noHint(reason: string): SellHint {
  return { ...EMPTY, action: "none", reason };
}

/**
 * A planned row → sell now on the exchange, list at fair, or hold a rising liquid market.
 * `unpricedReason` replaces the planner's own unpriced text, which points at a Stash reprice check.
 */
export function hintFromRow(
  row: PlanRow,
  ninja: { change7d: number | null; volume: number | null },
  exPerDiv: number,
  unpricedReason: string,
): SellHint {
  if (RAW_ORBS.has(row.name.trim().toLowerCase())) return noHint("raw currency — it is what you sell into");
  const v = sellVerdict({ row, askDiv: null, change7d: ninja.change7d, volume: ninja.volume, comp: null, exPerDiv });
  const trade = row.trade;
  const priced = {
    ...EMPTY,
    cxFastTotalDiv: row.recommended === "cx" ? row.fastTotalDiv : null,
    cxPatientTotalDiv: row.recommended === "cx" ? row.patientTotalDiv : null,
    feeTotalDiv: row.feeTotalDiv,
    tier: row.cx?.tier ?? null,
    etaHours: row.cx?.etaHours ?? null,
    listAtDiv: trade?.fairDiv ?? null,
    quickDiv: trade?.quickDiv ?? null,
    patientDiv: trade?.patientDiv ?? null,
    note: trade?.note ?? null,
    competitionNote: trade?.competitionNote ?? null,
  };
  switch (v.verdict) {
    case "unpriced":
      return noHint(unpricedReason);
    case "hold":
      return { ...priced, action: "hold", reason: v.reason };
    case "sell-cx":
      return { ...priced, action: "sell-cx", reason: v.reason };
    case "list":
    case "reprice":
      // no ask of yours to reprice in a price check: both mean "list at fair"
      return { ...priced, action: "list", reason: v.reason };
  }
}

/** A trade value (book reference or live comparables) → list one unit at that fair price; `emptyReason` when there is none. */
export function hintFromValue(valueDiv: number | null, rates: ExchangeRates, what: string, emptyReason: string): SellHint {
  if (valueDiv == null || !(valueDiv > 0)) return noHint(emptyReason);
  const q = tradeListingQuote(valueDiv, 1, null, rates);
  return {
    ...EMPTY,
    action: "list",
    reason: `list near the ${what}`,
    listAtDiv: q.fairDiv,
    quickDiv: q.quickDiv,
    patientDiv: q.patientDiv,
    note: q.note,
  };
}
