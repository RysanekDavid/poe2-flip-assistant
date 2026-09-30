import { searchListings, type TradeCred } from "../../api/tradeClient";
import { fetchTradeMeta } from "../../api/tradeMeta";
import { withCredStatus } from "../../auth/credStatus";
import { config } from "../../config/env";
import { getCredStatus } from "../../db/credStatusQueries";
import { uniqueValueMap } from "../../db/marketQueries";
import { recordUniqueTradeFailure, recordUniqueTradeObservation, uniqueTradeSearchesSince, uniqueTradeValues } from "../../db/uniqueTradeQueries";
import type { CredState } from "../../lib/poeSettingsContract";
import { scoutKey } from "../../lib/scoutKey";
import { getDefaultLeague } from "../leagueState";
import { resolveRates } from "../rates";
import { UNIQUE_TRADE_TICK_MIN } from "../subsystems";
import { loadBossLoot } from "../tools/bossEv/curated";
import { curatedTradeNames, perTickOf, TRADE_COMPARABLES } from "./plan";
import { runUniqueTrade, uniqueTradeProblem, type UniqueTradeReport } from "./run";

// Parsed at module load, like the farm route: a malformed curated file fails the poller loudly.
const NAMES = curatedTradeNames(loadBossLoot());
const HOUR_MS = 3_600_000;

/** A tick either ran (possibly spending nothing) or could not start; the reason is the heartbeat note. */
export type UniqueTradeOutcome = { kind: "skipped"; reason: string } | { kind: "ran"; report: UniqueTradeReport };

/** The account whose cookie the shared scan runs under — the owner, resolved per tick. */
export interface ScanOwner {
  id: number;
  cred: TradeCred | null;
}

/**
 * Why a tick cannot search, or the cred it searches with. The User-Agent carries the operator
 * contact (DATA_SOURCE_CONTACT), never the cookie owner's own: a stored cred's contact is whatever
 * the user typed in Settings, and personal data must not ride in request headers. A stored cookie
 * trade2 already answered 403 is not tried again until a new one is saved (Settings resets the
 * state); the .env cookie's health is not recorded, so it is always tried.
 */
export function scanCred(owner: ScanOwner, contact: string, credState: CredState): { cred: TradeCred } | { skip: string } {
  if (contact.trim() === "") return { skip: "DATA_SOURCE_CONTACT is not set — trade2 requests must name an operator contact" };
  if (owner.cred == null) return { skip: "owner has no POESESSID stored — no trade2 searches until one is saved in Settings" };
  if (owner.cred.source === "stored" && credState === "expired") {
    return { skip: "the owner's POESESSID is expired (trade2 answered 403) — save a fresh one in Settings to resume" };
  }
  return { cred: { poesessid: owner.cred.poesessid, source: owner.cred.source, contact: contact.trim() } };
}

/**
 * One tick in the app's default league — trade2 searches always search that league, so its
 * prices can only be stored for it.
 */
export async function tickUniqueTrade(owner: ScanOwner, nowMs: number = Date.now()): Promise<UniqueTradeOutcome> {
  const auth = scanCred(owner, config.dataSourceContact, getCredStatus(owner.id).state);
  if ("skip" in auth) return { kind: "skipped", reason: auth.skip };
  const league = getDefaultLeague();
  const resolved = resolveRates(league, nowMs);
  if (resolved == null) return { kind: "skipped", reason: `no exchange rates for ${league} — cannot convert listings to Divine` };
  const cfg = config.uniqueTradeValues;
  const report = await runUniqueTrade({
    league,
    nowMs,
    names: NAMES,
    scoutPriced: new Set([...uniqueValueMap(league).keys()].map(scoutKey)),
    stored: uniqueTradeValues(league),
    recentSearchesMs: uniqueTradeSearchesSince(nowMs - HOUR_MS),
    capPerHour: cfg.maxSearchesPerHour,
    perTick: perTickOf(cfg.maxSearchesPerHour, UNIQUE_TRADE_TICK_MIN),
    refreshMs: cfg.refreshHours * HOUR_MS,
    rates: resolved.rates,
    catalog: async () => (await fetchTradeMeta()).uniques,
    // each search is the owner's cookie answering trade2, so a 403 marks a stored cookie expired
    search: (q) => withCredStatus(owner.id, auth.cred, () => searchListings(q, TRADE_COMPARABLES, "asc", auth.cred)),
    observe: (w) => recordUniqueTradeObservation(league, w),
    fail: (w) => recordUniqueTradeFailure(league, w),
  });
  return { kind: "ran", report };
}

/** Heartbeat `problem` of a tick: a skip is a clear red note, a run reports its own failures. */
export const uniqueTradeOutcomeProblem = (o: UniqueTradeOutcome): string | null =>
  o.kind === "skipped" ? `skipped — ${o.reason}` : uniqueTradeProblem(o.report);
