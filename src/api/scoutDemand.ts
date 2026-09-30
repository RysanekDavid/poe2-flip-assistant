import { z } from "zod";
import { getDefaultLeague } from "../core/leagueState";
import { sellThroughProxy } from "../core/demandHeat";
import { fetchScoutRates, scoutGet, scoutItemsFetchedAt, SCOUT_CACHE_TTL_MS, SCOUT_REALM, type ScoutRates } from "./scoutClient";

/**
 * Demand board data: every priced unique in the flip-relevant categories (all pages), its
 * listing log, and when poe2scout last set its price. Split from scoutClient so each stays small.
 */

/** Unique categories with a real secondary market — the flip-relevant ones. */
const DEMAND_CATEGORIES = ["accessory", "armour", "weapon", "flask", "jewel", "sanctum"] as const;

// Armour is the largest category at 227 uniques (3 pages of 100, 2026-09-30). A count past this
// bound means paging stopped working, not that GGG added a thousand uniques.
export const MAX_DEMAND_PAGES = 10;

const PriceLogEntrySchema = z
  .object({
    Price: z.number().nullish(),
    Quantity: z.number().nullish(),
    Time: z.string().nullish(),
  })
  .passthrough();
type PriceLogEntry = z.infer<typeof PriceLogEntrySchema>;

const ByCategoryItemSchema = z
  .object({
    ItemId: z.number(),
    Name: z.string().nullish(),
    Type: z.string().nullish(),
    CategoryApiId: z.string(),
    IconUrl: z.string().nullish(),
    CurrentPrice: z.number().nullish(),
    CurrentQuantity: z.number().nullish(),
    // scout pads the log window with nulls where it has no point — all 7 null = no recent history
    PriceLogs: z.array(PriceLogEntrySchema.nullable()).nullish(),
  })
  .passthrough();
export type ByCategoryItem = z.infer<typeof ByCategoryItemSchema>;

const ByCategoryPageSchema = z
  .object({ CurrentPage: z.number(), Pages: z.number(), Items: z.array(ByCategoryItemSchema) })
  .passthrough();
export type ByCategoryPage = z.infer<typeof ByCategoryPageSchema>;

// One call returns every item's recent points; the newest one is when CurrentPrice was set
// (checked 2026-09-30: price and quantity match CurrentPrice/CurrentQuantity for the same item).
const PriceHistorySchema = z
  .object({
    ItemHistories: z.array(
      z.object({ ItemId: z.number(), History: z.array(z.object({ Time: z.string() }).passthrough()) }).passthrough(),
    ),
  })
  .passthrough();

export interface DemandItem {
  id: number;
  name: string;
  type: string;
  category: string;
  icon: string | null;
  priceExalt: number; // current price, outlier-guarded against the recent log (see toDemandItem)
  rawPriceExalt: number; // poe2scout CurrentPrice as-is (the unguarded headline)
  quantity: number; // CurrentQuantity — live listing count
  // Log `Quantity` is how many are LISTED at each point, not how many traded — an average of it
  // measures supply, never flow. Named for what it is so no panel mistakes it for sales.
  // The three log-derived figures are null when the log is too short to compute them.
  listedAvg: number | null; // avg listing count across the price log
  sellThrough: number | null; // avg per-step FRACTION of listings gone (0..1) — sell-through proxy
  momentumPct: number | null; // price change first→last of the log
  samples: number; // price-log points — 0 = poe2scout has no recent history for it
  sparkPrices: number[]; // daily log prices, oldest→newest — for row sparklines
  /** ISO time poe2scout last set this price; null when its history has no point for the item. */
  priceAt: string | null;
}

/** Fetch every page of one category, in order, stopping at the page count scout reports. */
export async function fetchCategoryPages(
  category: string,
  fetchPage: (page: number) => Promise<ByCategoryPage>,
): Promise<ByCategoryItem[]> {
  const items: ByCategoryItem[] = [];
  for (let page = 1; page <= MAX_DEMAND_PAGES; page += 1) {
    const res = await fetchPage(page);
    // an ignored page param would hand back page 1 forever and duplicate every row
    if (res.CurrentPage !== page) throw new Error(`poe2scout "${category}" asked for page ${page}, got page ${res.CurrentPage}`);
    items.push(...res.Items);
    if (page >= res.Pages) return items;
  }
  throw new Error(`poe2scout "${category}" uniques have more than ${MAX_DEMAND_PAGES} pages — endpoint shape changed?`);
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

interface LogSummary {
  listedAvg: number | null;
  sellThrough: number | null;
  momentumPct: number | null;
  recentPrice: number;
  prices: number[];
}

function summarizeLogs(logs: ByCategoryItem["PriceLogs"]): LogSummary {
  // API returns the log NEWEST-FIRST — sort oldest→newest or momentum comes out sign-flipped
  const pts = (logs ?? [])
    .filter((l): l is PriceLogEntry => l != null)
    .sort((a, b) => (a.Time ?? "").localeCompare(b.Time ?? ""));
  const prices = pts.map((p) => p.Price).filter((p): p is number => p != null && p > 0);
  const qtys = pts.map((p) => p.Quantity).filter((q): q is number => q != null);
  // momentum from the median of the older vs newer half — robust to a single spike point
  const half = Math.floor(prices.length / 2);
  const older = median(prices.slice(0, half));
  const newer = median(prices.slice(half));
  return {
    listedAvg: qtys.length > 0 ? qtys.reduce((a, b) => a + b, 0) / qtys.length : null,
    sellThrough: sellThroughProxy(qtys), // qtys follow the time-sorted points (oldest→newest)
    momentumPct: prices.length >= 2 && older > 0 ? ((newer - older) / older) * 100 : null,
    // recent anchor = median of the LAST 3 log points, not the whole week — a full-log median
    // lags fast movers by days (Temporalis pumped 1.4M→3.4M ex in a week; week-median said 1.5M)
    recentPrice: median(prices.slice(-3)),
    prices,
  };
}

/** Newest history point per item id, as ISO. Throws on an unparseable time: a shape change, not "unknown". */
export function newestPointByItem(raw: z.infer<typeof PriceHistorySchema>): Map<number, string> {
  const out = new Map<number, string>();
  for (const h of raw.ItemHistories) {
    let newest = -Infinity;
    for (const p of h.History) {
      const ms = Date.parse(p.Time);
      if (!Number.isFinite(ms)) throw new Error(`poe2scout price history: unparseable time "${p.Time}" for item ${h.ItemId}`);
      newest = Math.max(newest, ms);
    }
    if (newest > -Infinity) out.set(h.ItemId, new Date(newest).toISOString());
  }
  return out;
}

/** Priced, named uniques → board items; `priceAt` comes from the bulk history (missing = null). */
export function toDemandItems(raw: readonly ByCategoryItem[], priceAt: ReadonlyMap<number, string>): DemandItem[] {
  return (
    raw
      // "INCOMPLETE" = poe2scout's placeholder name for unreleased/unidentified uniques — not tradeable
      .filter((r) => r.CurrentPrice != null && r.Name != null && r.Name !== "INCOMPLETE")
      .map((r) => {
        const { listedAvg, sellThrough, momentumPct, recentPrice, prices } = summarizeLogs(r.PriceLogs);
        // display price = CurrentPrice, unless it's a >3× outlier vs the recent log (price-fix
        // manipulation / lone mispriced listing) — then trust the recent median instead
        const cur = r.CurrentPrice!;
        const outlier = recentPrice > 0 && (cur > recentPrice * 3 || cur < recentPrice / 3);
        return {
          id: r.ItemId,
          name: r.Name!,
          type: r.Type ?? "",
          category: r.CategoryApiId,
          icon: r.IconUrl ?? null,
          priceExalt: outlier ? recentPrice : cur,
          rawPriceExalt: cur,
          quantity: r.CurrentQuantity ?? 0,
          listedAvg,
          sellThrough,
          momentumPct,
          samples: prices.length,
          sparkPrices: prices,
          priceAt: priceAt.get(r.ItemId) ?? null,
        };
      })
  );
}

/** True when at least one item has a recent price-log point; false = scout has no history this league. */
export const hasPriceHistory = (items: readonly DemandItem[]): boolean => items.some((i) => i.samples > 0);

/**
 * Every page of every demand category, sequentially (one request at a time is plenty for a
 * 30-minute cache and is polite to a free API). A single dead category degrades the board with a
 * warning; ALL of them dead is an outage (moved host, dead league name) and throws.
 */
async function fetchDemandPages(league: string): Promise<{ items: ByCategoryItem[]; warnings: string[] }> {
  const lp = encodeURIComponent(league);
  const items: ByCategoryItem[] = [];
  const failures: string[] = [];
  for (const c of DEMAND_CATEGORIES) {
    try {
      // query params are lowercase per openapi/v1.json (category/page/perPage)
      const fetchPage = (page: number) =>
        scoutGet(`/${SCOUT_REALM}/Leagues/${lp}/Uniques/ByCategory?category=${c}&page=${page}&perPage=100`, ByCategoryPageSchema);
      items.push(...(await fetchCategoryPages(c, fetchPage)));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[scout] demand category "${c}" failed: ${message}`);
      failures.push(`${c}: ${message}`);
    }
  }
  if (failures.length === DEMAND_CATEGORIES.length) {
    throw new Error(`poe2scout demand unavailable for "${league}" — all categories failed: ${failures.join("; ")}`);
  }
  return { items, warnings: failures.map((f) => `poe2scout category failed — ${f}`) };
}

/** Price ages for the board. A failure leaves every age unknown and says so; it does not sink the prices. */
async function fetchPriceAges(league: string): Promise<{ ages: Map<number, string>; warning: string | null }> {
  try {
    const raw = await scoutGet(`/${SCOUT_REALM}/Leagues/${encodeURIComponent(league)}/Items/PriceHistory`, PriceHistorySchema);
    return { ages: newestPointByItem(raw), warning: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[scout] price history failed: ${message}`);
    return { ages: new Map(), warning: `price ages unavailable (poe2scout: ${message})` };
  }
}

type DemandData = { rates: ScoutRates; items: DemandItem[]; warnings: string[] };
let demandCache: (DemandData & { at: number; league: string }) | null = null;

/** Freshness of the in-process scout caches (ms epoch of the newest fetch), null if never fetched. */
export function scoutFetchedAt(): number | null {
  const at = Math.max(scoutItemsFetchedAt() ?? 0, demandCache?.at ?? 0);
  return at > 0 ? at : null;
}

/** Flow + momentum + price age for gear uniques across the demand categories, cached per league. */
export async function fetchDemand(): Promise<DemandData> {
  const league = getDefaultLeague();
  if (demandCache && demandCache.league === league && Date.now() - demandCache.at < SCOUT_CACHE_TTL_MS) {
    return demandCache;
  }
  const rates = await fetchScoutRates(league);
  const pages = await fetchDemandPages(league);
  const { ages, warning } = await fetchPriceAges(league);
  const items = toDemandItems(pages.items, ages);
  demandCache = { at: Date.now(), league, rates, items, warnings: [...pages.warnings, ...(warning ? [warning] : [])] };
  return demandCache;
}
