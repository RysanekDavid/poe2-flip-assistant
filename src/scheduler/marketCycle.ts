import { fetchAll } from "../api/ninjaClient";
import { config } from "../config/env";
import { fireAlert } from "../core/alertEngine";
import { loadCxMarketView, type CxMarketView } from "../core/cx/cxItemMarkets";
import { pruneCxMarketHistory, syncCxHistory } from "../core/cx/cxIngest";
import { scoreItem } from "../core/flipModel";
import { getPolledLeagues, leagueForUser, sameLeague } from "../core/leagueUsers";
import { type Currency, type ExchangeRates } from "../core/priceEngine";
import { resolveRates } from "../core/rates";
import { refreshCxRatesIfStale } from "../core/rateSync";
import { advanceTrend, type TrendEvent } from "../core/trendAlerts";
import { pruneMarginHistory } from "../db/craftQueries";
import { insertSnapshots, pruneObservations, pruneSnapshots } from "../db/marketQueries";
import { listUsers, type UserPublic } from "../db/userQueries";
import { getWatchlistForLeague, manualAgeMs, type WatchItem } from "../db/watchlistQueries";
import { roundPrice } from "../lib/format";
import type { PricedItem } from "../api/types";

/**
 * The poll cycle, across every league someone is actually looking at.
 *
 * Leagues run SEQUENTIALLY through the shared ninja limiter — the whole point of the cap in
 * leagueUsers is that this stays inside the budget: ~13 requests per league per hour (responses
 * are cached for an hour) against 144/h, so four leagues is ~52/h.
 *
 * Alerts are evaluated per league against the users who are viewing it, using only the watchlist
 * rows added under that league: a threshold recorded against one economy is not a signal in
 * another.
 */

/** > ~200% "spread" is never a real flip — it's a bad manual price (wrong currency/typo). */
const SANE_MAX_MARGIN = 200;

/** One poll tick: refresh rates once, then sweep each polled league in turn. */
export async function runCycle(): Promise<void> {
  const started = new Date().toISOString();
  const leagues = getPolledLeagues();
  console.log(`[poll ${started}] leagues: ${leagues.join(", ")}`);

  // GGG's hourly currency-exchange digest — ONE request covers every league, so this runs before
  // the sweeps and serves all of them. Fail-quiet: a CDN hiccup must not abort the cycle.
  await refreshCxRatesIfStale(leagues);

  for (const league of leagues) {
    try {
      await sweepLeague(league);
    } catch (err: unknown) {
      // One league's outage must not cost the others their cycle.
      console.error(`[poll] "${league}" failed:`, err instanceof Error ? err.message : err);
    }
  }

  // Fill gaps in the stored exchange history AFTER the sweeps, so a cold backfill (bounded,
  // 2s between requests) never delays fresh ninja prices. Fail-quiet like the refresh above.
  await syncCxHistory(leagues);

  // Retention is global, not per league — run it once the sweeps have added this tick's rows.
  const pruned = pruneSnapshots(config.retentionDays);
  pruneObservations(); // age out stale price-book observations
  pruneMarginHistory(config.retentionDays); // keep craft EV history bounded like everything else
  const cxPruned = pruneCxMarketHistory();
  console.log(
    `[poll] cycle done — pruned ${pruned} snapshot(s) older than ${config.retentionDays}d, ` +
      `${cxPruned} exchange market-hour(s) older than ${config.cx.historyDays}d`,
  );
}

/** Fetch, store and alert for a single league. */
async function sweepLeague(league: string): Promise<void> {
  const { items } = await fetchAll(league);
  const stored = insertSnapshots(league, items);
  console.log(`[poll] "${league}" stored ${stored}/${items.length} new snapshots`);

  // Same ladder the UI reads, deliberately: alerting on ninja-only rates while every panel showed
  // cx rates meant a row could read X% on screen and fire at Y%.
  const resolved = resolveRates(league);
  const rates = resolved?.rates ?? null;
  if (rates == null) console.warn(`[poll] "${league}" has no usable Div/Ex/Chaos rates — skipping spread eval`);
  else console.log(`[poll] "${league}" rates from ${resolved?.source}`);

  const byId = new Map<string, PricedItem>(items.map((i) => [i.itemId, i]));
  const cx = loadCxMarketView(league, items);
  const viewers = usersViewing(league);
  const watches = viewers.map((user) => ({ user, rows: getWatchlistForLeague(user.id, league) }));
  const trends = trendEvents(league, watches.flatMap((w) => w.rows), byId);
  console.log(`[poll] "${league}" evaluating watchlists for ${viewers.length} user(s)`);
  for (const { user, rows } of watches) {
    for (const watch of rows) {
      const current = byId.get(watch.item_id);
      if (!current) continue;
      if (rates != null) fireSpreadAlert(user.id, league, watch, current, rates, cx);
      const trend = trends.get(watch.item_id);
      if (trend != null) fireTrendAlert(user.id, league, watch, trend);
    }
  }
}

/**
 * The accounts whose current view is this league — the only ones its alerts belong to.
 *
 * Compared case-insensitively on purpose. getPolledLeagues emits canonical spellings, but a row
 * stamped before canonicalization existed would otherwise match no swept league at all and that
 * user would silently never be alerted again.
 */
function usersViewing(league: string): UserPublic[] {
  return listUsers().filter((u) => sameLeague(leagueForUser(u.id), league));
}

/** One trend transition per watched market item, computed once and shared by every viewer. */
function trendEvents(league: string, watches: readonly WatchItem[], byId: Map<string, PricedItem>): Map<string, TrendEvent> {
  const events = new Map<string, TrendEvent>();
  const seen = new Set<string>();
  for (const w of watches) {
    const current = byId.get(w.item_id);
    if (current == null || seen.has(w.item_id)) continue;
    seen.add(w.item_id);
    const event = advanceTrend(league, w.item_id, w.item_name, current);
    if (event != null) events.set(w.item_id, event);
  }
  return events;
}

/** REAL-mode spread alert only; the market estimate is context, not a signal. */
function fireSpreadAlert(
  userId: number,
  league: string,
  w: WatchItem,
  current: PricedItem,
  rates: ExchangeRates,
  cx: CxMarketView | null,
): void {
  const ageMs = manualAgeMs(w.manual_set_at);
  const fresh = ageMs != null && ageMs <= config.manualStaleHours * 3600_000;
  const mBuy =
    fresh && w.manual_buy_exalt != null
      ? { amount: w.manual_buy_exalt, ccy: (w.manual_buy_ccy ?? "EXALT") as Currency }
      : null;
  const mSell =
    fresh && w.manual_sell_chaos != null
      ? { amount: w.manual_sell_chaos, ccy: (w.manual_sell_ccy ?? "CHAOS") as Currency }
      : null;

  const flip = scoreItem(current, rates, mBuy, mSell, cx?.byItemId.get(w.item_id) ?? null);
  if (flip.mode !== "REAL" || flip.marginPct < w.buy_threshold_pct || flip.marginPct > SANE_MAX_MARGIN) return;
  const market = `${flip.source === "cx" ? "exchange" : "est."} ~${flip.marketMarginPct.toFixed(0)}%`;
  fireAlert(userId, league, {
    type: "SPREAD",
    itemId: w.item_id,
    itemName: w.item_name,
    message: `${flip.marginPct.toFixed(1)}% — buy ${roundPrice(flip.buyExalt)}ex → sell ${roundPrice(flip.sellChaos)}c · ${market}`,
    value: flip.marginPct,
    threshold: w.buy_threshold_pct,
  });
}

function fireTrendAlert(userId: number, league: string, w: WatchItem, event: TrendEvent): void {
  fireAlert(userId, league, { ...event, itemId: w.item_id, itemName: w.item_name });
}
