import { CX_CURRENCY_IDS, CX_HOUR_SECONDS, isPrivateLeague } from "../../api/cxClient";
import { config } from "../../config/env";
import { cxItemNames, cxMarketsAt, ingestedCxHours } from "../../db/cxMarketQueries";
import {
  ninjaPricesBetween,
  pruneShadowPrices,
  shadowedHours,
  shadowHourStats,
  shadowPricesBefore,
  shadowPricesBetween,
  storeShadowHour,
} from "../../db/cxShadowQueries";
import { latestSnapshotRows } from "../../db/latestSnapshotQueries";
import { toSqliteTime } from "../../db/priceAtQueries";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";
import { entityByExchangeId, loadEntityCatalog } from "../entities/load";
import type { EntityCatalog } from "../entities/schema";
import { CX_MAX_CARRY_HOURS, priceCxHour } from "./cxPricing";
import { buildCxShadowReport, NINJA_PAIR_WINDOW_SECONDS, type CxShadowReport } from "./cxShadowReport";

/**
 * Shadow mode for CX-derived exchange prices: the poller prices every stored digest hour into
 * cx_price_shadow, and the owner compares it with poe.ninja (`npm run cx:shadow-report` or
 * GET /api/system/cx-shadow). Nothing user-facing reads these rows — ninja stays the price source
 * until the cutover decision.
 *
 * Hours are priced from the stored cx_markets rows (the existing hourly digest ingest), never from
 * a second fetch. They are priced oldest-first, so each hour carries forward from the one before.
 * The history backfill can still store an hour AFTER newer hours were priced (it walks newest
 * first, and a failed hour is retried later). Pricing such a late hour forgets the priced hours in
 * the next CX_MAX_CARRY_HOURS, since their carries skipped it, and they are re-priced on top of it
 * in the following runs, within the same per-run cap.
 */

/** Bounds one cycle's work on a cold start (≈14 days of stored history drains in a few cycles). */
export const CX_SHADOW_MAX_HOURS_PER_RUN = 48;

/**
 * GGG metadata id → catalog exchange id for every exchange-tradable entity. Throws when two
 * exchange ids share one metadata id: silently picking one would price the wrong item.
 */
export function exchangeIdsByDigestId(catalog: EntityCatalog = loadEntityCatalog()): Map<string, string> {
  const out = new Map<string, string>();
  for (const row of catalog.entities) {
    if (row.exchange_id == null || row.repoe_id == null) continue;
    const owner = out.get(row.repoe_id);
    if (owner != null && owner !== row.exchange_id) {
      throw new Error(`entity catalog: metadata id ${row.repoe_id} maps to both ${owner} and ${row.exchange_id}`);
    }
    out.set(row.repoe_id, row.exchange_id);
  }
  return out;
}

export interface CxShadowSyncResult {
  /** League-hours priced this run. */
  hours: number;
  /** Price rows written (traded + carried). */
  rows: number;
  /** League-hours still waiting after this run's cap. */
  pending: number;
  /** Priced later hours forgotten because an older hour arrived late (re-priced in later runs). */
  forgotten: number;
}

/** Ingested-but-unpriced hours of one league inside the retention window, oldest first. */
function pendingHours(league: string, nowMs: number): number[] {
  const from = Math.floor(nowMs / 1000) - config.retentionDays * 24 * CX_HOUR_SECONDS;
  const done = shadowedHours(league, from);
  return [...ingestedCxHours(league, from)].filter((h) => !done.has(h)).sort((a, b) => a - b);
}

/** Price one stored league-hour, store it and forget the priced hours its trades should feed. */
function priceStoredHour(league: string, hour: number, idMap: ReadonlyMap<string, string>): { rows: number; forgotten: number } {
  const pricing = priceCxHour(cxMarketsAt(league, hour), hour, idMap, shadowPricesBefore(league, hour));
  const through = hour + CX_MAX_CARRY_HOURS * CX_HOUR_SECONDS;
  const forgotten = storeShadowHour(league, hour, pricing.prices, { unmappedIds: pricing.unmapped }, through);
  return { rows: pricing.prices.length, forgotten };
}

/**
 * Poller hook: price every polled league's stored digest hours that have no shadow yet, oldest
 * first, at most CX_SHADOW_MAX_HOURS_PER_RUN per run. The queue is re-read after every hour, since
 * a late hour sends later ones back into it. A DB or catalog error throws: the heartbeat records
 * it, and this never feeds a user-facing view, so there is nothing to keep alive.
 */
export function syncCxPriceShadow(
  leagues: readonly string[],
  nowMs: number = Date.now(),
  idMap: ReadonlyMap<string, string> = exchangeIdsByDigestId(),
): CxShadowSyncResult {
  const result: CxShadowSyncResult = { hours: 0, rows: 0, pending: 0, forgotten: 0 };
  for (const league of new Set(leagues)) {
    if (isPrivateLeague(league)) continue;
    let pending = pendingHours(league, nowMs);
    while (pending.length > 0 && result.hours < CX_SHADOW_MAX_HOURS_PER_RUN) {
      const done = priceStoredHour(league, pending[0]!, idMap);
      result.rows += done.rows;
      result.forgotten += done.forgotten;
      result.hours++;
      pending = pendingHours(league, nowMs);
    }
    result.pending += pending.length;
  }
  if (result.hours > 0) {
    const tail = `${result.forgotten > 0 ? `, ${result.forgotten} later hour(s) queued for re-pricing` : ""}${result.pending > 0 ? `, ${result.pending} pending` : ""}`;
    console.log(`[cx-shadow] priced ${result.hours} digest hour(s), ${result.rows} row(s)${tail}`);
  }
  return result;
}

const PRUNE_EVERY_MS = 60 * 60 * 1000;
let lastPruneAt = -Infinity;

/**
 * Retention on the same clock as price_snapshots (config.retentionDays), so the comparison window
 * never outlives the ninja side. At most hourly unless `force`; null when skipped.
 */
export function pruneCxPriceShadow(nowMs: number = Date.now(), force = false): number | null {
  if (!force && nowMs - lastPruneAt < PRUNE_EVERY_MS) return null;
  lastPruneAt = nowMs;
  return pruneShadowPrices(Math.floor(nowMs / 1000) - config.retentionDays * 24 * CX_HOUR_SECONDS);
}

/** Digest ids → names resolved at ingest (cx_items), so the owner sees WHICH items the catalog lacks. */
function unmappedRefs(ids: readonly string[]): Array<{ digestId: string; name: string }> {
  const names = ids.length > 0 ? cxItemNames() : new Map<string, string>();
  return ids.map((digestId) => ({ digestId, name: names.get(digestId) ?? digestId }));
}

/** Largest window the report accepts — the 7-day shadow run plus a day of slack. */
export const CX_SHADOW_MAX_REPORT_HOURS = 8 * 24;

/**
 * Load and build the comparison for the newest `hours` digest hours ending at or before `nowMs`.
 * Ninja items count as present when they wrote a snapshot in the (paired) window.
 */
export function loadCxShadowReport(league: string, hours: number, nowMs: number = Date.now()): CxShadowReport {
  if (!Number.isInteger(hours) || hours < 1 || hours > CX_SHADOW_MAX_REPORT_HOURS) {
    throw new RangeError(`hours must be an integer in 1..${CX_SHADOW_MAX_REPORT_HOURS}, got ${hours}`);
  }
  const toHour = Math.floor(nowMs / 1000 / CX_HOUR_SECONDS) * CX_HOUR_SECONDS;
  const fromHour = toHour - (hours - 1) * CX_HOUR_SECONDS;
  const shadow = shadowPricesBetween(league, fromHour, toHour);
  const from = toSqliteTime((fromHour - NINJA_PAIR_WINDOW_SECONDS) * 1000);
  const to = toSqliteTime((toHour + NINJA_PAIR_WINDOW_SECONDS) * 1000);
  const ninjaIds = latestSnapshotRows(league)
    .filter((r) => parseSqliteTimestamp(r.fetchedAt) >= (fromHour - NINJA_PAIR_WINDOW_SECONDS) * 1000)
    .map((r) => r.itemId);
  const ninja = ninjaPricesBetween(league, ninjaIds, from, to);
  const ninjaNames = new Map(ninja.map((p) => [p.itemId, p.itemName]));
  const stats = shadowHourStats(league, fromHour, toHour);
  return buildCxShadowReport({
    league,
    hoursRequested: hours,
    shadow,
    ninja,
    unmapped: unmappedRefs(stats.unmappedIds),
    hours: { computed: stats.hours, fromHour: stats.fromHour, toHour: stats.toHour },
    unitExchangeId: exchangeIdsByDigestId().get(CX_CURRENCY_IDS.divine) ?? null,
    nameOf: (id) => entityByExchangeId(id)?.name ?? ninjaNames.get(id) ?? id,
  });
}
