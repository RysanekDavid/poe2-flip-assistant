/**
 * Loads .env.local for standalone tsx processes (probe, poller).
 * Next.js loads env on its own; this is a no-op duplicate there but harmless.
 * Import this FIRST in any standalone entrypoint.
 */
import dotenv from "dotenv";
import { retiredEnvWarnings } from "./retiredEnv";

if (process.env.APP_DISABLE_DOTENV !== "1") dotenv.config({ path: ".env.local" });

for (const warning of retiredEnvWarnings(process.env)) console.warn(warning);

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid configuration: ${key}="${v}" is not a number (default ${fallback}).`);
  return n;
}

/**
 * A number that must be > 0 (and ≤ `max` when given). Gate thresholds and budgets fail at BOOT
 * when misconfigured: a 0 ask floor or 0 sample minimum silently reopens the bait-alert hole.
 */
export function pos(key: string, fallback: number, max = Infinity): number {
  const n = num(key, fallback);
  if (!(n > 0) || n > max) {
    const range = Number.isFinite(max) ? `a number in (0, ${max}]` : "a number > 0";
    // one line that names the key, the bad value and the fix — it lands in journalctl at boot
    throw new Error(
      `Invalid configuration: ${key}=${process.env[key] ?? "(unset)"} — must be ${range} (default ${fallback}). ` +
        `Fix or remove ${key} in .env.local / the service environment and restart.`,
    );
  }
  return n;
}

/**
 * A boolean switch that accepts only "true" / "false" (any case). The older flags treat every
 * other value as false, so a typo like AUTOSNIPE_ENABLED=ture silently disables a subsystem;
 * new flags fail at boot instead.
 */
export function flag(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  const lower = v.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;
  throw new Error(`Invalid configuration: ${key}="${v}" — must be true or false (default ${fallback}).`);
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
    proxySecret: process.env.COACH_PROXY_SECRET ?? "",
  },
  // --- trade2 credentials (read-only price checks: autosnipe, craft margins, balance) ---
  poesessid: process.env.POESESSID ?? "", // session cookie for your own account; empty disables live search
  poeContact: process.env.POE_CONTACT ?? "", // your email — GGG asks third-party tools to identify themselves
  // `||` not `??`: an empty DATA_SOURCE_CONTACT= line copied from the example must not hide POE_CONTACT
  dataSourceContact: (process.env.DATA_SOURCE_CONTACT?.trim() || process.env.POE_CONTACT?.trim() || ""),
  poeAccount: process.env.POE_ACCOUNT ?? "", // your account name — needed to read your own stash (balance tracking)
  poeRealm: process.env.POE_REALM ?? "poe2", // realm for stash reads ('poe2' | 'pc')
  // optional explicit currency-tab indices "0,3"; empty = auto-find the currency-type tab
  stashTabs: (process.env.POE_STASH_TABS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(Number)
    .filter((n) => Number.isInteger(n)),
  trade: {
    // Per-process floor between trade2 requests. The account+IP budget itself (600 searches per
    // 6h) is enforced by the shared governor; this only keeps one process from bursting.
    minRequestMs: num("TRADE_MIN_REQUEST_MS", 6000),
  },
  // auto net-worth read from your public tabs via trade account search (0 = off, manual only)
  balanceIntervalMin: num("BALANCE_INTERVAL_MIN", 0),
  pollIntervalMin: num("POLL_INTERVAL_MIN", 5),
  patchNotes: {
    enabled: (process.env.PATCH_NOTES_ENABLED ?? "true").toLowerCase() === "true",
    intervalMin: num("PATCH_NOTES_INTERVAL_MIN", 30),
    maxReadyAgeMin: num("PATCH_NOTES_MAX_READY_AGE_MIN", 90),
    minIndexEntries: num("PATCH_NOTES_MIN_ENTRIES", 3),
    maxResponseBytes: num("PATCH_NOTES_MAX_BYTES", 2_000_000),
  },
  retentionDays: num("RETENTION_DAYS", 30), // price_snapshots older than this are pruned each poll
  // The ONE gate every SNIPE alert passes. Before it
  // existed, 84/109 production SNIPE alerts were "0 vs ~N Div" bait: 0/1-ex asks, zero-mod
  // signatures, week-old listings and tiny reference samples all fired.
  snipeGate: {
    minAskDiv: pos("SNIPE_MIN_ASK_DIV", 0.02), // absolute ask floor — below this is a price-fixer / fat-finger
    minAskFracOfValue: pos("SNIPE_MIN_ASK_FRAC", 0.05, 1), // ask < 5% of value is bait, not a 95%-off deal
    minResolvedMods: pos("SNIPE_MIN_RESOLVED_MODS", 2), // a signature needs ≥2 resolved mods to mean anything
    freshMinutes: pos("SNIPE_FRESH_MIN", 120), // older listings survived everyone else's snipe tools → stale bait
    minSamples: pos("SNIPE_MIN_SAMPLES", 5), // reference must stand on at least this many comparables
  },
  // snipe finder: a listing is a snipe if priced this far below the price-book reference.
  snipe: {
    discountPct: pos("SNIPE_DISCOUNT_PCT", 40, 100), // ask ≤ reference × (1 - 40%) → snipe
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
    topN: num("VAL_TOP_N", 10), // comparables fetched per valuation search (trimmed median of these)
    minComparables: num("VAL_MIN_COMPARABLES", 5), // below this the per-item search relaxes to pseudos-only
    discountPct: pos("VAL_DISCOUNT_PCT", 35, 100), // listing ≤ value × (1 - 35%) → snipe
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
    fetchPerArchetype: num("AUTOSNIPE_FETCH", 20), // newest listings pulled per archetype to record + screen
    candidatesPerArchetype: num("AUTOSNIPE_CANDIDATES", 3), // most desirable listings considered per archetype
    maxValuations: pos("AUTOSNIPE_MAX_VALUATIONS", 2), // per-item valuations per scan (≤2 searches each)
    // Price floor for candidates (the design note's 2 Div). The old 0 default let 1-ex bait win
    // the ranking and burn the whole valuation budget every scan.
    minCandidateDiv: num("AUTOSNIPE_MIN_CANDIDATE_DIV", 2),
    minCandidateScore: num("AUTOSNIPE_MIN_SCORE", 1), // skip listings whose mods don't resolve to anything valuable
    // Search-budget share. GGG allows 600 searches per 6h per IP (≈100/h) across EVERY consumer;
    // 6 searches per 10-min scan = 36/h for autosnipe, leaving the rest for craft margins + interactive lookups.
    archetypesPerScan: pos("AUTOSNIPE_ARCHETYPES_PER_SCAN", 2),
    maxSearchesPerScan: pos("AUTOSNIPE_MAX_SEARCHES", 6),
  },

  // craft-margin engine: rank curated craft recipes by live EV per attempt
  // (hitRate × result median − base cost − materials). Legs run under the owner's cred through
  // the shared trade2 limiter, one recipe per tick (the stalest), so the rate budget is safe.
  craftMargin: {
    enabled: (process.env.CRAFT_MARGIN_ENABLED ?? "true").toLowerCase() === "true",
    // 6 min: ≤3 searches + 8 fetches per tick ≈ 30 searches/h beside autosnipe's ~36, inside
    // trade2's 600 searches / 6 h; a full cycle over 16 recipes ≈ 96 min
    intervalMin: num("CRAFT_MARGIN_INTERVAL_MIN", 6), // cadence; paced further by the trade2 limiter
    alertMarginPct: num("CRAFT_MARGIN_ALERT_PCT", 40), // fire when EV margin ≥ this %
    alertMinEvDiv: num("CRAFT_MARGIN_ALERT_MIN_EV_DIV", 1), // …and EV ≥ this many Divine (skip trivial edges)
  },

  // Top Flips on GGG's own currency-exchange history (core/cx). Tunables, not facts: each one
  // is an assumption the owner can move without a deploy.
  cx: {
    historyDays: num("CX_HISTORY_DAYS", 14), // stored market-hours older than this are pruned
    backfillHours: num("CX_BACKFILL_HOURS", 24), // hours walked back to fill gaps (persistence needs 24)
    // Gold is not tradable, so its Div value cannot be observed — this is the owner's valuation
    // (same approach as poe2-arb's POE2ARB_GOLD_PER_EX). Lower = gold dearer = fees bite harder.
    goldPerExalt: num("CX_GOLD_PER_EXALT", 5000),
    edgeThresholdPct: num("CX_EDGE_THRESHOLD_PCT", 5), // an hour "held" the edge at ≥ this net %
    flowSharePct: num("CX_FLOW_SHARE_PCT", 10), // share of the slower leg's flow you can expect to fill
    hintPositionDiv: num("CX_HINT_POSITION_DIV", 10), // position size the time-to-sell hint is quoted for
    liquiditySafeDivH: num("CX_LIQ_SAFE_DIV_H", 1000), // slower-leg turnover (Div/h) for a "safe" tier
    liquidityRiskyDivH: num("CX_LIQ_RISKY_DIV_H", 100), // …and for "risky"; below it is "thin"
    // Leg guards: a quote below either floor, or on a ratio grid coarser than maxGridStepPct
    // (each leg ≥ 10 quote units per item or ≥ 10 items per quote unit), cannot carry an edge —
    // see core/cx/cxMarketModel. Live data put every computable edge at 43–48% under looser
    // values (25% grid / 50% cap): those were quantisation and dumps, not flips.
    minLegUnits: num("CX_MIN_LEG_UNITS", 20), // item units/h per leg
    minLegDivPerHour: num("CX_MIN_LEG_DIV_H", 20), // Div/h per leg-hour (also a route hour's floor)
    maxGridStepPct: num("CX_MAX_GRID_STEP_PCT", 10),
    maxPlausibleEdgePct: num("CX_MAX_PLAUSIBLE_EDGE_PCT", 30), // above = artefact, never ranked
    // lowest/highest_ratio look like resting-order extremes, not fills, in real digests —
    // band (market-making) edges stay off until that is verified.
    bandEdges: (process.env.CX_BAND_EDGES ?? "false").toLowerCase() === "true",
  },

  // Snipe outcome tracker: re-fetches each alerted listing ~2 h and ~24 h later to learn whether
  // it vanished or is still listed. Runs only when autoSnipe is on too (owner cred, same budget).
  snipeOutcomes: {
    enabled: flag("SNIPE_OUTCOMES_ENABLED", true),
    // trade2 /fetch calls per 30-min run (≤10 ids each) — ≤10 fetches/h beside the scanners' budget
    maxFetchesPerRun: pos("SNIPE_OUTCOMES_MAX_FETCHES", 5, 20),
    // re-searches per run (expired search ids + cross-checks of the fetch method) — searches are
    // the scarce trade2 resource (600 per 6 h per IP), so this stays small
    maxSearchesPerRun: pos("SNIPE_OUTCOMES_MAX_SEARCHES", 3, 10),
  },

  // trade2 fallback prices for the curated boss uniques poe2scout has no price for (Farm boss EV).
  // Shared market scan under the owner's cookie, default league only (trade2 searches search it).
  uniqueTradeValues: {
    enabled: flag("UNIQUE_TRADE_VALUES_ENABLED", true),
    // Search-budget share of trade2's ~100/h (600 per 6 h per IP): autosnipe ~36 + craft ~30 +
    // snipe outcomes ≤6 + reprice ≤4 + this 6 ≈ 82/h, leaving room for interactive lookups.
    maxSearchesPerHour: pos("UNIQUE_TRADE_MAX_SEARCHES_PER_HOUR", 6, 12),
    // each unique is re-searched at most this often; ~50 candidates at 6/h are covered in ~8-9 h
    refreshHours: pos("UNIQUE_TRADE_REFRESH_HOURS", 24, 24 * 7),
  },

  // League-start price curves from GGG's public exchange digests of past leagues.
  leagueStart: {
    days: pos("LEAGUE_START_DAYS", 14, 60), // curve length; the panel shows while a league is younger than this
    backfillEnabled: flag("LEAGUE_START_BACKFILL_ENABLED", true), // public CDN, ≤12 digests per poll cycle
  },

  // Discord live board: one per-user message edited in place (users opt in under Settings).
  discordBoard: { intervalMin: pos("DISCORD_BOARD_INTERVAL_MIN", 60, 1440) },

  // Mod pool live values ("items carrying this mod"), shared across users per league/base/stat/roll.
  modPool: { cacheHours: pos("MOD_POOL_CACHE_HOURS", 24, 168) },

  buyExaltDiscount: num("BUY_EXALT_DISCOUNT", 0.92),
  sellChaosBonus: num("SELL_CHAOS_BONUS", 1.08),
  minVolume: num("MIN_VOLUME", 50), // below this = illiquid (orders won't fill fast)
  flips: { maxMidDiv: pos("FLIP_MAX_MID_DIV", 500) }, // above = whale tier (Mirror): nobody flips it, so it never ranks
  alertCooldownMin: num("ALERT_COOLDOWN_MIN", 60), // same item+type alerts at most once per this window
  // A condition that keeps holding (spread still open, craft still profitable) used to re-alert
  // every cooldown — ~24/day per item. Past the cooldown it now re-alerts only when the value rose
  // by risePct over the last alerted value, or once quietHours have passed since that alert.
  alertRefire: {
    risePct: pos("ALERT_REFIRE_RISE_PCT", 50, 1000),
    quietHours: pos("ALERT_REFIRE_QUIET_HOURS", 24, 24 * 14),
  },
  // Alert feed retention, pruned each poll per user; unseen alerts younger than unseenKeepDays
  // survive even a shorter retention so nothing unread vanishes the week it arrived.
  alertRetention: {
    days: pos("ALERT_RETENTION_DAYS", 30, 365),
    unseenKeepDays: pos("ALERT_UNSEEN_KEEP_DAYS", 7, 365),
  },
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
