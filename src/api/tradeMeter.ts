import { AsyncLocalStorage } from "node:async_hooks";
import type { TradeEndpoint } from "./tradeRateLimit";

/**
 * Scan-local trade2 request meter. A scan runs its work inside `metered()`, and every trade2 call
 * made from that async context (and only that one) is counted. The first budget version read a
 * process-global counter, so hunt/craft/balance requests queued on the shared limiter ate the
 * autosnipe budget — with two active hunts it valued nothing, ever.
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

/** Called by the trade client for every request it issues. No-op outside a metered context. */
export function countRequest(kind: TradeEndpoint): void {
  const m = storage.getStore();
  if (m) m[kind]++;
}
