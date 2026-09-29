import { fetchDemand } from "../../api/scoutClient";
import type { PricedItem } from "../../api/types";
import { config } from "../../config/env";
import { recentStashReads, type StashRead } from "../../db/balanceItemQueries";
import { listingComps } from "../../db/listingCompsQueries";
import { repriceState } from "../../db/repriceRunQueries";
import { itemValuesAgeHours, latestFetchedAt, latestSnapshots, uniqueValueMap } from "../../db/marketQueries";
import { timestampAgeMs } from "../../lib/sqliteTime";
import type { ListingComp, RepriceStatus, SellResponse, SoldSince } from "../../lib/wealthContract";
import { loadCxMarketView } from "../cx/cxItemMarkets";
import { getDefaultLeague } from "../leagueState";
import type { ExchangeRates } from "../priceEngine";
import type { ResolvedRates } from "../rates";
import { groupStashItems, planLiquidation, type ScoutListing } from "./plan";
import { pickRepriceCandidates } from "./repriceScan";
import { buildSellRows, readListings, sellTotals } from "./sellRows";
import { soldSince } from "./soldSince";

/**
 * Everything GET /api/wealth/sell shows, from the DB (and poe2scout's listing counts). Reads only:
 * no trade2 request is ever made here — reprice comps come from the poller's queued checks.
 */
const READ_HINT = "press Read stash (the one step that spends trade requests)";
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * poe2scout live-listing counts for the entries that are not exchange items. poe2scout is only
 * read for the app default league; any other league gets no competition, said out loud.
 */
async function loadCompetition(league: string, keys: readonly string[]): Promise<{ map: Map<string, ScoutListing>; warning: string | null }> {
  const map = new Map<string, ScoutListing>();
  if (keys.length === 0) return { map, warning: null };
  if (league !== getDefaultLeague()) return { map, warning: `listing competition is only read for ${getDefaultLeague()}` };
  try {
    const wanted = new Set(keys);
    for (const d of (await fetchDemand()).items) {
      const key = d.name.toLowerCase();
      if (!wanted.has(key) || map.has(key)) continue;
      map.set(key, { competition: { listed: d.quantity, sellThrough: d.sellThrough, samples: d.samples }, icon: d.icon });
    }
    return { map, warning: null };
  } catch (e: unknown) {
    console.warn(`[wealth/sell] poe2scout competition failed: ${errText(e)}`);
    return { map, warning: `listing competition unavailable (poe2scout: ${errText(e)})` };
  }
}

function emptyReason(read: StashRead | undefined, skippedOrbs: number): string {
  if (read == null) return `no stash read yet — ${READ_HINT}`;
  if (read.items.length === 0 && (read.snapshot.listed_seen ?? 0) > 0) return `your last read predates item capture — ${READ_HINT} again`;
  if (read.items.length === 0) return "your last read saw no public listings — make the tab public, then read again";
  return `only raw currency (${skippedOrbs} Divine/Exalted/Chaos stacks) in your last read — nothing to sell`;
}

function soldLine(reads: readonly StashRead[], rates: ExchangeRates): SoldSince | null {
  const [latest, previous] = reads;
  if (latest == null || previous == null) return null;
  const truncated = (latest.snapshot.listed_total ?? 0) > (latest.snapshot.listed_seen ?? 0);
  const r = soldSince(readListings(previous.items, rates), readListings(latest.items, rates), truncated);
  return r == null ? null : { ...r, previousAt: previous.snapshot.fetched_at };
}

function repriceStatus(userId: number, latest: StashRead | undefined, rates: ExchangeRates, nowMs: number): RepriceStatus {
  const { run, phase, nextAt } = repriceState(userId, nowMs);
  const candidates = latest == null ? 0 : pickRepriceCandidates(latest.items, rates, nowMs).length;
  const state = phase === "none" ? "idle" : phase;
  return {
    state, requestedAt: run?.requested_at ?? null, finishedAt: run?.finished_at ?? null, checked: run?.checked ?? 0,
    error: run?.error ?? null, nextAt: nextAt?.toISOString() ?? null, candidates,
  };
}

const byLowerName = (prices: readonly PricedItem[]): Map<string, PricedItem> => new Map(prices.map((p) => [p.itemName.toLowerCase(), p]));

/** Comps of listings still in the latest read, by listing and (newest valued one) by item name. */
function compMaps(userId: number, league: string, liveIds: ReadonlySet<string>): { byListing: Map<string, ListingComp>; fairByName: Map<string, number> } {
  const byListing = new Map<string, ListingComp>();
  const fairByName = new Map<string, number>();
  for (const { itemName, ...c } of listingComps(userId, league)) {
    if (!liveIds.has(c.listingId)) continue;
    byListing.set(c.listingId, c);
    if (c.fairDiv != null && !fairByName.has(itemName.toLowerCase())) fairByName.set(itemName.toLowerCase(), c.fairDiv);
  }
  return { byListing, fairByName };
}

export async function loadSell(userId: number, league: string, resolved: ResolvedRates, nowMs: number = Date.now()): Promise<SellResponse> {
  const reads = recentStashReads(userId, league, 2);
  const latest = reads[0];
  const { items, skippedOrbs } = groupStashItems(latest?.items ?? [], resolved.rates);
  const prices = latestSnapshots(league);
  const ninjaByName = byLowerName(prices);
  const cxView = loadCxMarketView(league, prices);
  const competition = await loadCompetition(league, items.map((i) => i.name.toLowerCase()).filter((k) => !ninjaByName.has(k)));
  const liveIds = new Set((latest?.items ?? []).map((i) => i.listing_id).filter((id): id is string => id != null));
  const comps = compMaps(userId, league, liveIds);
  const plan = planLiquidation(items, {
    rates: resolved.rates, ninjaByName, cxByItemId: cxView?.byItemId ?? new Map(), uniqueDiv: uniqueValueMap(league),
    compDiv: comps.fairByName, competition: competition.map,
    params: { goldPerExalt: config.cx.goldPerExalt, flowSharePct: config.cx.flowSharePct, maxGridStepPct: config.cx.maxGridStepPct },
  });
  const rows = buildSellRows(items, plan, { ninjaByName, compsByListing: comps.byListing, rates: resolved.rates });
  const warnings = [
    ...(cxView == null && items.length > 0 ? [`no fresh exchange history for ${league} — exchange rows use poe.ninja mids`] : []),
    ...(competition.warning ? [competition.warning] : []),
  ];
  return {
    league,
    snapshot: latest == null ? null : { fetchedAt: latest.snapshot.fetched_at, ageMin: Math.max(0, Math.round(timestampAgeMs(latest.snapshot.fetched_at, nowMs) / 60_000)) },
    reason: items.length > 0 ? null : emptyReason(latest, skippedOrbs),
    rows,
    totals: sellTotals(plan, rows),
    provenance: {
      league, rates: resolved.rates, ratesSource: resolved.source, ratesFetchedAt: resolved.fetchedAt,
      ninjaFetchedAt: latestFetchedAt(league), cxHour: cxView?.newestHour ?? null, scoutAgeHours: itemValuesAgeHours(league),
    },
    currencyIcons: {
      DIVINE: ninjaByName.get("divine orb")?.icon ?? null,
      EXALT: ninjaByName.get("exalted orb")?.icon ?? null,
      CHAOS: ninjaByName.get("chaos orb")?.icon ?? null,
    },
    sold: soldLine(reads, resolved.rates),
    reprice: repriceStatus(userId, latest, resolved.rates, nowMs),
    warnings,
  };
}
