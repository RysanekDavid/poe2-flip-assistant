import { CX_HOUR_SECONDS } from "../../api/cxClient";
import { config } from "../../config/env";
import { cxMarketsAt, ingestedMarketCount, newestCxHour } from "../../db/cxMarketQueries";
import { outcomeCounts, pendingOutcomes, recordPublished, resolveOutcome, type PendingOutcome } from "../../db/cxOutcomeQueries";
import { judgePair } from "./cxEdges";
import { leagueStats } from "./cxItemMarkets";
import { baseMarkets, hourRates, modelParams, quotesByItem, type ModelParams } from "./cxMarketModel";
import { isPublishable } from "./cxPersistence";

/**
 * The outcome loop: did a published edge still hold an hour later?
 *
 * Every edge that passes the rank gate at a league's newest digest hour is logged. When the NEXT
 * hour's digest is stored, the same direction (buy quote → sell quote) is re-judged on it with
 * the same guards: a valid net edge ≥ the threshold is a hit, anything else — a guard failure,
 * a leg that stopped trading, a shrunken edge — is a miss. The rolling hit rate is the only
 * ground truth the thresholds can be tuned against.
 */

export const HIT_RATE_DAYS = 7;

export interface HitRate {
  hits: number;
  resolved: number;
  days: number;
}

/** One pending edge judged on the next hour's markets. */
function judgeNext(p: PendingOutcome, quotes: ReturnType<typeof quotesByItem>, rates: ReturnType<typeof hourRates>, params: ModelParams) {
  const judged = judgePair(p.item, p.buy_quote, p.sell_quote, quotes.get(p.item) ?? [], rates, params);
  const valid = judged != null && judged.issue == null;
  const hit = valid && judged.edge.netPct >= config.cx.edgeThresholdPct;
  return { netPct: judged?.edge.netPct ?? null, outcome: hit ? ("hit" as const) : ("miss" as const) };
}

/** Resolve every pending edge whose next hour is now stored. Returns how many were resolved. */
function resolvePending(league: string, params: ModelParams): number {
  const byHour = new Map<number, PendingOutcome[]>();
  for (const p of pendingOutcomes(league)) byHour.set(p.hour, [...(byHour.get(p.hour) ?? []), p]);
  let resolved = 0;
  for (const [hour, list] of byHour) {
    const next = hour + CX_HOUR_SECONDS;
    if (ingestedMarketCount(league, next) == null) continue; // next hour not stored yet
    const rows = cxMarketsAt(league, next);
    const rates = hourRates(baseMarkets(rows));
    const quotes = quotesByItem(rows, rates, params);
    for (const p of list) {
      const r = judgeNext(p, quotes, rates, params);
      resolveOutcome(league, p.item, p.hour, r.netPct, r.outcome);
      resolved++;
    }
  }
  return resolved;
}

/** Log the edges that pass the rank gate at the league's newest hour. Returns how many were new. */
function publishNewest(league: string): number {
  const newestHour = newestCxHour(league);
  if (newestHour == null) return 0;
  const edges = [...leagueStats(league, newestHour)]
    .filter(([, s]) => isPublishable(s, config.cx.liquidityRiskyDivH))
    .map(([item, s]) => ({
      item,
      hour: newestHour,
      buyQuote: s.edge!.buy.quote,
      sellQuote: s.edge!.sell.quote,
      edgePct: s.edge!.edgePct,
    }));
  return recordPublished(league, edges);
}

/** Poller hook, after the history sync: resolve what the new hours settle, then publish. */
export function trackCxOutcomes(league: string): { resolved: number; published: number } {
  const params = modelParams();
  const resolved = resolvePending(league, params);
  const published = publishNewest(league);
  return { resolved, published };
}

/** Rolling hit rate of published edges over the last HIT_RATE_DAYS. */
export function cxHitRate(league: string, nowMs: number = Date.now()): HitRate {
  const fromHour = Math.floor(nowMs / 1000) - HIT_RATE_DAYS * 24 * CX_HOUR_SECONDS;
  return { ...outcomeCounts(league, fromHour), days: HIT_RATE_DAYS };
}
