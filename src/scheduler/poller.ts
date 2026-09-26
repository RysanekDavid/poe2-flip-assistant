import cron from "node-cron";
import { config } from "../config/env";
import { pruneStaleRecipeReports, consumeCraftRefresh } from "../db/craftQueries";
import { listUsers } from "../db/userQueries";
import { credForUser } from "../auth/credForUser";
import { runCycle } from "./marketCycle";
import { runHuntScan, runAutoSnipe, drainScanRequests } from "./tradeScans";
import { SNIPE_PROFILES } from "../core/snipeProfiles";
import { refreshStalestRecipe, refreshAllRecipes } from "../core/craftMargin";
import { RECIPES } from "../core/craftRecipes";
import { readCurrencyFromTrade } from "../api/accountScan";
import { refreshUniqueValues } from "../core/valuation";
import { fetchScout } from "../api/scoutClient";
import { insertBalance, insertTabs } from "../db/queries";
import { startPatchNotesWatcher } from "../sources/patchNotes/watcher";
import { startLeagueWatcher } from "./leagueWatcher";
import { getPolledLeagues } from "../core/leagueUsers";
import { getDefaultLeague } from "../core/leagueState";

const OWNER_ID = 1; // seeded owner; the live socket + autosnipe scan run under the owner's cred

function start(): void {
  const expr = `*/${config.pollIntervalMin} * * * *`;
  console.log(`poller starting — cron "${expr}", leagues "${getPolledLeagues().join(", ")}"`);
  startPatchNotesWatcher();
  startLeagueWatcher();

  // In-flight guard: a cold sweep of all ninja categories can exceed the 5-min cron interval
  // (13 categories × rate-limited fetch), so a new tick must not stack on an unfinished one.
  let cycleRunning = false;
  const safeRunCycle = (reason: string): void => {
    if (cycleRunning) {
      console.warn(`[poll] ${reason} skipped — previous cycle still running`);
      return;
    }
    cycleRunning = true;
    runCycle()
      .catch((e) => console.error(`[poll] ${reason} failed:`, e instanceof Error ? e.message : e))
      .finally(() => {
        cycleRunning = false;
      });
  };

  // Run once immediately so the dashboard has data without waiting a full interval.
  safeRunCycle("initial cycle");
  cron.schedule(expr, () => safeRunCycle("cycle"));

  // The owner's cred (stored or .env) backs the shared auto-snipe market scan.
  const ownerCred = credForUser({ id: OWNER_ID, role: "owner" });

  // Drop stored reports/history for recipes that no longer exist in code (removed/renamed keys).
  pruneStaleRecipeReports(RECIPES.map((r) => r.key));

  // Hunt = near-live per-user poll-diff scan (newest listings first, de-duped by listing id).
  // The trade WebSocket path is gone: trade2 live sockets require a saved on-account search AND
  // a browser TLS fingerprint — Cloudflare reaps plain Node clients seconds after connect. A
  // 30s poll is the honest server-side equivalent; the tick is skipped while a previous cycle
  // is still draining through the rate limiter, so many hunts degrade gracefully to slower laps.
  if (config.hunt.enabled) {
    console.log(`[hunt] per-user scan every ${config.hunt.scanSec}s`);
    // runHuntScan skips the tick while the previous cycle is still queued behind the limiter
    setInterval(() => runHuntScan("scan"), config.hunt.scanSec * 1000);
  }
  // Manual scans from the web are queued in the DB and run HERE, on this process's limiter.
  setInterval(() => drainScanRequests(() => credForUser({ id: OWNER_ID, role: "owner" })), 20_000);

  // Autonomous rare-snipe scanner — OFF unless AUTOSNIPE_ENABLED=true. Rotates the built-in
  // valuable archetypes, values each from its own search, alerts EVERY user on underpriced
  // listings. Shared market scan → runs once under the owner's cred (per-user would multiply
  // the per-IP rate budget by the user count for the same public listings).
  if (config.autoSnipe.enabled && ownerCred) {
    const asExpr = `*/${config.autoSnipe.intervalMin} * * * *`;
    console.log(`[autosnipe] ${config.autoSnipe.archetypesPerScan}/${SNIPE_PROFILES.length} archetypes per scan every ${config.autoSnipe.intervalMin}m`);
    cron.schedule(asExpr, () => runAutoSnipe("cron", ownerCred));
  } else if (config.autoSnipe.enabled) {
    console.warn("[autosnipe] AUTOSNIPE_ENABLED=true but owner POESESSID missing — scanner stays off");
  }

  // Craft-margin engine — ranks curated recipes by live EV/attempt. Shared market scan under the
  // owner's cred (like autosnipe); ONE recipe per tick (the stalest) so 2 searches + 2 fetches is
  // the whole per-tick cost through the shared trade2 limiter.
  if (config.craftMargin.enabled && ownerCred) {
    const cmExpr = `*/${config.craftMargin.intervalMin} * * * *`;
    console.log(`[craft-margin] refreshing 1/${RECIPES.length} recipes (stalest) every ${config.craftMargin.intervalMin}m`);
    cron.schedule(cmExpr, () => {
      refreshStalestRecipe(ownerCred)
        .then((r) => {
          if (r) console.log(`[craft-margin] ${r.key}: ${r.status} · EV ${r.evDiv.toFixed(1)} div · ${r.marginPct.toFixed(0)}%`);
        })
        .catch((e) => console.error("[craft-margin] refresh failed:", e instanceof Error ? e.message : e));
    });

    // Manual "refresh all" from the web POST is a flag, not an inline call — the web process shares
    // this account+IP's rate budget, so we consume the flag here and run the sweep on THIS limiter.
    let craftRefreshing = false;
    setInterval(() => {
      if (craftRefreshing || !consumeCraftRefresh()) return;
      craftRefreshing = true;
      console.log("[craft-margin] manual refresh dequeued — refreshing all recipes");
      refreshAllRecipes(ownerCred)
        .then((rs) => console.log(`[craft-margin] manual refresh done — ${rs.length} recipe(s)`))
        .catch((e) => console.error("[craft-margin] manual refresh failed:", e instanceof Error ? e.message : e))
        .finally(() => {
          craftRefreshing = false;
        });
    }, 20_000);
  } else if (config.craftMargin.enabled) {
    console.warn("[craft-margin] CRAFT_MARGIN_ENABLED=true but owner POESESSID missing — engine stays off");
  }

  // Auto net-worth snapshot per user from their own public tabs. Off unless BALANCE_INTERVAL_MIN
  // > 0; each user needs a stored POESESSID + account name (set in Settings) to be read.
  if (config.balanceIntervalMin > 0) {
    const balExpr = `*/${config.balanceIntervalMin} * * * *`;
    console.log(`[balance] auto-read every ${config.balanceIntervalMin}m (per-user public tabs via trade)`);
    cron.schedule(balExpr, () => {
      void snapshotBalancesAll();
    });
    void snapshotBalancesAll(); // one immediately so the curve starts without waiting
  }
}

/** Read every connected user's public-tab currency and store a net-worth snapshot each. */
async function snapshotBalancesAll(): Promise<void> {
  await refreshUniqueValues().catch(() => {}); // daily-guarded scout unique-price refresh for valuation
  let rates;
  try {
    rates = (await fetchScout()).rates;
  } catch (e) {
    console.error("[balance] scout rates failed:", e instanceof Error ? e.message : e);
    return;
  }

  for (const u of listUsers()) {
    const cred = credForUser(u);
    if (!cred || !cred.account) continue; // user hasn't connected POESESSID + account
    try {
      const c = await readCurrencyFromTrade(cred.account, rates, cred);
      const snap = insertBalance(u.id, getDefaultLeague(), {
        divine: c.divine,
        exalted: c.exalted,
        chaos: c.chaos,
        exaltPerDiv: rates.exaltPerDivine,
        chaosPerDiv: rates.chaosPerDivine,
        otherDiv: c.otherDiv,
        source: "trade",
        note: `${c.listingsSeen}/${c.total} listed · gear ~${c.otherDiv.toFixed(1)} Div · ${c.tabs.length} tabs${c.unpriced ? ` · ${c.unpriced} unpriced` : ""}`,
      });
      insertTabs(snap.id, c.tabs);
      console.log(`[balance] ${u.name}: ${c.divine}d ${c.exalted}ex ${c.chaos}c (${c.tabs.length} tabs, ${c.unpriced} unpriced)`);
    } catch (e) {
      console.error(`[balance] ${u.name} auto-read failed:`, e instanceof Error ? e.message : e);
    }
  }
}

// Only auto-start when run as the entrypoint (not when imported by an API route).
if (process.argv[1] && process.argv[1].includes("poller")) {
  start();
}
