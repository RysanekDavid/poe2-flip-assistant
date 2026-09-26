import { z } from "zod";
import type { PricedItem } from "../api/types";
import { config } from "../config/env";
import { getDb } from "../db/database";
import { priceHistory } from "../db/marketQueries";
import { getTrendState, setTrendState } from "../db/trendStateQueries";
import { analyzeTrend, type TrendSignal } from "./trendDetector";

/**
 * TREND/SPIKE alerts fire on a state CHANGE, not on every cycle a condition keeps holding.
 *
 * The signals are level conditions (e.g. "7d > +50% and 24h > 0"), so a pumping item satisfied
 * them for days and re-alerted every cooldown window — 44 alerts for one item in 4 days
 * (docs/research/flip-snipe-audit-2026-09-25.md). Now an item alerts when it ENTERS BUY, SELL or
 * SPIKE (or moves between them) and stays quiet while it holds; dropping back to NONE re-arms it.
 *
 * State is per market item per league — not per user — so it is evaluated once per sweep and the
 * same event is delivered to every viewer watching that item.
 */

const TrendAlertStateSchema = z.enum(["BUY", "SELL", "SPIKE", "NONE"]);
export type TrendAlertState = z.infer<typeof TrendAlertStateSchema>;

export interface TrendEvent {
  type: "TREND" | "SPIKE";
  message: string;
  value: number;
  threshold: number;
}

/** The alertable state a signal represents. SPIKE only when no BUY/SELL call applies. */
export function trendAlertState(trend: TrendSignal, change7d: number | null, spikePct: number): TrendAlertState {
  if (trend.signal === "BUY" || trend.signal === "SELL") return trend.signal;
  if (change7d != null && change7d >= spikePct) return "SPIKE";
  return "NONE";
}

/** Fire only when entering an alertable state that differs from the recorded one. */
export function isTransition(prev: TrendAlertState | null, next: TrendAlertState): boolean {
  return next !== "NONE" && next !== prev;
}

function parseState(raw: string | null): TrendAlertState | null {
  if (raw == null) return null;
  const parsed = TrendAlertStateSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`trend_state holds unknown state "${raw}"`);
  return parsed.data;
}

function eventFor(state: TrendAlertState, trend: TrendSignal, change7d: number | null): TrendEvent | null {
  const threshold = config.thresholds.change7dPct;
  if (state === "BUY" || state === "SELL") {
    return { type: "TREND", message: `${state}: ${trend.reason}`, value: trend.change7d, threshold };
  }
  if (state === "SPIKE" && change7d != null) {
    return { type: "SPIKE", message: `+${change7d.toFixed(0)}% 7d — spiking, watch for a flip window`, value: change7d, threshold };
  }
  return null;
}

/**
 * Advance EVERY market item's state for one sweep (one transaction) and return the transitions
 * that earn an alert, by item id. Alerts go only to watchers; the state machine covers all items.
 */
export function advanceTrends(league: string, items: readonly PricedItem[]): Map<string, TrendEvent> {
  const events = new Map<string, TrendEvent>();
  getDb().transaction(() => {
    for (const item of items) {
      const event = advanceTrend(league, item.itemId, item.itemName, item);
      if (event != null) events.set(item.itemId, event);
    }
  })();
  return events;
}

/**
 * Advance one item's recorded state and return the alert its transition earns, if any.
 * The new state is always recorded, so a NONE in between re-arms the next entry.
 */
export function advanceTrend(league: string, itemId: string, itemName: string, current: PricedItem): TrendEvent | null {
  const history = priceHistory(league, itemId, 168);
  const trend = analyzeTrend(itemName, current.change7d, history, current.volume);
  const next = trendAlertState(trend, current.change7d, config.thresholds.change7dPct);
  const prev = parseState(getTrendState(league, itemId));
  if (prev !== next) setTrendState(league, itemId, next);
  return isTransition(prev, next) ? eventFor(next, trend, current.change7d) : null;
}
