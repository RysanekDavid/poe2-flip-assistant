import type { PlanResponse } from "../../../lib/tools/craftPlannerContract";
import { PlanTimeoutError } from "./plan";

/**
 * The plan route's memo. Plans are pure given league prices (refreshed hourly), so a finished plan
 * is reused for `planTtlMs`, except one whose cheaper-target search was cut short: a quieter moment
 * may find more, so it is never stored. A request that ran past the time budget is refused again
 * for `timeoutTtlMs` without re-running: the planner shares the web server's only thread, and the
 * same heavy request clicked again must not stall everyone again.
 */

export interface PlanCache {
  /** The plan for `key`, computing it on a miss; throws PlanTimeoutError (fresh or remembered). */
  get: (key: string, compute: () => PlanResponse, nowMs?: number) => PlanResponse;
}

export interface PlanCacheOptions {
  planTtlMs: number;
  timeoutTtlMs: number;
  maxEntries: number;
}

/** Map keeps insertion order: past the cap, the oldest write goes. */
function remember<T>(map: Map<string, T>, key: string, value: T, max: number): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > max) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

export function createPlanCache(opts: PlanCacheOptions): PlanCache {
  if (!(opts.planTtlMs > 0 && opts.timeoutTtlMs > 0 && opts.maxEntries > 0)) throw new Error(`planCache: bad options ${JSON.stringify(opts)}`);
  const plans = new Map<string, { at: number; plan: PlanResponse }>();
  const timeouts = new Map<string, { at: number; error: PlanTimeoutError }>();
  return {
    get(key, compute, nowMs = Date.now()) {
      const failed = timeouts.get(key);
      if (failed && nowMs - failed.at < opts.timeoutTtlMs) throw failed.error;
      const hit = plans.get(key);
      if (hit && nowMs - hit.at < opts.planTtlMs) return hit.plan;
      let plan: PlanResponse;
      try {
        plan = compute();
      } catch (e: unknown) {
        if (e instanceof PlanTimeoutError) remember(timeouts, key, { at: nowMs, error: e }, opts.maxEntries);
        throw e;
      }
      if (!plan.alternativesTruncated) remember(plans, key, { at: nowMs, plan }, opts.maxEntries);
      return plan;
    },
  };
}
