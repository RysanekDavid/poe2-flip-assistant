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
  if (r.searches === 0 && r.errors.length === 0 && r.fatal == null) return; // nothing due, or the hour's cap is spent
  console.log(`[unique-trade] ${r.league}: ${r.priced.length} priced, ${r.tooFew.length} too few listings, ${r.errors.length} failed · ${r.meter.search} searches, ${r.meter.fetch} fetches · ${r.candidates} due`);
  if (r.errors.length > 0) console.warn(`[unique-trade] ${r.errors.join("; ")}`);
  if (r.deferred != null) console.warn(`[unique-trade] deferred to the next tick — ${r.deferred}`);
  if (r.fatal != null) console.error(`[unique-trade] stopped — ${r.fatal}`);
}

/** Start the tick (plus one now). `owner` is resolved per tick: the cookie may be saved or replaced later. */
export function startUniqueTradeValues(owner: () => ScanOwner): void {
  if (!config.uniqueTradeValues.enabled) return;
  console.log(`[unique-trade] ≤${config.uniqueTradeValues.maxSearchesPerHour} searches/h every ${UNIQUE_TRADE_TICK_MIN}m, each unique refreshed ≤ every ${config.uniqueTradeValues.refreshHours}h`);
  let running = false;
  const run = (): void => {
    if (running) {
      console.warn("[unique-trade] tick skipped — previous tick still running");
      return;
    }
    running = true;
    withHeartbeat("unique-trade-values", "", () => tickUniqueTrade(owner()), { problem: uniqueTradeOutcomeProblem })
      .then(logOutcome)
      .catch((e: unknown) => console.error("[unique-trade] tick failed:", errText(e)))
      .finally(() => {
        running = false;
      });
  };
  setInterval(run, UNIQUE_TRADE_TICK_MIN * 60_000);
  run();
}
