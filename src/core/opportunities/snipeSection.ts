import type { Budget, SnipeSection } from "../../lib/opportunitiesContract";
import type { NearMiss } from "../../lib/snipeScanContract";
import { NEAR_MISS_KEEP, NEAR_MISS_LIMIT, selectNearMisses, type NearMissLimits } from "../snipeNearMiss";
import { withinBudget } from "./budget";
import { LIVE_SNIPES_LIMIT, selectLiveSnipes, type SnipeAlertRow } from "./liveSnipes";

export interface SnipeSectionInput {
  alerts: readonly SnipeAlertRow[];
  gone: ReadonlySet<string>;
  /** The last scan report's near-misses (already carried across scans), or [] with none. */
  nearMisses: readonly NearMiss[];
  limits: NearMissLimits;
  budget: Budget;
  viewerLeague: string;
  scannerEnabled: boolean;
  reportError: string | null;
  nowMs: number;
}

/**
 * Live snipe cards plus up to NEAR_MISS_LIMIT near-misses, both inside the budget. A near-miss that
 * is also a live card (a later scan cleared it) is shown once, as the card.
 */
export function buildSnipeSection(i: SnipeSectionInput): SnipeSection {
  // every live one first, so the budget filter runs before the display limit
  const live = selectLiveSnipes(i.alerts, i.gone, { viewerLeague: i.viewerLeague, freshMinutes: i.limits.gate.freshMinutes, nowMs: i.nowMs, limit: Infinity });
  const cards = withinBudget(live, (s) => s.card.priceDiv, i.budget);
  const carded = new Set(live.map((s) => s.listingId));
  const fresh = selectNearMisses(i.nearMisses, i.nowMs, i.limits, NEAR_MISS_KEEP).filter((n) => !carded.has(n.listingId) && !i.gone.has(n.listingId));
  const near = withinBudget(fresh, (n) => n.priceDiv, i.budget);
  return {
    cards: cards.kept.slice(0, LIVE_SNIPES_LIMIT),
    nearMisses: near.kept.slice(0, NEAR_MISS_LIMIT),
    overBudget: cards.hidden + near.hidden,
    scannerEnabled: i.scannerEnabled,
    reportError: i.reportError,
  };
}
