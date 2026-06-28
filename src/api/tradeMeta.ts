import axios, { AxiosError } from "axios";

/**
 * Static reference data from the official PoE2 trade site: the mod (stat) list and
 * the base-type list. Both power the Craft Planner — pick a base, pick target mods,
 * and we build a live trade2 search link. Reachable without the Cloudflare wall.
 * These change only on patches, so cache hard.
 */
const TRADE2_DATA = "https://www.pathofexile.com/api/trade2/data";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

export interface StatOption {
  id: string; // e.g. "explicit.stat_3299347043"
  text: string; // e.g. "+# to maximum Life"
  group: string; // explicit | implicit | pseudo | rune
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
let cache: { at: number; stats: StatOption[]; bases: BaseGroup[]; uniques: UniqueOption[] } | null = null;

async function get<T>(path: string): Promise<T> {
  try {
    const res = await axios.get(`${TRADE2_DATA}${path}`, { timeout: 25_000, headers: { "User-Agent": UA } });
    return res.data as T;
  } catch (err) {
    const ax = err as AxiosError;
    throw new Error(`trade2 data fetch failed for ${path} (${ax.response?.status ?? "no-status"}): ${ax.message}`);
  }
}

// Mod groups worth crafting toward. Skip enchant/sanctum/etc noise.
const STAT_GROUPS = new Set(["explicit", "implicit", "pseudo", "rune"]);

export async function fetchTradeMeta(): Promise<{ stats: StatOption[]; bases: BaseGroup[]; uniques: UniqueOption[] }> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;

  const [statsRaw, itemsRaw] = await Promise.all([get<StatsResp>("/stats"), get<ItemsResp>("/items")]);

  const stats: StatOption[] = statsRaw.result
    .filter((g) => STAT_GROUPS.has(g.id))
    .flatMap((g) => g.entries.map((e) => ({ id: e.id, text: e.text, group: g.id })));

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

  cache = { at: Date.now(), stats, bases, uniques };
  return cache;
}
