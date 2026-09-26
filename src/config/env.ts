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
  // --- live trade2 hunt (read-only price-check / snipe finder) ---
  poesessid: process.env.POESESSID ?? "", // session cookie for your own account; empty disables live search
  poeContact: process.env.POE_CONTACT ?? "", // your email — GGG asks third-party tools to identify themselves
  dataSourceContact: process.env.DATA_SOURCE_CONTACT ?? process.env.POE_CONTACT ?? "",
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
    // Lap cadence. The binding limit is GGG's 600 searches per 6h per IP (≈1 per 36s), shared by
    // hunts, autosnipe and craft margins; the trade2 governor paces every search to it and the
    // poller skips a tick while the previous lap is still draining. Budget reality: ONE hunt at a
    // 60s cadence plus autosnipe already saturates it, and each extra active hunt adds ~40s per
    // lap — so N hunts means each is re-checked roughly every N×40s, not every scanSec.
    scanSec: pos("HUNT_SCAN_SEC", 60),
    perScan: num("HUNT_PER_SCAN", 10), // listings fetched per hunt per scan (≤10 = one fetch call)
    minRequestMs: num("HUNT_MIN_REQUEST_MS", 6000), // floor between trade2 requests (rate-limit guard)
    freshMinutes: num("HUNT_FRESH_MIN", 120), // a listing older than this is stale bait, not a hit
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
  // The ONE gate every SNIPE alert passes (hunt price-book verdict AND autosnipe). Before it
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
    // 6 searches per 10-min scan = 36/h for autosnipe, leaving ~60/h for hunts + craft margins.
    archetypesPerScan: pos("AUTOSNIPE_ARCHETYPES_PER_SCAN", 2),
    maxSearchesPerScan: pos("AUTOSNIPE_MAX_SEARCHES", 6),
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

  buyExaltDiscount: num("BUY_EXALT_DISCOUNT", 0.92),
  sellChaosBonus: num("SELL_CHAOS_BONUS", 1.08),
  minVolume: num("MIN_VOLUME", 50), // below this = illiquid (orders won't fill fast)
  alertCooldownMin: num("ALERT_COOLDOWN_MIN", 60), // same item+type alerts at most once per this window
  desktopNotify: (process.env.DESKTOP_NOTIFY ?? "true").toLowerCase() !== "false", // OS toast per alert (tests turn it off)
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
