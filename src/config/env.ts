/**
 * Loads .env.local for standalone tsx processes (probe, poller).
 * Next.js loads env on its own; this is a no-op duplicate there but harmless.
 * Import this FIRST in any standalone entrypoint.
 */
import dotenv from "dotenv";

if (process.env.APP_DISABLE_DOTENV !== "1") dotenv.config({ path: ".env.local" });

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`env ${key} not a number: "${v}"`);
  return n;
}

export const config = {
  league: process.env.LEAGUE_NAME ?? "Runes of Aldur",
  dbPath: process.env.DB_PATH ?? "./data/poe2flip.db",
  authSecret: process.env.AUTH_SECRET ?? "", // HMAC key for session cookies; REQUIRED in production
  secretKey: process.env.SECRET_KEY ?? "", // AES key material for encrypting stored secrets (per-user POESESSID); falls back to AUTH_SECRET
  ownerName: process.env.OWNER_NAME ?? "Davosso", // seeded owner (id=1) that existing data backfills onto
  coach: {
    apiUrl: process.env.COACH_API_URL ?? "http://127.0.0.1:8000",
    timeoutMs: num("COACH_TIMEOUT_MS", 160_000),
    threadSecret: process.env.COACH_THREAD_SECRET ?? process.env.AUTH_SECRET ?? "",
  },
  // --- live trade2 hunt (read-only price-check / snipe finder) ---
  poesessid: process.env.POESESSID ?? "", // session cookie for your own account; empty disables live search
  poeContact: process.env.POE_CONTACT ?? "", // your email — GGG asks third-party tools to identify themselves
  poeAccount: process.env.POE_ACCOUNT ?? "", // your account name — needed to read your own stash (balance tracking)
  poeRealm: process.env.POE_REALM ?? "poe2", // realm for stash reads ('poe2' | 'pc')
  // optional explicit currency-tab indices "0,3"; empty = auto-find the currency-type tab
  stashTabs: (process.env.POE_STASH_TABS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(Number)
    .filter((n) => Number.isInteger(n)),
  hunt: {
    // Background poll-diff scan: ON by default — a hunt that only fires when you press a button
    // isn't a hunt. Per-user creds; users without a stored POESESSID are simply skipped.
    enabled: (process.env.HUNT_ENABLED ?? "true").toLowerCase() === "true",
    // Near-live cadence. trade2 sustained search budget = 1/10s (30 per 300s) per account+IP;
    // the limiter's request floor spaces a big hunt list out naturally, and the poller skips a
    // tick while the previous cycle is still draining, so we can't blow the budget.
    scanSec: num("HUNT_SCAN_SEC", 30),
    perScan: num("HUNT_PER_SCAN", 10), // listings fetched per hunt per scan (≤10 = one fetch call)
    minRequestMs: num("HUNT_MIN_REQUEST_MS", 6000), // floor between trade2 requests (rate-limit guard)
    freshMinutes: num("HUNT_FRESH_MIN", 120), // a listing older than this is stale bait, not a hit
  },
  // auto net-worth read from your public tabs via trade account search (0 = off, manual only)
  balanceIntervalMin: num("BALANCE_INTERVAL_MIN", 0),
  pollIntervalMin: num("POLL_INTERVAL_MIN", 5),
  retentionDays: num("RETENTION_DAYS", 30), // price_snapshots older than this are pruned each poll
  // snipe finder: a listing is a snipe if priced this far below the price-book median, with
  // at least this many observed samples (volume confidence). Tune with real data.
  snipe: {
    minSamples: num("SNIPE_MIN_SAMPLES", 5),
    discountPct: num("SNIPE_DISCOUNT_PCT", 40), // ask ≤ median × (1 - 40%) → snipe
    obsRetentionDays: num("SNIPE_OBS_RETENTION_DAYS", 21), // price-book observations older than this are pruned
    // medium-volume sweet spot for auto-picked snipe targets (high vol = bots, low vol = can't resell)
    minListings: num("SNIPE_MIN_LISTINGS", 8),
    maxListings: num("SNIPE_MAX_LISTINGS", 150),
    minTargetDiv: num("SNIPE_MIN_TARGET_DIV", 10), // ignore cheap items — only worth sniping valuable ones
    maxTargetDiv: num("SNIPE_MAX_TARGET_DIV", 200), // ignore whale/mirror tier — can't afford to buy or resell fast
    minSampleLogs: num("SNIPE_MIN_SAMPLE_LOGS", 4), // need this many price-log points to trust the value
  },

  // rare-item comparable valuation (paste an item → relaxed search → median of comparables)
  valuation: {
    relaxPct: num("VAL_RELAX_PCT", 12), // widen each stat's min down this % so near rolls still match
    ilvlSlack: num("VAL_ILVL_SLACK", 4), // comparables within this many ilvl below the item
    topN: num("VAL_TOP_N", 10), // value = median of the cheapest N online comparables
    minSamples: num("VAL_MIN_SAMPLES", 4), // fewer comparables than this → don't trust / don't fire snipe
    minComparables: num("VAL_MIN_COMPARABLES", 5), // below this the per-item search relaxes to pseudos-only
    discountPct: num("VAL_DISCOUNT_PCT", 35), // listing ≤ value × (1 - 35%) → snipe
    minValueDiv: num("VAL_MIN_VALUE_DIV", 1), // don't alert snipes on items worth less than this (junk)
  },

  // autonomous snipe scanner: scan valuable archetypes, take the cheapest REAL listings, and
  // value each ITEM individually (relaxed comparable search on its own rolls) — not a category
  // median. A listing far under its own per-item value = snipe. Off unless enabled.
  autoSnipe: {
    // ON by default — the scanner is worthless as a button; it exists to watch the market
    // continuously. Runs under the owner's cred; stays off if none is stored.
    enabled: (process.env.AUTOSNIPE_ENABLED ?? "true").toLowerCase() === "true",
    intervalMin: num("AUTOSNIPE_INTERVAL_MIN", 10), // cadence; paced further by the trade2 limiter
    fetchPerArchetype: num("AUTOSNIPE_FETCH", 20), // listings pulled per archetype to record + screen
    candidatesPerArchetype: num("AUTOSNIPE_CANDIDATES", 3), // cheapest real listings considered per archetype
    maxValuations: num("AUTOSNIPE_MAX_VALUATIONS", 6), // per-item comparable searches spent per scan (rate guard)
    minCandidateDiv: num("AUTOSNIPE_MIN_CANDIDATE_DIV", 0), // NO price floor — a god-roll dumped at 1ex must qualify
    minCandidateScore: num("AUTOSNIPE_MIN_SCORE", 1), // skip listings whose mods don't resolve to anything valuable
  },

  // craft-margin engine: rank curated craft recipes by live EV per attempt
  // (hitRate × result median − base cost − materials). Legs run under the owner's cred through
  // the shared trade2 limiter, one recipe per tick (the stalest), so the rate budget is safe.
  craftMargin: {
    enabled: (process.env.CRAFT_MARGIN_ENABLED ?? "true").toLowerCase() === "true",
    intervalMin: num("CRAFT_MARGIN_INTERVAL_MIN", 10), // cadence; paced further by the trade2 limiter
    alertMarginPct: num("CRAFT_MARGIN_ALERT_PCT", 40), // fire when EV margin ≥ this %
    alertMinEvDiv: num("CRAFT_MARGIN_ALERT_MIN_EV_DIV", 1), // …and EV ≥ this many Divine (skip trivial edges)
  },

  buyExaltDiscount: num("BUY_EXALT_DISCOUNT", 0.92),
  sellChaosBonus: num("SELL_CHAOS_BONUS", 1.08),
  minVolume: num("MIN_VOLUME", 50), // below this = illiquid (orders won't fill fast)
  alertCooldownMin: num("ALERT_COOLDOWN_MIN", 60), // same item+type alerts at most once per this window
  manualStaleHours: num("MANUAL_STALE_HOURS", 6), // real Ange prices expire (→ estimate) after this many hours
  thresholds: {
    spreadPct: num("ALERT_SPREAD_PCT", 15),
    change7dPct: num("ALERT_CHANGE_7D_PCT", 50),
    change24hPct: num("ALERT_CHANGE_24H_PCT", 20),
    volumeSpike: num("ALERT_VOLUME_SPIKE", 3.0),
    trendReversal: -10,
  },
} as const;

export type AppConfig = typeof config;
