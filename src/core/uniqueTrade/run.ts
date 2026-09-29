import { TradeAuthError, TradeHttpError, TradeRateLimitedError } from "../../api/tradeErrors";
import type { Listing } from "../../api/tradeListing";
import { metered, newMeter, type TradeMeter } from "../../api/tradeMeter";
import type { UniqueOption } from "../../api/tradeMeta";
import type { ObservationWrite, UniqueTradeRow } from "../../db/uniqueTradeQueries";
import type { TradeQuery } from "../../lib/tradeLink";
import { scoutKey } from "../../lib/scoutKey";
import type { DivRates } from "../listingPrice";
import { pickCandidates, searchSlots, tradePriceFrom, tradeUniqueFor, uniqueTradeQuery } from "./plan";

/**
 * One tick of the unique-trade-values job: pick the due uniques, spend at most this tick's search
 * slots on them (one search + one 10-listing fetch each), store each outcome. Everything it
 * touches is injected, so the budget and the failure handling are tested without trade2.
 */
export interface UniqueTradeDeps {
  league: string;
  nowMs: number;
  names: readonly string[];
  /** scoutKeys poe2scout prices above 0 in the league. */
  scoutPriced: ReadonlySet<string>;
  stored: ReadonlyMap<string, UniqueTradeRow>;
  /** Attempt times of the last hour, every league (the budget is per IP). */
  recentChecksMs: readonly number[];
  capPerHour: number;
  perTick: number;
  refreshMs: number;
  rates: DivRates;
  catalog: () => Promise<readonly UniqueOption[]>;
  search: (q: TradeQuery) => Promise<{ total: number; listings: Listing[] }>;
  observe: (w: ObservationWrite) => void;
  fail: (nameKey: string, error: string, at: string) => void;
}

export interface UniqueTradeReport {
  league: string;
  candidates: number;
  slots: number;
  /** Searches this tick sent (or tried to): the cap is enforced on this, the meter only reports. */
  searches: number;
  priced: string[];
  /** Searched, but too few usable listings to price. */
  tooFew: string[];
  /** Per-unique failures (recorded on the row, the next unique is tried). */
  errors: string[];
  /** Why the run stopped on a trade2 rejection (cookie refused, 429); null when it did not. */
  fatal: string | null;
  /** The shared budget could not admit a search soon enough: normal pacing, retried next tick. */
  deferred: string | null;
  meter: TradeMeter;
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Every further search would fail the same way: a dead cookie, or trade2 itself rate-limiting us. */
const isFatal = (e: unknown): boolean => e instanceof TradeAuthError || (e instanceof TradeHttpError && e.status === 429);

async function checkOne(name: string, catalog: readonly UniqueOption[], deps: UniqueTradeDeps, report: UniqueTradeReport): Promise<void> {
  const nameKey = scoutKey(name);
  const at = new Date(deps.nowMs).toISOString();
  const unique = tradeUniqueFor(name, catalog);
  if (unique == null) {
    // a curated name trade2 does not know is a data bug: no search spent, recorded and reported
    const error = `"${name}" is not in trade2's unique catalog`;
    deps.fail(nameKey, error, at);
    report.errors.push(error);
    return;
  }
  report.searches += 1;
  const res = await deps.search(uniqueTradeQuery(unique));
  const price = tradePriceFrom(res.listings, res.total, deps.rates);
  deps.observe({ nameKey, div: price.div, listed: price.listed, samples: price.samples, at });
  (price.div == null ? report.tooFew : report.priced).push(name);
}

export async function runUniqueTrade(deps: UniqueTradeDeps): Promise<UniqueTradeReport> {
  const candidates = pickCandidates(deps.names, deps.scoutPriced, deps.stored, deps.nowMs, deps.refreshMs);
  const slots = searchSlots(deps.recentChecksMs, deps.nowMs, deps.capPerHour, deps.perTick);
  const report: UniqueTradeReport = {
    league: deps.league, candidates: candidates.length, slots, searches: 0, priced: [], tooFew: [], errors: [], fatal: null, deferred: null, meter: newMeter(),
  };
  if (candidates.length === 0 || slots === 0) return report;
  const catalog = await deps.catalog();
  await metered(report.meter, async () => {
    for (const name of candidates) {
      if (report.searches >= slots) break;
      try {
        await checkOne(name, catalog, deps, report);
      } catch (e: unknown) {
        // neither leaves a row: the unique was not answered, so it stays due
        if (e instanceof TradeRateLimitedError) {
          report.deferred = `${name}: ${errText(e)}`;
          break;
        }
        if (isFatal(e)) {
          report.fatal = `${name}: ${errText(e)}`;
          break;
        }
        deps.fail(scoutKey(name), errText(e), new Date(deps.nowMs).toISOString());
        report.errors.push(`${name}: ${errText(e)}`);
      }
    }
  });
  return report;
}

/** The heartbeat `problem`: a fatal stop, or a tick that only failed. A budget deferral is not one. */
export function uniqueTradeProblem(r: UniqueTradeReport): string | null {
  if (r.fatal != null) return `stopped — ${r.fatal}`;
  const first = r.errors[0];
  if (first != null && r.priced.length + r.tooFew.length === 0) return `${r.errors.length} unique(s) failed — ${first}`;
  return null;
}
