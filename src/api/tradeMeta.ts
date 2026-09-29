import axios, { AxiosError } from "axios";
import { config } from "../config/env";

/**
 * Static reference data from the official PoE2 trade site: the mod (stat) list and
 * the base-type list. Both power the Craft Planner — pick a base, pick target mods,
 * and we build a live trade2 search link. Reachable without the Cloudflare wall.
 * These change only on patches, so cache hard.
 */
const TRADE2_DATA = "https://www.pathofexile.com/api/trade2/data";

/**
 * GGG asks third-party tools to identify themselves with a reachable contact; a spoofed browser UA
 * hides who is calling. No contact means no request: the caller sees why instead of a silent 403.
 */
export function tradeMetaUserAgent(contact: string): string {
  const trimmed = contact.trim();
  if (!trimmed) throw new Error("DATA_SOURCE_CONTACT or POE_CONTACT is required for trade2 data requests");
  return `poe2-flip-assistant/0.1 read-only data (+${trimmed})`;
}

export interface StatOption {
  id: string; // e.g. "explicit.stat_3299347043"
  text: string; // e.g. "+# to maximum Life"
  group: string; // explicit | implicit | pseudo | rune (| fractured | desecrated | crafted in flaggedStats)
}

export interface BaseGroup {
  category: string; // e.g. "Body Armours"
  types: string[]; // base type names
}

export interface UniqueOption {
  name: string; // unique's proper name, e.g. "Headhunter"
  type: string; // its base type, e.g. "Leather Belt"
}

interface StatsResp {
  result: Array<{ id: string; label: string; entries: Array<{ id: string; text: string; type?: string }> }>;
}
interface ItemsResp {
  result: Array<{ id: string; label: string; entries: Array<{ type?: string; name?: string }> }>;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
interface TradeMeta {
  /** When this snapshot was fetched (ms epoch) — callers memoize on it and show its age. */
  at: number;
  stats: StatOption[];
  // Fractured/desecrated/crafted twins of explicit mods. Kept OUT of `stats` so autocompletes, snipe and
  // hunt resolution keep their explicit-first catalog; only craft legs that must search the flag
  // itself (a fractured +3 amulet is a different product) index these.
  flaggedStats: StatOption[];
  bases: BaseGroup[];
  uniques: UniqueOption[];
}

let cache: TradeMeta | null = null;

async function get<T>(path: string): Promise<T> {
  const userAgent = tradeMetaUserAgent(config.dataSourceContact);
  try {
    const res = await axios.get(`${TRADE2_DATA}${path}`, { timeout: 25_000, headers: { "User-Agent": userAgent } });
    return res.data as T;
  } catch (err) {
    const ax = err as AxiosError;
    throw new Error(`trade2 data fetch failed for ${path} (${ax.response?.status ?? "no-status"}): ${ax.message}`);
  }
}

// Mod groups worth crafting toward. Skip enchant/sanctum/etc noise.
const STAT_GROUPS = new Set(["explicit", "implicit", "pseudo", "rune"]);
const FLAGGED_GROUPS = new Set(["fractured", "desecrated", "crafted"]);

const toOptions = (raw: StatsResp, groups: ReadonlySet<string>): StatOption[] =>
  raw.result.filter((g) => groups.has(g.id)).flatMap((g) => g.entries.map((e) => ({ id: e.id, text: e.text, group: g.id })));

export async function fetchTradeMeta(): Promise<TradeMeta> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;

  const [statsRaw, itemsRaw] = await Promise.all([get<StatsResp>("/stats"), get<ItemsResp>("/items")]);

  const stats = toOptions(statsRaw, STAT_GROUPS);
  const flaggedStats = toOptions(statsRaw, FLAGGED_GROUPS);

  // base types: entries carrying a `type` but NOT a unique `name` are craftable bases
  const bases: BaseGroup[] = itemsRaw.result
    .map((g) => ({
      category: g.label,
      types: [...new Set(g.entries.filter((e) => e.type && !e.name).map((e) => e.type!))].sort(),
    }))
    .filter((g) => g.types.length > 0);

  // uniques: entries carrying a proper `name` — powers the snipe name autocomplete
  const uniques: UniqueOption[] = itemsRaw.result
    .flatMap((g) => g.entries)
    .filter((e) => e.name)
    .map((e) => ({ name: e.name!, type: e.type ?? "" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  cache = { at: Date.now(), stats, flaggedStats, bases, uniques };
  return cache;
}
