import axios, { AxiosError } from "axios";
import {
  CATEGORIES,
  NinjaResponseSchema,
  type NinjaCategory,
  type NinjaResponse,
  type PricedItem,
} from "./types";
import { ninjaLimiter } from "./rateLimiter";
import { config } from "../config/env";

const BASE = "https://poe.ninja/poe2/api/economy";

/** Cloudflare on poe.ninja rejects requests lacking a same-site Referer. */
function leagueSlug(league: string): string {
  return league.toLowerCase().replace(/\s+/g, "");
}

const REFERER = `https://poe.ninja/poe2/economy/${leagueSlug(config.league)}/currency`;
const BROWSER_HEADERS = {
  Referer: REFERER,
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
};

/** In-memory cache; poe.ninja updates ~hourly, so 1h TTL is safe. */
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: NinjaResponse }>();

function cacheKey(c: NinjaCategory): string {
  return `${c.endpoint}|${c.type}`;
}

/**
 * Fetch one category. Rate-limited, cached, and runtime-validated.
 * Throws loudly on network failure or schema mismatch — no silent fallback.
 */
export async function fetchCategory(category: NinjaCategory): Promise<NinjaResponse> {
  const key = cacheKey(category);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const url = `${BASE}/${category.endpoint}`;
  const raw = await ninjaLimiter.schedule(async () => {
    try {
      const res = await axios.get(url, {
        params: { league: config.league, type: category.type },
        timeout: 20_000,
        headers: BROWSER_HEADERS,
      });
      return res.data;
    } catch (err) {
      const ax = err as AxiosError;
      throw new Error(
        `poe.ninja fetch failed for ${category.type} (${ax.response?.status ?? "no-status"}): ${ax.message}`,
      );
    }
  });

  const parsed = NinjaResponseSchema.safeParse(raw);
  if (!parsed.success) {
    // Fail loud: dump a snippet so the undocumented shape can be diagnosed.
    const snippet = JSON.stringify(raw).slice(0, 600);
    throw new Error(
      `poe.ninja response shape mismatch for ${category.type}: ` +
        `${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}\n` +
        `raw[0:600]=${snippet}`,
    );
  }

  cache.set(key, { at: Date.now(), data: parsed.data });
  return parsed.data;
}

/** poe.ninja icons come as full poecdn URLs or root-relative `/gen/image/...` paths. */
function iconUrl(image: string | null | undefined): string | null {
  if (!image) return null;
  return image.startsWith("http") ? image : `https://web.poecdn.com${image}`;
}

/** Join lines+items into normalized chaos-based PricedItems. */
export function normalize(resp: NinjaResponse, category: string): PricedItem[] {
  const meta = new Map(resp.items.map((i) => [i.id, i]));
  return resp.lines.map((line) => {
    const item = meta.get(line.id);
    return {
      itemId: line.id,
      itemName: item?.name ?? line.id,
      category,
      // primaryValue is already the base-currency price; no inversion (PoE1 logic dropped).
      baseValue: line.primaryValue,
      volume: line.volumePrimaryValue ?? 0,
      change7d: line.sparkline?.totalChange ?? null,
      // drop ninja's null padding so downstream (oscillation) sees a clean number series
      spark7d: line.sparkline?.data?.filter((n): n is number => n != null) ?? null,
      icon: iconUrl(item?.image),
    };
  });
}

/** Fetch + normalize all configured categories. */
export async function fetchAll(): Promise<PricedItem[]> {
  const out: PricedItem[] = [];
  for (const cat of CATEGORIES) {
    const resp = await fetchCategory(cat);
    out.push(...normalize(resp, cat.type));
  }
  return out;
}
