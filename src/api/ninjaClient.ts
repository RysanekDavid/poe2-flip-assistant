import axios, { AxiosError } from "axios";
import { z } from "zod";
import {
  CATEGORIES,
  NinjaResponseSchema,
  type LeagueOption,
  type NinjaCategory,
  type NinjaResponse,
  type PricedItem,
} from "./types";
import { ninjaLimiter } from "./rateLimiter";
import { getActiveLeague } from "../core/leagueState";

const BASE = "https://poe.ninja/poe2/api/economy";

/** Cloudflare on poe.ninja rejects requests lacking a same-site Referer. */
function leagueSlug(league: string): string {
  return league.toLowerCase().replace(/\s+/g, "");
}

function browserHeaders(league: string): Record<string, string> {
  return {
    Referer: `https://poe.ninja/poe2/economy/${leagueSlug(league)}/currency`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
  };
}

/** In-memory cache; poe.ninja updates ~hourly, so 1h TTL is safe. */
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; data: NinjaResponse }>();

/** League is part of the key — a runtime switch must not serve the old league's prices. */
function cacheKey(c: NinjaCategory, league: string): string {
  return `${league}|${c.endpoint}|${c.type}`;
}

/**
 * Fetch one category. Rate-limited, cached, and runtime-validated.
 * Throws loudly on network failure or schema mismatch — no silent fallback.
 */
export async function fetchCategory(category: NinjaCategory): Promise<NinjaResponse> {
  const league = getActiveLeague();
  const key = cacheKey(category, league);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  const url = `${BASE}/${category.endpoint}`;
  const raw = await ninjaLimiter.schedule(async () => {
    try {
      const res = await axios.get(url, {
        params: { league, type: category.type },
        timeout: 20_000,
        headers: browserHeaders(league),
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

/**
 * Verified live shape: a flat array of `{ id, name }` and NOTHING else — no current/active
 * flag, e.g. [{"id":"Forbidden Rites",...},{"id":"Runes of Aldur",...},{"id":"HC Forbidden
 * Rites",...},{"id":"Standard",...}]. Order carries the signal (newest league first).
 */
const NinjaLeaguesSchema = z.array(
  z
    .object({
      id: z.string().min(1).nullish(),
      name: z.string().min(1).nullish(),
    })
    .passthrough(),
);

/**
 * Map a raw `/economy/leagues` payload to league options, ORDER PRESERVED — `current` stays
 * null because ninja exposes no such flag. Exported so detection tests run the real response
 * shape through the real parser without touching the network.
 */
export function parseNinjaLeagues(raw: unknown): LeagueOption[] {
  const parsed = NinjaLeaguesSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`poe.ninja league list shape mismatch: ${JSON.stringify(raw).slice(0, 300)}`);
  }
  return parsed.data
    .map((r) => ({ name: (r.name ?? r.id ?? "").trim(), current: null }))
    .filter((l) => l.name !== "");
}

/** Leagues poe.ninja indexes, newest first — the ninja half of league-switch detection. */
export async function fetchNinjaLeagues(): Promise<LeagueOption[]> {
  const league = getActiveLeague();
  const raw = await ninjaLimiter.schedule(async () => {
    try {
      const res = await axios.get(`${BASE}/leagues`, { timeout: 20_000, headers: browserHeaders(league) });
      return res.data as unknown;
    } catch (err) {
      const ax = err as AxiosError;
      throw new Error(`poe.ninja league fetch failed (${ax.response?.status ?? "no-status"}): ${ax.message}`);
    }
  });
  return parseNinjaLeagues(raw);
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
