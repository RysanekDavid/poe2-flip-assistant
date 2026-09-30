import { config } from "../config/env";
import { withHeartbeat } from "../core/heartbeat";
import { UNIQUE_TRADE_TICK_MIN } from "../core/subsystems";
import { tickUniqueTrade, uniqueTradeOutcomeProblem, type ScanOwner, type UniqueTradeOutcome } from "../core/uniqueTrade/live";

/**
 * trade2 fallback prices for the curated boss uniques poe2scout does not price. Ticks every 10 min;
 * each tick spends at most its share of the hourly search cap (core/uniqueTrade), so with ~50
 * candidates every one is priced within a working day and then refreshed daily. One tick at a
 * time: a tick that finds the previous one still waiting on the shared trade2 pace is skipped.
 */
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function logOutcome(o: UniqueTradeOutcome): void {
  if (o.kind === "skipped") {
    console.warn(`[unique-trade] skipped — ${o.reason}`);
    return;
  }
  const r = o.report;
  if (r.searches === 0 && r.catalogMisses.length === 0 && r.deferred == null) return; // nothing due, or the hour's cap is spent
  console.log(`[unique-trade] ${r.league}: ${r.priced.length} priced, ${r.tooFew.length} too few listings, ${r.errors.length} failed · ${r.meter.search} searches, ${r.meter.fetch} fetches · ${r.candidates} due`);
  if (r.errors.length > 0) console.warn(`[unique-trade] ${r.errors.join("; ")}`);
  if (r.catalogMisses.length > 0) console.error(`[unique-trade] not in trade2's unique catalog: ${r.catalogMisses.join(", ")}`);
  if (r.deferred != null) console.warn(`[unique-trade] deferred to the next tick — ${r.deferred}`);
  if (r.fatal != null) console.error(`[unique-trade] stopped — ${r.fatal}`);
}

/**
 * No owner cookie is a setup state, not a failure: like autosnipe and craft-margin the job stays
 * silently off (no heartbeat write, so the row keeps reading "never") with one warning — at boot,
 * and again only if a saved cookie is later removed. Unlike them it re-arms by itself once a
 * cookie is saved, because the owner is resolved every tick. Returns whether the tick may run.
 */
export function createCookieGate(warn: (msg: string) => void): (owner: ScanOwner) => boolean {
  let warned = false;
  return (owner) => {
    if (owner.cred != null) {
      warned = false;
      return true;
    }
    if (!warned) warn("[unique-trade] owner POESESSID missing — trade2 unique prices stay off until one is saved in Settings");
    warned = true;
    return false;
  };
}

/** Start the tick (plus one now). `owner` is resolved per tick: the cookie may be saved or replaced later. */
export function startUniqueTradeValues(owner: () => ScanOwner): void {
  if (!config.uniqueTradeValues.enabled) return;
  console.log(`[unique-trade] ≤${config.uniqueTradeValues.maxSearchesPerHour} searches/h every ${UNIQUE_TRADE_TICK_MIN}m, each unique refreshed ≤ every ${config.uniqueTradeValues.refreshHours}h`);
  const hasCookie = createCookieGate((msg) => console.warn(msg));
  let running = false;
  const run = (): void => {
    if (running) {
      console.warn("[unique-trade] tick skipped — previous tick still running");
      return;
    }
    let current: ScanOwner;
    try {
      current = owner();
    } catch (e: unknown) {
      // a cred that cannot be read (DB busy, decrypt failure) is a real failure: red, not silence
      withHeartbeat("unique-trade-values", "", () => Promise.reject(e)).catch((err: unknown) => console.error("[unique-trade] owner cred unreadable:", errText(err)));
      return;
    }
    if (!hasCookie(current)) return;
    running = true;
    withHeartbeat("unique-trade-values", "", () => tickUniqueTrade(current), { problem: uniqueTradeOutcomeProblem })
      .then(logOutcome)
      .catch((e: unknown) => console.error("[unique-trade] tick failed:", errText(e)))
      .finally(() => {
        running = false;
      });
  };
  setInterval(run, UNIQUE_TRADE_TICK_MIN * 60_000);
  run();
}
