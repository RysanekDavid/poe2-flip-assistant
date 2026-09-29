import type { PriceCheckBase, PriceConfidence, ValueOrigin } from "../../lib/priceCheckContract";
import type { ValueSource } from "../../lib/wealthContract";
import { planLiquidation } from "../wealth/plan";
import { hintFromRow } from "./hint";
import type { MarketAges, PriceCheckServices } from "./services";

/**
 * Currency / stackables: the exchange mid (GGG history, else poe.ninja) × the pasted stack, and the
 * Sell planner's own route for it — sell into the exchange after the gold fee, list, or hold.
 * Zero trade2 requests.
 */

/** The fields a kind module fills; check.ts adds league, rates, live gate and the craft link. */
export type PricedFields = Omit<PriceCheckBase, "league" | "exPerDiv" | "live" | "craftQuery">;

export function originOf(source: ValueSource): ValueOrigin | null {
  return source === "none" ? null : source;
}

export function ageOf(origin: ValueOrigin | null, ages: MarketAges): number | null {
  switch (origin) {
    case "cx":
      return ages.cxAgeMin;
    case "ninja":
      return ages.ninjaAgeMin;
    case "scout":
      return ages.scoutAgeMin;
    case "book":
    case "trade":
    case null:
      return null;
  }
}

export function confidenceOf(source: ValueSource, samples: number | null, ages: MarketAges): PriceConfidence {
  const origin = originOf(source);
  return { source: origin, samples, ageMin: ageOf(origin, ages) };
}

export async function priceStackable(name: string, qty: number, s: PriceCheckServices): Promise<PricedFields> {
  const key = name.toLowerCase();
  const { ctx, warnings } = await s.planContext([key]);
  const row = planLiquidation([{ name, qty }], ctx).rows[0];
  if (row == null) throw new Error(`price check: the planner returned no row for ${name}`);
  const line = ctx.ninjaByName.get(key) ?? null;
  return {
    name: row.name,
    baseType: row.name,
    icon: row.icon,
    qty,
    unitDiv: row.unitDiv,
    totalDiv: row.unitDiv == null ? null : row.unitDiv * qty,
    confidence: confidenceOf(row.valueSource, null, s.ages),
    hint: hintFromRow(row, { change7d: line?.change7d ?? null, volume: line?.volume ?? null }, s.rates.rates.exaltPerDivine),
    tradeUrl: null,
    warnings: [...warnings, ...row.warnings, ...(row.cx?.warnings ?? [])],
  };
}
