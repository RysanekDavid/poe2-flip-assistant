import axios, { AxiosError } from "axios";
import { z } from "zod";

/**
 * GGG's PUBLIC Currency Exchange digest — no auth, no cookies, no Cloudflare wall.
 *
 * One request returns the last hour of in-game exchange activity for EVERY league at once, so
 * this is the fastest possible source of Div/Ex/Chaos rates for a league we just switched to:
 * poe.ninja needs a poll cycle to fill price_snapshots, this is instant.
 *
 * Verified live 2026-09-16. Rates are VOLUME-WEIGHTED effective rates for the sampled hour
 * (volume_traded[a] / volume_traded[b]), not order-book quotes.
 */
const BASE = "https://web.poecdn.com/api/currency-exchange/poe2";

const HOUR_SECONDS = 3600;

/**
 * Exact metadata ids of the three base currencies (poe2 realm, verified live).
 *
 * These are matched with `===` and never by substring: `CurrencyAddModToRare2` is the GREATER
 * Exalted Orb, a different item trading at a different price, and a `startsWith`/`includes`
 * check would silently value the whole app in the wrong currency.
 */
export const CX_CURRENCY_IDS = {
  exalted: "Metadata/Items/Currency/CurrencyAddModToRare",
  divine: "Metadata/Items/Currency/CurrencyModValues",
  chaos: "Metadata/Items/Currency/CurrencyRerollRare",
} as const;

/** Private leagues are published in the same payload; their names always carry this suffix. */
const PRIVATE_LEAGUE = /\(PL\d+\)$/;

// Anything GGG adds passes through untouched; only the fields the rate maths and the market
// history actually consume are declared, so a new field is not an outage.
const CxMarketSchema = z
  .object({
    league: z.string(),
    market_id: z.string(),
    market_pair: z.array(z.string()).min(2),
    volume_traded: z.record(z.number()),
    lowest_ratio: z.record(z.number()).nullish(),
    highest_ratio: z.record(z.number()).nullish(),
    lowest_stock: z.record(z.number()).nullish(),
    highest_stock: z.record(z.number()).nullish(),
  })
  .passthrough();

const CxDigestSchema = z
  .object({
    next_change_id: z.number(),
    markets: z.array(CxMarketSchema),
  })
  .passthrough();

export type CxDigest = z.infer<typeof CxDigestSchema>;
export type CxMarket = z.infer<typeof CxMarketSchema>;

/** Length of one digest window; digest ids are unix-second hour boundaries. */
export const CX_HOUR_SECONDS = HOUR_SECONDS;

export type CxPair = "exalt_per_divine" | "chaos_per_divine" | "exalt_per_chaos";

export interface CxPairRate {
  pair: CxPair;
  /** Volume-weighted effective rate for the hour. */
  rate: number;
  /** Low/high end of the hour's ratio band, or null when the market published no ratios. */
  rateLow: number | null;
  rateHigh: number | null;
  /** Units of the denominator currency traded in the hour — the confidence behind `rate`. */
  sampleVolume: number;
}

export interface CxRates {
  league: string;
  /** The digest's next_change_id: the unix hour boundary the payload was cut at. */
  hour: number;
  exaltPerDivine: number;
  chaosPerDivine: number;
  exaltPerChaos: number;
  /** Divine traded against Exalted in the sampled hour — thin volume means a soft number. */
  volumeDivine: number;
  pairs: CxPairRate[];
}

/** The most recent hour that has finished, which is the newest one with a complete digest. */
export function previousCompletedHour(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / HOUR_SECONDS) * HOUR_SECONDS - HOUR_SECONDS;
}

/** True for the private leagues GGG mixes into the public payload — never a selectable league. */
export function isPrivateLeague(name: string): boolean {
  return PRIVATE_LEAGUE.test(name);
}

/** Distinct public league names present in a digest, private leagues filtered out. */
export function cxLeagues(digest: CxDigest): string[] {
  const seen = new Set<string>();
  for (const m of digest.markets) if (!isPrivateLeague(m.league)) seen.add(m.league);
  return [...seen];
}

// One payload covers every league, so there is never a reason to fetch twice in quick
// succession. The guard is module-level because the poller and the switch bootstrap are
// independent callers that both want "the current hour".
const MIN_FETCH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_HOUR_STEPS = 3;
let lastFetch: { at: number; digest: CxDigest } | null = null;

/**
 * Fetch one hourly digest.
 *
 * Without an explicit `hour` the endpoint returns the FIRST hour of recorded history (Dec 2024,
 * empty), so a recent hour is always requested. A digest that came back empty — or whose
 * next_change_id is the hour we asked for, meaning nothing newer exists — is retried one hour
 * further back, up to MAX_HOUR_STEPS, then fails loudly.
 *
 * Passing `hour` explicitly bypasses the 5-minute throttle: that path is for probes and
 * backfills, not the steady-state callers.
 */
export async function fetchCxDigest(hour?: number): Promise<CxDigest> {
  if (hour != null) return fetchHour(hour);
  if (lastFetch != null && Date.now() - lastFetch.at < MIN_FETCH_INTERVAL_MS) return lastFetch.digest;

  const newest = previousCompletedHour();
  let requested = newest;
  const tried: number[] = [];
  for (let step = 0; step < MAX_HOUR_STEPS; step++) {
    const digest = await fetchHour(requested);
    if (digest.markets.length > 0 && digest.next_change_id !== requested && coversRecentHour(digest, newest)) {
      lastFetch = { at: Date.now(), digest };
      return digest;
    }
    tried.push(requested);
    requested -= HOUR_SECONDS;
  }
  throw new Error(`currency-exchange digest unusable for hours ${tried.join(", ")}`);
}

/**
 * Reject a digest whose own hour is far behind the one we asked for.
 *
 * A CDN that keeps serving an old payload would otherwise look perfectly healthy: the response
 * parses, has markets, and gets re-stored every refresh — so downstream freshness checks would
 * never expire it and the app would quote a dead hour's rates indefinitely.
 */
function coversRecentHour(digest: CxDigest, newestHour: number): boolean {
  return newestHour - digest.next_change_id <= MAX_HOUR_STEPS * HOUR_SECONDS;
}

async function fetchHour(hour: number): Promise<CxDigest> {
  let raw: unknown;
  try {
    const res = await axios.get(`${BASE}/${hour}`, { signal: AbortSignal.timeout(20_000) });
    raw = res.data;
  } catch (err) {
    const ax = err as AxiosError;
    throw new Error(
      `currency-exchange fetch failed for hour ${hour} (${ax.response?.status ?? "no-status"}): ${ax.message}`,
    );
  }

  try {
    return parseCxDigest(raw);
  } catch (err) {
    throw new Error(`hour ${hour}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Parse a raw digest payload without touching the network — the seam the tests use. */
export function parseCxDigest(raw: unknown): CxDigest {
  const parsed = CxDigestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `currency-exchange digest shape mismatch: ` +
        `${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}\n` +
        `raw[0:400]=${JSON.stringify(raw).slice(0, 400)}`,
    );
  }
  return parsed.data;
}

/** The market for an exact unordered id pair in one league, or null. Ids compare with `===`. */
function findMarket(digest: CxDigest, league: string, a: string, b: string): CxMarket | null {
  return (
    digest.markets.find((m) => {
      if (m.league !== league) return false;
      const [first, second] = m.market_pair;
      return (first === a && second === b) || (first === b && second === a);
    }) ?? null
  );
}

/** `numerator` per one `denominator`, taken from a ratio map that may be absent or partial. */
function ratioOf(map: Record<string, number> | null | undefined, numerator: string, denominator: string): number | null {
  const num = map?.[numerator];
  const den = map?.[denominator];
  if (num == null || den == null || !(den > 0) || !(num > 0)) return null;
  return num / den;
}

function pairRate(digest: CxDigest, league: string, pair: CxPair, numerator: string, denominator: string): CxPairRate | null {
  const market = findMarket(digest, league, numerator, denominator);
  if (market == null) return null;
  const num = market.volume_traded[numerator];
  const den = market.volume_traded[denominator];
  if (num == null || den == null || !(num > 0) || !(den > 0)) return null;

  // lowest_ratio/highest_ratio are the hour's extremes; which of the two is numerically larger
  // depends on the pair's orientation, so the band is min/max rather than low/high as named.
  const band = [
    ratioOf(market.lowest_ratio, numerator, denominator),
    ratioOf(market.highest_ratio, numerator, denominator),
  ].filter((n): n is number => n != null);

  return {
    pair,
    rate: num / den,
    rateLow: band.length > 0 ? Math.min(...band) : null,
    rateHigh: band.length > 0 ? Math.max(...band) : null,
    sampleVolume: Math.round(den),
  };
}

/**
 * Div/Ex/Chaos rates for ONE league out of an all-leagues digest.
 *
 * Returns null when that league traded neither core pair in the sampled hour — a league that is
 * hours old, dead, or private. Null is a real answer here, not an error: the caller falls back
 * to ninja/scout rather than storing a fabricated rate.
 *
 * exalt-per-chaos is taken from its own market when one exists, and otherwise composed from the
 * two Divine-denominated rates, which is arithmetically the same trade routed through Divine.
 */
export function deriveCxRates(digest: CxDigest, league: string): CxRates | null {
  const { exalted, divine, chaos } = CX_CURRENCY_IDS;
  const exPerDiv = pairRate(digest, league, "exalt_per_divine", exalted, divine);
  const chPerDiv = pairRate(digest, league, "chaos_per_divine", chaos, divine);
  if (exPerDiv == null || chPerDiv == null) return null;

  const exPerCh = pairRate(digest, league, "exalt_per_chaos", exalted, chaos);
  return {
    league,
    hour: digest.next_change_id,
    exaltPerDivine: exPerDiv.rate,
    chaosPerDivine: chPerDiv.rate,
    exaltPerChaos: exPerCh?.rate ?? exPerDiv.rate / chPerDiv.rate,
    volumeDivine: exPerDiv.sampleVolume,
    pairs: exPerCh != null ? [exPerDiv, chPerDiv, exPerCh] : [exPerDiv, chPerDiv],
  };
}
