import { AsyncLocalStorage } from "node:async_hooks";
import type Bottleneck from "bottleneck";
import type { TradeEndpoint } from "./tradeRateLimit";

/**
 * Scan-local trade2 request meter. A scan runs its work inside `metered()`, and every trade2 call
 * made from that async context (and only that one) is counted. The first budget version read a
 * process-global counter, so hunt/craft/balance requests queued on the shared limiter ate the
 * autosnipe budget — with two active hunts it valued nothing, ever.
 *
 * The meter must be read SYNCHRONOUSLY at the call site, before the request enters the limiter
 * queue: Bottleneck starts a queued job from the completion chain of whichever job ran before it,
 * so inside the job the AsyncLocalStorage store belongs to that other consumer. Reading it there
 * charged a hunt's searches to the scan (starving it) and the scan's to nobody (budget unenforced).
 */
export interface TradeMeter {
  search: number;
  fetch: number;
}

const storage = new AsyncLocalStorage<TradeMeter>();

export const newMeter = (): TradeMeter => ({ search: 0, fetch: 0 });

/** Run `fn` with `meter` counting the trade2 requests it (and only it) issues. */
export function metered<T>(meter: TradeMeter, fn: () => Promise<T>): Promise<T> {
  return storage.run(meter, fn);
}

/**
 * Schedule a trade2 job on `limiter`, charging it to the CALLER's meter (captured now, not when
 * the job starts). The job calls `count()` once the request is actually going out, so a request
 * the budget governor refuses is never charged.
 */
export function scheduleMetered<T>(
  limiter: Bottleneck,
  kind: TradeEndpoint,
  job: (count: () => void) => Promise<T>,
): Promise<T> {
  const meter = storage.getStore();
  const count = (): void => {
    if (meter) meter[kind]++;
  };
  return limiter.schedule(() => job(count));
}
