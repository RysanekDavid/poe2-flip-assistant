/* Shared fixtures for the snipe outcome tests (testSnipeOutcomes.ts, testSnipeOutcomeMethod.ts):
 * tracked rows in the temp DB and a faked trade2 that records every call. */
import { getDb } from "../db/database";
import { recordSnipeOutcome, type NewSnipeOutcome, type OutcomeRow } from "../db/snipeOutcomeQueries";
import type { OutcomeDeps } from "../core/snipeOutcomes/settle";
import { parseListing, type Listing } from "../api/tradeListing";
import type { SearchResp } from "../api/tradeClient";
import type { TradeQuery } from "../lib/tradeLink";

export type Ok = (name: string, cond: boolean, extra?: string) => void;

export const H = 3_600_000;
export const NOW = Date.parse("2026-09-29T12:00:00Z");
export const L = "League Alpha";
const SELLER: TradeQuery = { type: "Vaal Gauntlets", online: false, account: "Seller" };

export function listing(id: string, amount: number, currency = "exalted"): Listing {
  const l = parseListing({ id, listing: { price: { amount, currency }, account: { name: "Seller" } }, item: { baseType: "Vaal Gauntlets", rarity: "Rare" } });
  if (l == null) throw new Error("fixture listing did not parse");
  return l;
}

export function track(id: string, ageH: number, queryId: string | null = "q1", recheck: TradeQuery | null = SELLER): void {
  const o: NewSnipeOutcome = {
    listingId: id, league: L, profile: "gloves", baseType: "Vaal Gauntlets", itemName: "Doom Grip",
    askDiv: 1, valueDiv: 2, marginPct: 50, samples: 8, queryId: queryId ?? "unset", recheckQuery: recheck, alertedAt: NOW - ageH * H,
  };
  if (!recordSnipeOutcome(o)) throw new Error(`fixture ${id} already tracked`);
  if (queryId == null) getDb().prepare("UPDATE snipe_outcomes SET query_id = NULL WHERE listing_id = ?").run(id);
}

/** A row whose 2 h check said listed, now `ageH` old (due for 24 h once ≥ 24). */
export function at24h(id: string, queryId: string | null, recheck: TradeQuery | null = SELLER, ageH = 25): void {
  track(id, ageH, queryId, recheck);
  getDb().prepare("UPDATE snipe_outcomes SET check_2h = 'listed', check_2h_at = ? WHERE listing_id = ?").run(NOW - (ageH - 2) * H, id);
}

export const row = (id: string): OutcomeRow => {
  const r = getDb().prepare("SELECT * FROM snipe_outcomes WHERE listing_id = ?").get(id) as OutcomeRow | undefined;
  if (!r) throw new Error(`no row ${id}`);
  return r;
};

export interface Fake {
  deps: OutcomeDeps;
  fetches: Array<{ ids: string[]; queryId: string }>;
  searches: TradeQuery[];
}

export function fake(over: Partial<OutcomeDeps> = {}): Fake {
  const fetches: Fake["fetches"] = [];
  const searches: Fake["searches"] = [];
  const base: OutcomeDeps = {
    fetchStates: async (ids) => ids.map(() => null),
    search: async (): Promise<SearchResp> => ({ id: "fresh", result: [], total: 0 }),
    ratesFor: () => ({ exaltPerDivine: 100, chaosPerDivine: 20 }),
    defaultLeague: L,
    nowMs: NOW,
    maxFetches: 5,
    maxSearches: 3,
    ...over,
  };
  const deps: OutcomeDeps = {
    ...base,
    fetchStates: (ids, queryId) => {
      fetches.push({ ids, queryId });
      return base.fetchStates(ids, queryId);
    },
    search: (q) => {
      searches.push(q);
      return base.search(q);
    },
  };
  return { deps, fetches, searches };
}

/** Empty tracker, fetch method back to unverified. */
export function reset(): void {
  getDb().exec("DELETE FROM snipe_outcomes; DELETE FROM snipe_outcome_meta;");
}
