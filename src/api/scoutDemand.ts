import { z } from "zod";
import { getDefaultLeague } from "../core/leagueState";
import { fetchScoutRates, scoutGet, scoutItemsFetchedAt, SCOUT_CACHE_TTL_MS, SCOUT_REALM, type ScoutRates } from "./scoutClient";

/**
 * Unique demand data (Market › Prices uniques, Opportunities, Wealth competition): every priced unique in the flip-relevant categories (all pages), its recent
 * price/listing history, and when poe2scout last set its price. Split from scoutClient so each
 * stays small.
 */

/** Unique categories with a real secondary market — the flip-relevant ones. */
export const DEMAND_CATEGORIES = ["accessory", "armour", "weapon", "flask", "jewel", "sanctum"] as const;

// Armour is the largest category at 227 uniques (3 pages of 100, 2026-09-30). A count past this
// bound means paging stopped working, not that GGG added a thousand uniques.
export const MAX_DEMAND_PAGES = 10;

/** Only history this recent feeds sell-through, trend and heat — the same 7 days scout's own
 *  per-item PriceLogs window covered. Older points still date the price (`priceAt`). */
export const HISTORY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** A fill that carried warnings (dead category, rows moved while paging, failed history) retries sooner than a clean one. */
export const WARNED_TTL_MS = 5 * 60 * 1000;

const ByCategoryItemSchema = z
  .object({
    ItemId: z.number(),
    Name: z.string().nullish(),
    Type: z.string().nullish(),
    CategoryApiId: z.string(),
    IconUrl: z.string().nullish(),
    CurrentPrice: z.number().nullish(),
    // Required: live data sent it for all 440 uniques (2026-09-30) and openapi marks it required.
    // A missing count must fail the page, not read as "nobody is listing this".
    CurrentQuantity: z.number(),
  })
  .passthrough();
export type ByCategoryItem = z.infer<typeof ByCategoryItemSchema>;

// CurrentPage is 1-based: verified live 2026-09-30 (armour pages 1, 2, 3 answered CurrentPage 1, 2, 3).
const ByCategoryPageSchema = z
  .object({ CurrentPage: z.number(), Pages: z.number(), Items: z.array(ByCategoryItemSchema) })
  .passthrough();
export type ByCategoryPage = z.infer<typeof ByCategoryPageSchema>;

/*
 * One call returns every item's recent points; the newest is when CurrentPrice was set (its price
 * and quantity match CurrentPrice/CurrentQuantity). This replaces ByCategory's PriceLogs, which are
 * scout's daily buckets of the same data and come back all-null once the newest point is over a
 * week old. Live check 2026-09-30: all 440 demand uniques carry 11–24 points (Price, Quantity and a
 * zoned Time, never null), but the newest is 17.7–68.4 days old with gaps up to 30 days, so the
 * 7-day window leaves none today: no trend is shown instead of presenting two-month-old
 * movement as a current one. When scout logs again, the figures come back on their own.
 */
const PriceHistorySchema = z
  .object({
    ItemHistories: z.array(
      z
        .object({
          ItemId: z.number(),
          History: z.array(z.object({ Price: z.number(), Quantity: z.number(), Time: z.string() }).passthrough()),
        })
        .passthrough(),
    ),
  })
  .passthrough();
export type PriceHistoryRaw = z.infer<typeof PriceHistorySchema>;

export interface HistoryPoint {
  price: number;
  quantity: number; // listed at that point — supply, not sales
  atMs: number;
}

export interface DemandItem {
  id: number;
  name: string;
  type: string;
  category: string;
  icon: string | null;
  priceExalt: number; // current price, outlier-guarded against the recent history (see toDemandItems)
  quantity: number; // CurrentQuantity — live listing count
  // History `Quantity` is how many are LISTED at each point, not how many traded. The two
  // history-derived figures are null when the recent history is too short to compute them.
  sellThrough: number | null; // avg per-step FRACTION of listings gone (0..1) — sell-through proxy
  momentumPct: number | null; // price change older half → newer half of the recent history
  samples: number; // recent history points — 0 = poe2scout has no recent history for it
  sparkPrices: number[]; // recent prices, oldest→newest — for row sparklines
  /** The points inside HISTORY_WINDOW_MS, oldest→newest: Market › Opportunities reads its trends from them. */
  recent: HistoryPoint[];
  /** ISO time poe2scout last set this price (any age); null when its history has no point for the item. */
  priceAt: string | null;
}

/**
 * Every page of one category, in order, stopping at the page count scout reports. Rows are
 * deduped by ItemId: a price update mid-paging can shift a row onto the next page. A page made
 * only of rows already read means paging went in circles, which throws.
 */
export async function fetchCategoryPages(
  category: string,
  fetchPage: (page: number) => Promise<ByCategoryPage>,
): Promise<{ items: ByCategoryItem[]; repeats: number }> {
  const items: ByCategoryItem[] = [];
  const seen = new Set<number>();
  let repeats = 0;
  for (let page = 1; page <= MAX_DEMAND_PAGES; page += 1) {
    const res = await fetchPage(page);
    // an ignored page param would hand back page 1 forever and duplicate every row
    if (res.CurrentPage !== page) throw new Error(`poe2scout "${category}" asked for page ${page}, got page ${res.CurrentPage}`);
    let fresh = 0;
    for (const it of res.Items) {
      if (seen.has(it.ItemId)) {
        repeats += 1;
        continue;
      }
      seen.add(it.ItemId);
      items.push(it);
      fresh += 1;
    }
    if (res.Items.length > 0 && fresh === 0) throw new Error(`poe2scout "${category}" page ${page} only repeats earlier pages — paging broken?`);
    if (page >= res.Pages) return { items, repeats };
  }
  throw new Error(`poe2scout "${category}" uniques have more than ${MAX_DEMAND_PAGES} pages — endpoint shape changed?`);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Mean per-step FRACTIONAL decrease in listing count, oldest→newest: each step contributes
 * max(0, prev − next) / prev. Fractional, not absolute — a 900-listing unique that loses 10
 * listings per scrape (1%) is churn, a 12-listing unique that loses 3 (25%) is selling through.
 * Increases (new supply) are clipped at 0. Result is 0..1, or null with fewer than 2 points: no
 * history is "unknown", and a 0 would read as "nothing sells". Still a proxy — a delisting or a
 * price-edit re-index is not a sale.
 */
export function sellThroughProxy(qtys: readonly number[]): number | null {
  if (qtys.length < 2) return null;
  let drops = 0;
  for (let i = 1; i < qtys.length; i++) {
    const prev = qtys[i - 1]!;
    if (prev > 0) drops += Math.max(0, prev - qtys[i]!) / prev;
  }
  return drops / (qtys.length - 1);
}

interface HistorySummary {
  recent: HistoryPoint[];
  sellThrough: number | null;
  momentumPct: number | null;
  recentPrice: number;
  prices: number[];
}

/** Sell-through + momentum from the points inside HISTORY_WINDOW_MS; `points` are sorted oldest→newest. */
export function summarizeHistory(points: readonly HistoryPoint[], nowMs: number): HistorySummary {
  const recent = points.filter((p) => nowMs - p.atMs <= HISTORY_WINDOW_MS);
  const prices = recent.map((p) => p.price).filter((p) => p > 0);
  const qtys = recent.map((p) => p.quantity);
  // momentum from the median of the older vs newer half — robust to a single spike point
  const half = Math.floor(prices.length / 2);
  const older = median(prices.slice(0, half));
  const newer = median(prices.slice(half));
  return {
    recent,
    sellThrough: sellThroughProxy(qtys),
    momentumPct: prices.length >= 2 && older > 0 ? ((newer - older) / older) * 100 : null,
    // recent anchor = median of the LAST 3 points, not the whole week — a full-window median
    // lags fast movers by days (Temporalis pumped 1.4M→3.4M ex in a week; week-median said 1.5M)
    recentPrice: median(prices.slice(-3)),
    prices,
  };
}

// A time without Z or an offset would be read as server-local time: a shape change, not "unknown".
const ZONED_TIME = /(?:Z|[+-]\d{2}:?\d{2})$/;

function parseHistoryTime(time: string, itemId: number): number {
  const ms = Date.parse(time);
  if (!ZONED_TIME.test(time) || !Number.isFinite(ms)) {
    throw new Error(`poe2scout price history: time "${time}" for item ${itemId} is unparseable or has no zone`);
  }
  return ms;
}

/** Each item's history as points sorted oldest→newest. Throws on a bad time. */
export function historyByItem(raw: PriceHistoryRaw): Map<number, HistoryPoint[]> {
  const out = new Map<number, HistoryPoint[]>();
  for (const h of raw.ItemHistories) {
    const points = h.History.map((p) => ({ price: p.Price, quantity: p.Quantity, atMs: parseHistoryTime(p.Time, h.ItemId) }));
    out.set(h.ItemId, points.sort((a, b) => a.atMs - b.atMs));
  }
  return out;
}

/** Priced, named uniques → demand items. An item missing from `history` gets unknown figures and age. */
export function toDemandItems(raw: readonly ByCategoryItem[], history: ReadonlyMap<number, readonly HistoryPoint[]>, nowMs: number): DemandItem[] {
  return (
    raw
      // "INCOMPLETE" = poe2scout's placeholder name for unreleased/unidentified uniques — not tradeable
      .filter((r) => r.CurrentPrice != null && r.Name != null && r.Name !== "INCOMPLETE")
      .map((r) => {
        const points = history.get(r.ItemId) ?? [];
        const { recent, sellThrough, momentumPct, recentPrice, prices } = summarizeHistory(points, nowMs);
        // display price = CurrentPrice, unless it's a >3× outlier vs the recent history (price-fix
        // manipulation / lone mispriced listing) — then trust the recent median instead
        const cur = r.CurrentPrice!;
        const outlier = recentPrice > 0 && (cur > recentPrice * 3 || cur < recentPrice / 3);
        const newest = points.at(-1);
        return {
          id: r.ItemId,
          name: r.Name!,
          type: r.Type ?? "",
          category: r.CategoryApiId,
          icon: r.IconUrl ?? null,
          priceExalt: outlier ? recentPrice : cur,
          quantity: r.CurrentQuantity,
          sellThrough,
          momentumPct,
          samples: prices.length,
          sparkPrices: prices,
          recent,
          priceAt: newest ? new Date(newest.atMs).toISOString() : null,
        };
      })
  );
}

/** A listed unique poe2scout gives no current price: the Prices tool still shows it, honestly unpriced. */
export interface UnpricedUnique {
  id: number;
  name: string;
  type: string;
  category: string;
  icon: string | null;
  quantity: number;
}

/** The rows toDemandItems drops for having no CurrentPrice, minus scout's "INCOMPLETE" placeholders. */
export function toUnpricedUniques(raw: readonly ByCategoryItem[]): UnpricedUnique[] {
  return raw
    .filter((r) => r.CurrentPrice == null && r.Name != null && r.Name !== "INCOMPLETE")
    .map((r) => ({ id: r.ItemId, name: r.Name!, type: r.Type ?? "", category: r.CategoryApiId, icon: r.IconUrl ?? null, quantity: r.CurrentQuantity }));
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Every page of every demand category, sequentially (one request at a time is plenty for a
 * cached fill and is polite to a free API). A single dead category degrades the fill with a
 * warning; ALL of them dead is an outage (moved host, dead league name) and throws.
 */
async function fetchDemandPages(league: string): Promise<{ items: ByCategoryItem[]; warnings: string[] }> {
  const lp = encodeURIComponent(league);
  const items: ByCategoryItem[] = [];
  const warnings: string[] = [];
  let failed = 0;
  for (const c of DEMAND_CATEGORIES) {
    try {
      // query params are lowercase per openapi/v1.json (category/page/perPage)
      const fetchPage = (page: number) =>
        scoutGet(`/${SCOUT_REALM}/Leagues/${lp}/Uniques/ByCategory?category=${c}&page=${page}&perPage=100`, ByCategoryPageSchema);
      const res = await fetchCategoryPages(c, fetchPage);
      items.push(...res.items);
      if (res.repeats > 0) warnings.push(`poe2scout ${c}: ${res.repeats} row(s) moved between pages while paging — a unique may be missing until the next refresh`);
    } catch (err: unknown) {
      failed += 1;
      console.warn(`[scout] demand category "${c}" failed: ${errText(err)}`);
      warnings.push(`poe2scout category failed — ${c}: ${errText(err)}`);
    }
  }
  if (failed === DEMAND_CATEGORIES.length) {
    throw new Error(`poe2scout demand unavailable for "${league}" — all categories failed: ${warnings.join("; ")}`);
  }
  return { items, warnings };
}

/** History for the demand fill. A failure leaves every figure and age unknown and says so; it does not sink the prices. */
async function fetchHistory(league: string): Promise<{ history: Map<number, HistoryPoint[]>; warning: string | null }> {
  try {
    const raw = await scoutGet(`/${SCOUT_REALM}/Leagues/${encodeURIComponent(league)}/Items/PriceHistory`, PriceHistorySchema);
    return { history: historyByItem(raw), warning: null };
  } catch (err: unknown) {
    console.warn(`[scout] price history failed: ${errText(err)}`);
    return { history: new Map(), warning: `price history and ages unavailable (poe2scout: ${errText(err)})` };
  }
}

export type DemandData = { rates: ScoutRates; items: DemandItem[]; unpriced: UnpricedUnique[]; warnings: string[] };
/** A cache fill as served: the data, the league it describes and when it was fetched (ms epoch). */
export type CachedDemand = DemandData & { at: number; league: string };

async function loadDemand(league: string): Promise<DemandData> {
  const rates = await fetchScoutRates(league);
  const pages = await fetchDemandPages(league);
  const { history, warning } = await fetchHistory(league);
  return {
    rates,
    items: toDemandItems(pages.items, history, Date.now()),
    unpriced: toUnpricedUniques(pages.items),
    warnings: [...pages.warnings, ...(warning ? [warning] : [])],
  };
}

/**
 * League-keyed cache in front of `load`. Concurrent callers share one in-flight fill (Prices
 * uniques, Opportunities and Wealth › Sell can ask at once), and a fill with warnings expires
 * after WARNED_TTL_MS so a transient failure does not stick for the full TTL.
 */
export function createDemandCache(load: (league: string) => Promise<DemandData>, now: () => number = Date.now) {
  let cache: CachedDemand | null = null;
  let inflight: { league: string; promise: Promise<CachedDemand>; token: symbol } | null = null;
  const fresh = (league: string): boolean => {
    if (cache == null || cache.league !== league) return false;
    return now() - cache.at < (cache.warnings.length > 0 ? WARNED_TTL_MS : SCOUT_CACHE_TTL_MS);
  };
  const get = (league: string): Promise<CachedDemand> => {
    if (cache != null && fresh(league)) return Promise.resolve(cache);
    if (inflight != null && inflight.league === league) return inflight.promise;
    const token = Symbol(league);
    const promise = load(league)
      .then((data) => {
        cache = { ...data, at: now(), league };
        return cache;
      })
      .finally(() => {
        // a league switch may have started a newer fill meanwhile — only clear our own
        if (inflight?.token === token) inflight = null;
      });
    inflight = { league, promise, token };
    return promise;
  };
  return { get, fetchedAt: (): number | null => cache?.at ?? null };
}

const demandCache = createDemandCache(loadDemand);

/** Freshness of the in-process scout caches (ms epoch of the newest fetch), null if never fetched. */
export function scoutFetchedAt(): number | null {
  const at = Math.max(scoutItemsFetchedAt() ?? 0, demandCache.fetchedAt() ?? 0);
  return at > 0 ? at : null;
}

/** Sell-through + momentum + price age for gear uniques across the demand categories, for the app default league. */
export function fetchDemand(): Promise<CachedDemand> {
  return demandCache.get(getDefaultLeague());
}
