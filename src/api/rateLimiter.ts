import Bottleneck from "bottleneck";

/**
 * poe.ninja rate limit: max 12 requests / 5 minutes.
 *
 * 5min / 12 = 25000ms between requests. minTime enforces the floor;
 * reservoir caps absolute count per window as a second guard.
 */
export const ninjaLimiter = new Bottleneck({
  minTime: 25_000,
  maxConcurrent: 1,
  reservoir: 12,
  reservoirRefreshAmount: 12,
  reservoirRefreshInterval: 5 * 60 * 1000,
});
