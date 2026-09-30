import { TradeAuthError, TradeHttpError, TradeRateLimitedError } from "../../api/tradeErrors";
import type { Listing } from "../../api/tradeListing";
import { metered, newMeter, type TradeMeter } from "../../api/tradeMeter";
import type { UniqueOption } from "../../api/tradeMeta";
import type { FailureWrite, ObservationWrite, UniqueTradeRow } from "../../db/uniqueTradeQueries";
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
  /** When search requests were actually sent in the last hour, every league (the budget is per IP). */
  recentSearchesMs: readonly number[];
  capPerHour: number;
  perTick: number;
  refreshMs: number;
  rates: DivRates;
  catalog: () => Promise<readonly UniqueOption[]>;
  search: (q: TradeQuery) => Promise<{ total: number; listings: Listing[] }>;
  observe: (w: ObservationWrite) => void;
  fail: (w: FailureWrite) => void;
}

export interface UniqueTradeReport {
  league: string;
  candidates: number;
  slots: number;
  /** Search requests this tick sent: the cap is enforced on this, the meter only reports. */
  searches: number;
  priced: string[];
  /** Searched, but too few usable listings to price. */
  tooFew: string[];
  /** Curated names trade2's unique catalog does not know: no search spent, recorded on their rows. */
  catalogMisses: string[];
  /** Per-unique search failures (recorded on the row, the next unique is tried). */
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

async function checkOne(name: string, unique: UniqueOption, deps: UniqueTradeDeps, report: UniqueTradeReport): Promise<void> {
  const at = new Date(deps.nowMs).toISOString();
  const res = await deps.search(uniqueTradeQuery(unique));
  const price = tradePriceFrom(res.listings, res.total, deps.rates);
  deps.observe({ nameKey: scoutKey(name), div: price.div, listed: price.listed, samples: price.samples, at });
  (price.div == null ? report.tooFew : report.priced).push(name);
}

/**
 * One search that did not produce an observation. The governor refusing it up front
 * (TradeRateLimitedError) sent nothing and leaves no row, so the unique stays due; any other
 * failure had a request out (trade2 answered 403/429/5xx, or never answered) and is charged.
 * Returns true when the run must stop.
 */
function onSearchError(name: string, e: unknown, deps: UniqueTradeDeps, report: UniqueTradeReport): boolean {
  if (e instanceof TradeRateLimitedError) {
    report.deferred = `${name}: ${errText(e)}`;
    return true;
  }
  deps.fail({ nameKey: scoutKey(name), error: errText(e), at: new Date(deps.nowMs).toISOString(), spent: true });
  if (isFatal(e)) {
    report.fatal = `${name}: ${errText(e)}`;
    return true;
  }
  report.errors.push(`${name}: ${errText(e)}`);
  return false;
}

async function spendSlots(candidates: readonly string[], catalog: readonly UniqueOption[], deps: UniqueTradeDeps, report: UniqueTradeReport): Promise<void> {
  for (const name of candidates) {
    if (report.searches >= report.slots) return;
    const unique = tradeUniqueFor(name, catalog);
    if (unique == null) {
      // a curated name trade2 does not know is a data bug: recorded, reported, and costs no slot
      const error = `"${name}" is not in trade2's unique catalog`;
      deps.fail({ nameKey: scoutKey(name), error, at: new Date(deps.nowMs).toISOString(), spent: false });
      report.catalogMisses.push(name);
      continue;
    }
    report.searches += 1;
    try {
      await checkOne(name, unique, deps, report);
    } catch (e: unknown) {
      if (onSearchError(name, e, deps, report)) return;
    }
  }
}

export async function runUniqueTrade(deps: UniqueTradeDeps): Promise<UniqueTradeReport> {
  const candidates = pickCandidates(deps.names, deps.scoutPriced, deps.stored, deps.nowMs, deps.refreshMs);
  const report: UniqueTradeReport = {
    league: deps.league,
    candidates: candidates.length,
    slots: searchSlots(deps.recentSearchesMs, deps.nowMs, deps.capPerHour, deps.perTick),
    searches: 0, priced: [], tooFew: [], catalogMisses: [], errors: [], fatal: null, deferred: null, meter: newMeter(),
  };
  if (candidates.length === 0 || report.slots === 0) return report;
  const catalog = await deps.catalog();
  await metered(report.meter, () => spendSlots(candidates, catalog, deps, report));
  return report;
}

/**
 * The heartbeat `problem`: a fatal stop, catalog misses (named — each is reported once per refresh
 * period, since its row waits the full refresh), or a tick whose every search failed. A budget
 * deferral and a spent hourly cap are pacing, not problems.
 */
export function uniqueTradeProblem(r: UniqueTradeReport): string | null {
  const parts: string[] = [];
  if (r.fatal != null) parts.push(`stopped — ${r.fatal}`);
  if (r.catalogMisses.length > 0) parts.push(`not in trade2's unique catalog (fix the curated name): ${r.catalogMisses.join(", ")}`);
  const first = r.errors[0];
  if (first != null && r.priced.length + r.tooFew.length === 0) parts.push(`${r.errors.length} unique(s) failed — ${first}`);
  return parts.length > 0 ? parts.join("; ") : null;
}
