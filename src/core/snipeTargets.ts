import { config } from "../config/env";
import type { DemandItem } from "../api/scoutClient";

/**
 * Auto-pick which items are worth watching for snipes — NO manual entry. The user never
 * types a search; we rank the market for the "medium-volume sweet spot":
 *   - valuable enough to bother (value ≥ minTargetDiv)
 *   - NOT whale/mirror tier — can't afford to buy or resell fast (value ≤ maxTargetDiv)
 *   - liquid enough to resell (quantity ≥ minListings, some listings actually leave: sellThrough > 0)
 *   - NOT so liquid that bots own it and fair prices vanish in <1s (quantity ≤ maxListings)
 *   - enough price history to trust the value (samples ≥ minSampleLogs)
 *
 * Source = poe2scout demand (uniques with live listing count + sell-through proxy + momentum). The agent
 * rotates live searches over the top targets; a listing far below value fires a snipe.
 */
export interface SnipeTarget {
  name: string;
  type: string; // base type
  valueDiv: number; // current market value
  quantity: number; // live listings (volume proxy)
  sellThrough: number; // avg share of listings gone per scrape (0..1) — resell-speed proxy
  momentumPct: number; // price trend
  score: number; // ranking score
  reason: string;
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
        it.sellThrough > 0 &&
        it.samples >= minSampleLogs,
    )
    .map(({ it, valueDiv }) => {
      // reward value × resell-speed; a mild bonus for rising price (snipe resells into a pump).
      // Resell speed = the sell-through proxy, NOT the listing count: a big static supply means
      // slow resale, which the old listing-count score rewarded.
      const score = valueDiv * (1 + 10 * it.sellThrough) * (1 + Math.max(it.momentumPct, 0) / 200);
      return {
        name: it.name,
        type: it.type,
        valueDiv,
        quantity: it.quantity,
        sellThrough: it.sellThrough,
        momentumPct: it.momentumPct,
        score,
        reason: `~${valueDiv.toFixed(0)} Div · ${it.quantity} listed · ~${(it.sellThrough * 100).toFixed(0)}% of listings leave per scrape`,
      };
    })
    .sort((a, b) => b.score - a.score);
}
