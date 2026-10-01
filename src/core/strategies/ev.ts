/*
 * Live EV of one deterministic conversion (3 × X → 1 × Y): what the outputs sell for minus what
 * the inputs cost, both at the league's latest exchange prices. Only a fully priced conversion has
 * an EV; one unpriced leg makes the whole number unknown, and the result names that leg rather than
 * counting it as 0. Pure, so test:strategies pins it without a database. The exchange's gold fee
 * and the spread between buying and selling are not modelled, so the UI calls it a gross margin.
 */

export interface PricedLeg {
  name: string;
  qty: number;
  /** Divine per item; null when the leg has no exchange price. */
  div: number | null;
}

export type ConversionEv =
  | { status: "priced"; cost_div: number; value_div: number; ev_div: number }
  | { status: "unpriced"; missing: string[] };

const unpricedNames = (legs: readonly PricedLeg[]): string[] => legs.filter((leg) => leg.div === null || !(leg.div > 0)).map((leg) => leg.name);

function total(legs: readonly PricedLeg[]): number {
  return legs.reduce((sum, leg) => {
    if (leg.div === null) throw new Error(`leg ${leg.name} has no price`);
    return sum + leg.qty * leg.div;
  }, 0);
}

/** EV in Divine per conversion, or which legs have no price (each name once, inputs first). */
export function conversionEv(inputs: readonly PricedLeg[], outputs: readonly PricedLeg[]): ConversionEv {
  if (inputs.length === 0 || outputs.length === 0) throw new Error("a conversion needs inputs and outputs");
  for (const leg of [...inputs, ...outputs]) {
    if (!Number.isInteger(leg.qty) || leg.qty < 1) throw new Error(`leg ${leg.name} has quantity ${leg.qty}`);
  }
  const missing = [...new Set([...unpricedNames(inputs), ...unpricedNames(outputs)])];
  if (missing.length > 0) return { status: "unpriced", missing };
  const cost = total(inputs);
  const value = total(outputs);
  return { status: "priced", cost_div: cost, value_div: value, ev_div: value - cost };
}

/** The margin as a share of the cost (0.25 = +25%); null when unpriced. */
export function evMargin(ev: ConversionEv): number | null {
  return ev.status === "priced" && ev.cost_div > 0 ? ev.ev_div / ev.cost_div : null;
}
