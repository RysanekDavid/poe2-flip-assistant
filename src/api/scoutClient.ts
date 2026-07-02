import axios, { AxiosError } from "axios";
import { config } from "../config/env";

/**
 * poe2scout client — the WEB-TRADE item economy (uniques/gear), which the in-game
 * Currency Exchange (poe.ninja) doesn't cover. Reachable without the Cloudflare/Referer
 * wall ninja needs. Prices are aggregate (~daily), NOT live listings — for live snipes
 * the user opens a trade2 deep-link (see lib/tradeLink).
 */
const BASE = "https://poe2scout.com/api";
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

interface ScoutLeague {
  Value: string;
  ShortName: string;
  IsCurrent: boolean;
  DivinePrice: number; // exalt per divine
  ChaosDivinePrice: number; // chaos per divine
}

interface ScoutItemRaw {
  ItemId: number;
  CategoryApiId: string;
  Name: string | null;
  Type: string | null;
  CurrentPrice: number | null;
  IconUrl: string | null;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // scout aggregates daily; 30min is plenty
let cache: { at: number; rates: ScoutRates; items: ScoutItem[] } | null = null;

async function get<T>(path: string): Promise<T> {
  try {
    const res = await axios.get(`${BASE}${path}`, {
      timeout: 20_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      },
    });
    return res.data as T;
  } catch (err) {
    const ax = err as AxiosError;
    throw new Error(`poe2scout fetch failed for ${path} (${ax.response?.status ?? "no-status"}): ${ax.message}`);
  }
}

/** Pick the league row. "Runes of Aldur" exists as both SC (ShortName "runes") and HC
 *  ("runeshc") with the SAME Value — prefer softcore unless the configured name ends hc. */
function pickLeague(rows: ScoutLeague[]): ScoutLeague {
  const matches = rows.filter((l) => l.Value === config.league);
  if (matches.length === 0) throw new Error(`poe2scout: league "${config.league}" not found`);
  const sc = matches.find((l) => !/hc$/i.test(l.ShortName));
  return sc ?? matches[0]!;
}

/** Fetch league rates + the full priced-uniques list, cached. */
export async function fetchScout(): Promise<{ rates: ScoutRates; items: ScoutItem[] }> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;

  const leagues = await get<ScoutLeague[]>(`/${REALM}/Leagues`);
  const lg = pickLeague(leagues);
  if (!(lg.DivinePrice > 0) || !(lg.ChaosDivinePrice > 0)) {
    throw new Error(`poe2scout: bad rates for "${config.league}" (div ${lg.DivinePrice}, chaos ${lg.ChaosDivinePrice})`);
  }
  const rates: ScoutRates = { exaltPerDivine: lg.DivinePrice, chaosPerDivine: lg.ChaosDivinePrice };

  const raw = await get<ScoutItemRaw[]>(`/${REALM}/Leagues/${encodeURIComponent(config.league)}/Items?perPage=2000`);
  const items: ScoutItem[] = raw
    .filter((r) => r.CurrentPrice != null && r.Name != null)
    .map((r) => ({
      id: r.ItemId,
      name: r.Name!,
      type: r.Type ?? "",
      category: r.CategoryApiId,
      priceExalt: r.CurrentPrice!,
      icon: r.IconUrl,
    }));

  cache = { at: Date.now(), rates, items };
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
  priceExalt: number; // robust median of the price log (falls back to CurrentPrice)
  rawPriceExalt: number; // poe2scout CurrentPrice as-is (the noisy headline)
  quantity: number; // CurrentQuantity — live listing count
  turnover: number; // avg traded quantity across the price log — flow proxy
  momentumPct: number; // price change first→last of the log
  samples: number; // price-log points behind the median — low = untrustworthy
}

interface ByCategoryRaw {
  Items: Array<{
    ItemId: number;
    Name: string | null;
    Type: string | null;
    CategoryApiId: string;
    IconUrl: string | null;
    CurrentPrice: number | null;
    CurrentQuantity: number | null;
    PriceLogs: Array<{ Price: number | null; Quantity: number | null } | null> | null;
  }>;
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
  medianPrice: number;
  samples: number;
} {
  const pts = (logs ?? []).filter((l): l is { Price: number | null; Quantity: number | null } => l != null);
  const prices = pts.map((p) => p.Price).filter((p): p is number => p != null && p > 0);
  const qtys = pts.map((p) => p.Quantity).filter((q): q is number => q != null);
  const turnover = qtys.length ? qtys.reduce((a, b) => a + b, 0) / qtys.length : 0;
  // momentum from the median of the older vs newer half — robust to a single spike point
  const half = Math.floor(prices.length / 2);
  const older = median(prices.slice(0, half));
  const newer = median(prices.slice(half));
  const momentumPct = prices.length >= 2 && older > 0 ? ((newer - older) / older) * 100 : 0;
  return { turnover, momentumPct, medianPrice: median(prices), samples: prices.length };
}

let demandCache: { at: number; rates: ScoutRates; items: DemandItem[] } | null = null;

/** Fetch flow + momentum for gear uniques across the relevant categories (one page each). */
export async function fetchDemand(): Promise<{ rates: ScoutRates; items: DemandItem[] }> {
  if (demandCache && Date.now() - demandCache.at < CACHE_TTL_MS) return demandCache;

  const leagues = await get<ScoutLeague[]>(`/${REALM}/Leagues`);
  const lg = pickLeague(leagues);
  const rates: ScoutRates = { exaltPerDivine: lg.DivinePrice, chaosPerDivine: lg.ChaosDivinePrice };

  const lp = encodeURIComponent(config.league);
  const pages = await Promise.all(
    DEMAND_CATEGORIES.map((c) =>
      get<ByCategoryRaw>(`/${REALM}/Leagues/${lp}/Uniques/ByCategory?Category=${c}&page=1&perPage=100`).catch(
        () => ({ Items: [] }) as ByCategoryRaw,
      ),
    ),
  );

  const items: DemandItem[] = pages
    .flatMap((p) => p.Items)
    // "INCOMPLETE" = poe2scout's placeholder name for unreleased/unidentified uniques — not tradeable
    .filter((r) => r.CurrentPrice != null && r.Name != null && r.Name !== "INCOMPLETE")
    .map((r) => {
      const { turnover, momentumPct, medianPrice, samples } = summarizeLogs(r.PriceLogs);
      return {
        id: r.ItemId,
        name: r.Name!,
        type: r.Type ?? "",
        category: r.CategoryApiId,
        icon: r.IconUrl,
        priceExalt: medianPrice > 0 ? medianPrice : r.CurrentPrice!,
        rawPriceExalt: r.CurrentPrice!,
        quantity: r.CurrentQuantity ?? 0,
        turnover,
        momentumPct,
        samples,
      };
    });

  demandCache = { at: Date.now(), rates, items };
  return demandCache;
}
