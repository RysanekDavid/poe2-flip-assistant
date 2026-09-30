import { config } from "../config/env";
import type { DemandItem } from "../api/scoutDemand";

/**
 * Auto-pick which items are worth watching for snipes — NO manual entry. The user never
 * types a search; we rank the market for the "medium-volume sweet spot":
 *   - valuable enough to bother (value ≥ minTargetDiv)
 *   - NOT whale/mirror tier — can't afford to buy or resell fast (value ≤ maxTargetDiv)
 *   - liquid enough to resell (quantity ≥ minListings); sell-through then SCORES speed, it does not gate
 *   - NOT so liquid that bots own it and fair prices vanish in <1s (quantity ≤ maxListings)
 *   - enough price history to trust the value (samples ≥ minSampleLogs)
 *
 * Source = poe2scout demand (uniques with live listing count + sell-through proxy + momentum). The agent
 * rotates live searches over the top targets; a listing far below value fires a snipe.
 */
export interface SnipeTarget {
  name: string;
  type: string; // base type
  icon: string | null; // poe2scout art — the same icon the demand board rows use
  valueDiv: number; // current market value
  quantity: number; // live listings (volume proxy)
  sellThrough: number | null; // avg share of listings gone per scrape (0..1) — resell-speed proxy; null = unknown
  momentumPct: number | null; // price trend; null = unknown
  score: number; // ranking score
  reason: string;
}

function targetReason(valueDiv: number, quantity: number, sellThrough: number | null): string {
  const base = `~${valueDiv.toFixed(0)} Div · ${quantity} listed`;
  return sellThrough == null ? base : `${base} · ~${(sellThrough * 100).toFixed(0)}% of listings leave per scrape`;
}

export function rankSnipeTargets(items: DemandItem[], exaltPerDivine: number): SnipeTarget[] {
  if (!(exaltPerDivine > 0)) return [];
  const { minListings, maxListings, minTargetDiv, maxTargetDiv, minSampleLogs } = config.snipe;

  return items
    .map((it) => {
      const valueDiv = it.priceExalt / exaltPerDivine;
      return { it, valueDiv };
    })
    .filter(
      ({ it, valueDiv }) =>
        valueDiv >= minTargetDiv &&
        valueDiv <= maxTargetDiv &&
        it.quantity >= minListings &&
        it.quantity <= maxListings &&
        it.samples >= minSampleLogs,
    )
    .map(({ it, valueDiv }) => {
      // reward value × resell-speed; a mild bonus for rising price (snipe resells into a pump).
      // Resell speed = the sell-through proxy, NOT the listing count: a big static supply means
      // slow resale, which the old listing-count score rewarded. An unknown factor earns no bonus
      // (it only ranks, it is never displayed as a number).
      const score = valueDiv * (1 + 10 * (it.sellThrough ?? 0)) * (1 + Math.max(it.momentumPct ?? 0, 0) / 200);
      return {
        name: it.name,
        type: it.type,
        icon: it.icon,
        valueDiv,
        quantity: it.quantity,
        sellThrough: it.sellThrough,
        momentumPct: it.momentumPct,
        score,
        reason: targetReason(valueDiv, it.quantity, it.sellThrough),
      };
    })
    .sort((a, b) => b.score - a.score);
}
