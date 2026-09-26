import cron from "node-cron";
import { config } from "../config/env";
import { pruneStaleRecipeReports, consumeCraftRefresh } from "../db/craftQueries";
import { credForUser } from "../auth/credForUser";
import { POLLER_MAX_INLINE_WAIT_MS, setMaxInlineWaitMs, type TradeCred } from "../api/tradeClient";
import { runCycle } from "./marketCycle";
import { runHuntScan, runAutoSnipe, drainScanRequests } from "./tradeScans";
import { SNIPE_PROFILES } from "../core/snipeProfiles";
import { refreshStalestRecipe, refreshAllRecipes } from "../core/craftMargin";
import { RECIPES } from "../core/craftRecipes";
import { withHeartbeat } from "../core/heartbeat";
import { startPatchNotesWatcher } from "../sources/patchNotes/watcher";
import { startLeagueWatcher } from "./leagueWatcher";
import { getPolledLeagues } from "../core/leagueUsers";
import { balanceProblem, snapshotBalancesAll } from "./balanceLoop";
import { startNotifyDrainer } from "../core/notify/drainer";

const OWNER_ID = 1; // seeded owner; the live socket + autosnipe scan run under the owner's cred

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function start(): void {
  console.log(`poller starting — cron "*/${config.pollIntervalMin} * * * *", leagues "${getPolledLeagues().join(", ")}"`);
  // background scans may sit out the shared trade2 pace inline; web requests fail fast instead
  setMaxInlineWaitMs(POLLER_MAX_INLINE_WAIT_MS);
  startPatchNotesWatcher();
  startLeagueWatcher();
  startMarketCycle();

  // The owner's cred (stored or .env) backs the shared auto-snipe market scan.
  const ownerCred = credForUser({ id: OWNER_ID, role: "owner" });

  // Drop stored reports/history for recipes that no longer exist in code (removed/renamed keys).
  pruneStaleRecipeReports(RECIPES.map((r) => r.key));

  startTradeScans();
  startAutoSnipe(ownerCred);
  startCraftMargin(ownerCred);
  startBalanceLoop();
  startNotifyDrainer(); // Discord deliveries queued by the alerts trigger (core/notify)
}

function startMarketCycle(): void {
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
      .catch((e) => console.error(`[poll] ${reason} failed:`, errText(e)))
      .finally(() => {
        cycleRunning = false;
      });
  };

  // Run once immediately so the dashboard has data without waiting a full interval.
  safeRunCycle("initial cycle");
  cron.schedule(`*/${config.pollIntervalMin} * * * *`, () => safeRunCycle("cycle"));
}

function startTradeScans(): void {
  // Hunt = near-live per-user poll-diff scan (newest listings first, de-duped by listing id).
  // The trade WebSocket path is gone: trade2 live sockets require a saved on-account search AND
  // a browser TLS fingerprint — Cloudflare reaps plain Node clients seconds after connect. A
  // 30s poll is the honest server-side equivalent; the tick is skipped while a previous cycle
  // is still draining through the rate limiter, so many hunts degrade gracefully to slower laps.
  if (config.hunt.enabled) {
    console.log(`[hunt] per-user scan every ${config.hunt.scanSec}s`);
    setInterval(() => runHuntScan("scan"), config.hunt.scanSec * 1000);
  }
  // Manual scans from the web are queued in the DB and run HERE, on this process's limiter.
  setInterval(() => {
    const ownerCredNow = (): TradeCred | null => credForUser({ id: OWNER_ID, role: "owner" });
    withHeartbeat("scan-drain", "", () => drainScanRequests(ownerCredNow), {
      problem: (errors) => (errors.length > 0 ? errors.join("; ") : null),
    }).catch((e) => console.error("[scan-drain] failed:", errText(e)));
  }, 20_000);
}

function startAutoSnipe(ownerCred: TradeCred | null): void {
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
}

function startCraftMargin(ownerCred: TradeCred | null): void {
  if (!config.craftMargin.enabled) return;
  if (!ownerCred) {
    console.warn("[craft-margin] CRAFT_MARGIN_ENABLED=true but owner POESESSID missing — engine stays off");
    return;
  }
  // Craft-margin engine — ranks curated recipes by live EV/attempt. Shared market scan under the
  // owner's cred (like autosnipe); ONE recipe per tick (the stalest) so ≤2 searches + 8 fetches is
  // the whole per-tick cost through the shared trade2 limiter.
  console.log(`[craft-margin] refreshing 1/${RECIPES.length} recipes (stalest) every ${config.craftMargin.intervalMin}m`);
  // One craft scan at a time: the tick skips while a manual sweep runs, and a queued manual
  // sweep waits for the tick (its flag stays set until consumed), so no recipe is scanned twice.
  let craftRefreshing = false;
  const exclusive = (run: () => Promise<void>): void => {
    craftRefreshing = true;
    // craftTick/craftSweep catch their own errors today; this catch keeps a future throw from
    // becoming an unhandled rejection that takes the whole poller down.
    run()
      .catch((e) => console.error("[craft-margin] run failed:", errText(e)))
      .finally(() => {
        craftRefreshing = false;
      });
  };
  cron.schedule(`*/${config.craftMargin.intervalMin} * * * *`, () => {
    if (craftRefreshing) return;
    exclusive(() => craftTick(ownerCred));
  });

  // Manual "refresh all" from the web POST is a flag, not an inline call — the web process shares
  // this account+IP's rate budget, so we consume the flag here and run the sweep on THIS limiter.
  setInterval(() => {
    if (craftRefreshing || !consumeCraftRefresh()) return;
    exclusive(() => craftSweep(ownerCred));
  }, 20_000);
}

async function craftTick(ownerCred: TradeCred): Promise<void> {
  try {
    const r = await withHeartbeat("craft-margin", "", () => refreshStalestRecipe(ownerCred), {
      problem: (res) => (res?.kept ? `${res.key}: kept previous report — ${res.error}` : null),
    });
    if (!r) return;
    if (r.kept) console.warn(`[craft-margin] ${r.key}: transient failure, kept previous report — ${r.error}`);
    else console.log(`[craft-margin] ${r.key}: ${r.report.status} · EV ${r.report.evDiv.toFixed(1)} div · ${r.report.marginPct.toFixed(0)}%`);
  } catch (e: unknown) {
    console.error("[craft-margin] refresh failed:", errText(e));
  }
}

async function craftSweep(ownerCred: TradeCred): Promise<void> {
  console.log("[craft-margin] manual refresh dequeued — refreshing all recipes");
  try {
    const rs = await withHeartbeat("craft-sweep", "", () => refreshAllRecipes(ownerCred), {
      problem: (all) => (all.length > 0 && all.every((r) => r.kept) ? `every recipe kept its previous report` : null),
    });
    console.log(`[craft-margin] manual refresh done — ${rs.length} recipe(s), ${rs.filter((r) => r.kept).length} kept previous after a transient failure`);
  } catch (e: unknown) {
    console.error("[craft-margin] manual refresh failed:", errText(e));
  }
}

function startBalanceLoop(): void {
  // Auto net-worth snapshot per user from their own public tabs. Off unless BALANCE_INTERVAL_MIN
  // > 0; each user needs a stored POESESSID + account name (set in Settings) to be read.
  if (config.balanceIntervalMin <= 0) return;
  console.log(`[balance] auto-read every ${config.balanceIntervalMin}m (per-user public tabs via trade)`);
  let reading = false;
  const run = (): void => {
    if (reading) {
      console.warn("[balance] auto-read skipped — previous read still running");
      return;
    }
    reading = true;
    withHeartbeat("balance", "", () => snapshotBalancesAll(), { problem: balanceProblem })
      .then((r) => console.log(`[balance] ${r.league}: ${r.read} read, ${r.skipped} not connected, ${r.failed.length} failed`))
      .catch((e) => console.error("[balance] auto-read failed:", errText(e)))
      .finally(() => {
        reading = false;
      });
  };
  cron.schedule(`*/${config.balanceIntervalMin} * * * *`, run);
  run(); // one immediately so the curve starts without waiting
}

// Only auto-start when run as the entrypoint (not when imported by an API route).
if (process.argv[1] && process.argv[1].includes("poller")) {
  start();
}
