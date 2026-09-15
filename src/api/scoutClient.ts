import axios, { AxiosError } from "axios";
import { z } from "zod";
import type { LeagueOption } from "./types";
import { getActiveLeague } from "../core/leagueState";

/**
 * poe2scout client — the WEB-TRADE item economy (uniques/gear), which the in-game
 * Currency Exchange (poe.ninja) doesn't cover. Reachable without the Cloudflare/Referer
 * wall ninja needs. Prices are aggregate (~daily), NOT live listings — for live snipes
 * the user opens a trade2 deep-link (see lib/tradeLink).
 *
 * The API moved to its own host: poe2scout.com/api/* now 404s, api.poe2scout.com serves the
 * SAME `/{realm}/Leagues/...` path scheme (verified against https://api.poe2scout.com/openapi/v1.json).
 */
const BASE = "https://api.poe2scout.com";
const REALM = "poe2";

export interface ScoutRates {
  exaltPerDivine: number;
  chaosPerDivine: number;
}

export interface ScoutItem {
  id: number;
  name: string; // unique name, e.g. "Igniferis"
  type: string; // base type, e.g. "Crimson Amulet"
  category: string; // CategoryApiId: accessory | armour | weapon | flask | jewel | ...
  priceExalt: number; // CurrentPrice, in Exalted (scout base currency)
  icon: string | null;
}

// Response schemas. Only the fields we consume are declared; everything else passes through,
// so scout adding a field is not an outage — but a RENAMED or missing field we depend on fails
// loud in `get` instead of silently storing zeros.
const ScoutLeagueSchema = z
  .object({
    Value: z.string(),
    ShortName: z.string(),
    IsCurrent: z.boolean().nullish(),
    DivinePrice: z.number(), // exalt per divine
    ChaosDivinePrice: z.number(), // chaos per divine
  })
  .passthrough();
const ScoutLeaguesSchema = z.array(ScoutLeagueSchema);
type ScoutLeague = z.infer<typeof ScoutLeagueSchema>;

const ScoutItemsSchema = z.array(
  z
    .object({
      ItemId: z.number(),
      CategoryApiId: z.string(),
      Name: z.string().nullish(),
      Type: z.string().nullish(),
      CurrentPrice: z.number().nullish(),
      IconUrl: z.string().nullish(),
    })
    .passthrough(),
);

const PriceLogEntrySchema = z
  .object({
    Price: z.number().nullish(),
    Quantity: z.number().nullish(),
    Time: z.string().nullish(),
  })
  .passthrough();
// scout pads sparse logs with nulls, so an entry may be absent entirely.
const PriceLogSchema = PriceLogEntrySchema.nullable();
type PriceLogEntry = z.infer<typeof PriceLogEntrySchema>;

const ByCategorySchema = z
  .object({
    Items: z.array(
      z
        .object({
          ItemId: z.number(),
          Name: z.string().nullish(),
          Type: z.string().nullish(),
          CategoryApiId: z.string(),
          IconUrl: z.string().nullish(),
          CurrentPrice: z.number().nullish(),
          CurrentQuantity: z.number().nullish(),
          PriceLogs: z.array(PriceLogSchema).nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();
type ByCategoryRaw = z.infer<typeof ByCategorySchema>;

const CACHE_TTL_MS = 30 * 60 * 1000; // scout aggregates daily; 30min is plenty
// Caches carry their league — a runtime league switch must invalidate them, not serve the old one.
let cache: { at: number; league: string; rates: ScoutRates; items: ScoutItem[] } | null = null;

async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const res = await axios.get(`${BASE}${path}`, {
      timeout: 20_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      },
    });
    raw = res.data;
  } catch (err) {
    const ax = err as AxiosError;
    throw new Error(`poe2scout fetch failed for ${path} (${ax.response?.status ?? "no-status"}): ${ax.message}`);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    // A moved host or renamed field must surface here, not as an empty board of zero prices.
    throw new Error(
      `poe2scout response shape mismatch for ${path}: ` +
        `${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}\n` +
        `raw[0:400]=${JSON.stringify(raw).slice(0, 400)}`,
    );
  }
  return parsed.data;
}

/** Pick the league row by exact `Value`. SC and HC are SEPARATE values ("Runes of Aldur" /
 *  "HC Runes of Aldur"), so this normally matches one row; the ShortName check stays as a
 *  cheap guard in case scout ever collapses the pair again. */
function pickLeague(rows: ScoutLeague[], league: string): ScoutLeague {
  const matches = rows.filter((l) => l.Value === league);
  if (matches.length === 0) throw new Error(`poe2scout: league "${league}" not found`);
  const sc = matches.find((l) => !/hc$/i.test(l.ShortName));
  return sc ?? matches[0]!;
}

/**
 * Map a raw `/{realm}/Leagues` payload to league options. Exported so the detection tests can
 * run the real response shape through the real parser without touching the network.
 */
export function parseScoutLeagues(raw: unknown): LeagueOption[] {
  const parsed = ScoutLeaguesSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`poe2scout league list shape mismatch: ${JSON.stringify(raw).slice(0, 300)}`);
  return parsed.data
    .map((l) => ({ name: l.Value.trim(), current: l.IsCurrent ?? null }))
    .filter((l) => l.name !== "");
}

/** Leagues poe2scout tracks — the scout half of league-switch detection (it DOES flag IsCurrent). */
export async function fetchScoutLeagues(): Promise<LeagueOption[]> {
  const rows = await get(`/${REALM}/Leagues`, ScoutLeaguesSchema);
  return parseScoutLeagues(rows);
}

/** Fetch league rates + the full priced-uniques list, cached. */
export async function fetchScout(): Promise<{ rates: ScoutRates; items: ScoutItem[] }> {
  const league = getActiveLeague();
  if (cache && cache.league === league && Date.now() - cache.at < CACHE_TTL_MS) return cache;

  const leagues = await get(`/${REALM}/Leagues`, ScoutLeaguesSchema);
  const lg = pickLeague(leagues, league);
  if (!(lg.DivinePrice > 0) || !(lg.ChaosDivinePrice > 0)) {
    throw new Error(`poe2scout: bad rates for "${league}" (div ${lg.DivinePrice}, chaos ${lg.ChaosDivinePrice})`);
  }
  const rates: ScoutRates = { exaltPerDivine: lg.DivinePrice, chaosPerDivine: lg.ChaosDivinePrice };

  // /Items takes NO query params (openapi/v1.json) and returns the whole league list — the old
  // ?perPage=2000 was silently ignored.
  const raw = await get(`/${REALM}/Leagues/${encodeURIComponent(league)}/Items`, ScoutItemsSchema);
  const items: ScoutItem[] = raw
    .filter((r) => r.CurrentPrice != null && r.Name != null)
    .map((r) => ({
      id: r.ItemId,
      name: r.Name!,
      type: r.Type ?? "",
      category: r.CategoryApiId,
      priceExalt: r.CurrentPrice!,
      icon: r.IconUrl ?? null,
    }));

  cache = { at: Date.now(), league, rates, items };
  return cache;
}

// --- demand board: richer per-item data (listings + price history) from ByCategory ---

/** Unique categories with a real secondary market — the flip-relevant ones. */
const DEMAND_CATEGORIES = ["accessory", "armour", "weapon", "flask", "jewel", "sanctum"] as const;

export interface DemandItem {
  id: number;
  name: string;
  type: string;
  category: string;
  icon: string | null;
  priceExalt: number; // current price, outlier-guarded against the recent log (see fetchDemand)
  rawPriceExalt: number; // poe2scout CurrentPrice as-is (the unguarded headline)
  quantity: number; // CurrentQuantity — live listing count
  turnover: number; // avg traded quantity across the price log — flow proxy
  momentumPct: number; // price change first→last of the log
  samples: number; // price-log points behind the median — low = untrustworthy
  sparkPrices: number[]; // daily log prices, oldest→newest — for row sparklines
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function summarizeLogs(logs: ByCategoryRaw["Items"][number]["PriceLogs"]): {
  turnover: number;
  momentumPct: number;
  recentPrice: number;
  samples: number;
  prices: number[];
} {
  // API returns the log NEWEST-FIRST — sort oldest→newest or momentum comes out sign-flipped
  const pts = (logs ?? [])
    .filter((l): l is PriceLogEntry => l != null)
    .sort((a, b) => (a.Time ?? "").localeCompare(b.Time ?? ""));
  const prices = pts.map((p) => p.Price).filter((p): p is number => p != null && p > 0);
  const qtys = pts.map((p) => p.Quantity).filter((q): q is number => q != null);
  const turnover = qtys.length ? qtys.reduce((a, b) => a + b, 0) / qtys.length : 0;
  // momentum from the median of the older vs newer half — robust to a single spike point
  const half = Math.floor(prices.length / 2);
  const older = median(prices.slice(0, half));
  const newer = median(prices.slice(half));
  const momentumPct = prices.length >= 2 && older > 0 ? ((newer - older) / older) * 100 : 0;
  // recent anchor = median of the LAST 3 log points, not the whole week — a full-log median
  // lags fast movers by days (Temporalis pumped 1.4M→3.4M ex in a week; week-median said 1.5M)
  return { turnover, momentumPct, recentPrice: median(prices.slice(-3)), samples: prices.length, prices };
}

/** Freshness of the in-process scout caches (ms epoch of the newest fetch), null if never fetched. */
export function scoutFetchedAt(): number | null {
  const at = Math.max(cache?.at ?? 0, demandCache?.at ?? 0);
  return at > 0 ? at : null;
}

let demandCache: { at: number; league: string; rates: ScoutRates; items: DemandItem[] } | null = null;

/**
 * One page per demand category. A single dead category degrades the board; ALL of them dead is
 * an outage (moved host, dead league name) and throws — a 200 with an empty board would hide
 * exactly the incident class that took this client down.
 */
async function fetchDemandPages(league: string): Promise<ByCategoryRaw[]> {
  const lp = encodeURIComponent(league);
  const failures: string[] = [];
  const pages = await Promise.all(
    DEMAND_CATEGORIES.map((c) =>
      // query params are lowercase per openapi/v1.json (category/page/perPage)
      get(`/${REALM}/Leagues/${lp}/Uniques/ByCategory?category=${c}&page=1&perPage=100`, ByCategorySchema).catch(
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[scout] demand category "${c}" failed: ${message}`);
          failures.push(`${c}: ${message}`);
          return { Items: [] } as ByCategoryRaw;
        },
      ),
    ),
  );
  if (failures.length === DEMAND_CATEGORIES.length) {
    throw new Error(`poe2scout demand unavailable for "${league}" — all categories failed: ${failures.join("; ")}`);
  }
  return pages;
}

/** Fetch flow + momentum for gear uniques across the relevant categories (one page each). */
export async function fetchDemand(): Promise<{ rates: ScoutRates; items: DemandItem[] }> {
  const league = getActiveLeague();
  if (demandCache && demandCache.league === league && Date.now() - demandCache.at < CACHE_TTL_MS) {
    return demandCache;
  }

  const leagues = await get(`/${REALM}/Leagues`, ScoutLeaguesSchema);
  const lg = pickLeague(leagues, league);
  const rates: ScoutRates = { exaltPerDivine: lg.DivinePrice, chaosPerDivine: lg.ChaosDivinePrice };

  const items: DemandItem[] = (await fetchDemandPages(league))
    .flatMap((p) => p.Items)
    // "INCOMPLETE" = poe2scout's placeholder name for unreleased/unidentified uniques — not tradeable
    .filter((r) => r.CurrentPrice != null && r.Name != null && r.Name !== "INCOMPLETE")
    .map((r) => {
      const { turnover, momentumPct, recentPrice, samples, prices } = summarizeLogs(r.PriceLogs);
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
        turnover,
        momentumPct,
        samples,
        sparkPrices: prices,
      };
    });

  demandCache = { at: Date.now(), league, rates, items };
  return demandCache;
}
