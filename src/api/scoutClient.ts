import axios, { AxiosError } from "axios";
import { z } from "zod";
import type { LeagueOption } from "./types";
import { getDefaultLeague } from "../core/leagueState";
import { config } from "../config/env";

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
export const SCOUT_REALM = "poe2";

export interface ScoutRates {
  exaltPerDivine: number;
  chaosPerDivine: number;
}

export interface ScoutItem {
  id: number;
  name: string; // unique name, e.g. "Igniferis"
  type: string; // base type, e.g. "Crimson Amulet"
  category: string; // CategoryApiId: accessory | armour | weapon | flask | jewel | ...
  priceExalt: number; // CurrentPrice, in Exalted (scout base currency); 0 = listed, no current price
  icon: string | null;
}

// Response schemas. Only the fields we consume are declared; everything else passes through,
// so scout adding a field is not an outage — but a RENAMED or missing field we depend on fails
// loud in `scoutGet` instead of silently storing zeros.
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

export const SCOUT_CACHE_TTL_MS = 30 * 60 * 1000; // scout aggregates daily; 30min is plenty
// Caches carry their league — a runtime league switch must invalidate them, not serve the old one.
let cache: { at: number; league: string; rates: ScoutRates; items: ScoutItem[] } | null = null;

/** When the /Items cache was last filled (ms epoch), null if never. */
export function scoutItemsFetchedAt(): number | null {
  return cache?.at ?? null;
}

/**
 * Identify honestly instead of spoofing a browser: poe2scout is a FastAPI service without a
 * Cloudflare wall, so a descriptive agent + an operator contact (env DATA_SOURCE_CONTACT /
 * POE_CONTACT, never hardcoded — the repo is committed) lets its operator reach us instead of
 * blocking blind. Verified live: api.poe2scout.com answers 200 to this UA (2026-09-26).
 */
const SCOUT_CONTACT = config.dataSourceContact;
const SCOUT_USER_AGENT = `poe2-coach/1.0${SCOUT_CONTACT ? ` (contact: ${SCOUT_CONTACT})` : ""}`;

/** GET a poe2scout path with the honest UA, parsed against `schema`; throws on transport or shape errors. */
export async function scoutGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    const res = await axios.get(`${BASE}${path}`, {
      timeout: 20_000,
      headers: { "User-Agent": SCOUT_USER_AGENT },
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
    .map((l) => ({
      name: l.Value.trim(),
      current: l.IsCurrent ?? null,
      // Carried so a just-switched league can be given rates without a second round trip.
      exaltPerDivine: l.DivinePrice,
      chaosPerDivine: l.ChaosDivinePrice,
    }))
    .filter((l) => l.name !== "");
}

/** Leagues poe2scout tracks — the scout half of league-switch detection (it DOES flag IsCurrent). */
export async function fetchScoutLeagues(): Promise<LeagueOption[]> {
  const rows = await scoutGet(`/${SCOUT_REALM}/Leagues`, ScoutLeaguesSchema);
  return parseScoutLeagues(rows);
}

/** One league's scout rates (a single small request); throws on a missing league or non-positive rates. */
export async function fetchScoutRates(league: string): Promise<ScoutRates> {
  const leagues = await scoutGet(`/${SCOUT_REALM}/Leagues`, ScoutLeaguesSchema);
  const lg = pickLeague(leagues, league);
  if (!(lg.DivinePrice > 0) || !(lg.ChaosDivinePrice > 0)) {
    throw new Error(`poe2scout: bad rates for "${league}" (div ${lg.DivinePrice}, chaos ${lg.ChaosDivinePrice})`);
  }
  return { exaltPerDivine: lg.DivinePrice, chaosPerDivine: lg.ChaosDivinePrice };
}

/** Fetch `league`'s rates + the full priced-uniques list, cached per league. */
export async function fetchScout(league: string = getDefaultLeague()): Promise<{ rates: ScoutRates; items: ScoutItem[] }> {
  if (cache && cache.league === league && Date.now() - cache.at < SCOUT_CACHE_TTL_MS) return cache;
  const rates = await fetchScoutRates(league);

  // /Items takes NO query params (openapi/v1.json) and returns the whole league list — the old
  // ?perPage=2000 was silently ignored.
  const raw = await scoutGet(`/${SCOUT_REALM}/Leagues/${encodeURIComponent(league)}/Items`, ScoutItemsSchema);
  const items: ScoutItem[] = raw
    .filter((r) => r.Name != null)
    .map((r) => ({
      id: r.ItemId,
      name: r.Name!,
      type: r.Type ?? "",
      category: r.CategoryApiId,
      // null = listed without a current price; the same 0 the lineage list uses ("listed at 0")
      priceExalt: r.CurrentPrice ?? 0,
      icon: r.IconUrl ?? null,
    }));

  cache = { at: Date.now(), league, rates, items };
  return cache;
}

// --- lineage support gems: a CURRENCY category, not a unique one, so /Items never lists them ---

const CurrencyPageSchema = z
  .object({
    CurrentPage: z.number(),
    Pages: z.number(),
    Items: z.array(
      z
        .object({
          ApiId: z.string(),
          Text: z.string(),
          CurrentPrice: z.number().nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export interface ScoutLineageGem {
  name: string;
  /** Exalted, like /Items (checked 2026-09-29: Uul-Netol's Embrace 360k ex ≈ 669 div at 538 ex/div). 0 = listed without a current price. */
  priceExalt: number;
}

// ~75 gems exist; a runaway page count means the endpoint changed shape, not that there are more gems
const MAX_LINEAGE_PAGES = 5;

/** Every lineage gem poe2scout lists in `league`; a null price comes back as 0 ("listed, no current price"). */
export async function fetchScoutLineage(league: string): Promise<ScoutLineageGem[]> {
  const lp = encodeURIComponent(league);
  const gems: ScoutLineageGem[] = [];
  for (let page = 1; page <= MAX_LINEAGE_PAGES; page += 1) {
    const res = await scoutGet(`/${SCOUT_REALM}/Leagues/${lp}/Currencies/ByCategory?category=lineagesupportgems&page=${page}&perPage=100`, CurrencyPageSchema);
    for (const i of res.Items) gems.push({ name: i.Text, priceExalt: i.CurrentPrice != null && i.CurrentPrice > 0 ? i.CurrentPrice : 0 });
    if (page < res.Pages) continue;
    // an empty category is a renamed/moved endpoint, not a league without lineage gems
    if (gems.length === 0) throw new Error(`poe2scout lineage list for "${league}" is empty — category renamed?`);
    return gems;
  }
  throw new Error(`poe2scout lineage list for "${league}" has more than ${MAX_LINEAGE_PAGES} pages — endpoint shape changed?`);
}
