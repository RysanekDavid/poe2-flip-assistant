import cron from "node-cron";
import { config } from "../config/env";
import { fetchAll } from "../api/ninjaClient";
import {
  insertSnapshots,
  pruneSnapshots,
  pruneObservations,
  getWatchlist,
  latestSnapshots,
  priceHistory,
  manualAgeMs,
} from "../db/queries";
import { listUsers } from "../db/userQueries";
import { credForUser } from "../auth/credForUser";
import { scoreItem } from "../core/flipModel";
import { deriveRates, type Currency } from "../core/priceEngine";
import { roundPrice } from "../lib/format";
import { analyzeTrend } from "../core/trendDetector";
import { fireAlert } from "../core/alertEngine";
import { scanAll } from "../core/huntEngine";
import { scanAutoSnipes } from "../core/autoSnipe";
import { SNIPE_PROFILES } from "../core/snipeProfiles";
import { readCurrencyFromTrade } from "../api/accountScan";
import { refreshUniqueValues } from "../core/valuation";
import { fetchScout } from "../api/scoutClient";
import { insertBalance, insertTabs } from "../db/queries";
import type { PricedItem } from "../api/types";

const OWNER_ID = 1; // seeded owner; the live socket + autosnipe scan run under the owner's cred

/** One poll cycle: fetch → store → evaluate watchlist → alert. */
export async function runCycle(): Promise<void> {
  const started = new Date().toISOString();
  console.log(`[poll ${started}] fetching...`);

  const items = await fetchAll();
  const stored = insertSnapshots(items);
  const pruned = pruneSnapshots(config.retentionDays);
  pruneObservations(); // age out stale price-book observations
  console.log(`[poll] stored ${stored}/${items.length} new snapshots, pruned ${pruned} > ${config.retentionDays}d`);

  const rates = deriveRates(items);
  if (rates == null) {
    console.warn("[poll] no exalted/chaos line found — skipping spread eval this cycle");
  }

  const byId = new Map<string, PricedItem>(items.map((i) => [i.itemId, i]));

  // Watchlists are per-user, so evaluate alerts for every account separately. Market data
  // (byId / rates) is shared; only the watched set and the resulting alert rows are per-user.
  const users = listUsers();
  console.log(`[poll] evaluating watchlists for ${users.length} user(s)`);

  for (const u of users) {
    const watch = getWatchlist(u.id);
    for (const w of watch) {
      const current = byId.get(w.item_id);
      if (!current) continue;

      // --- spread alert (REAL mode only; RECO margin is a heuristic, not a signal) ---
      if (rates != null) {
        const ageMs = manualAgeMs(w.manual_set_at);
        const fresh = ageMs != null && ageMs <= config.manualStaleHours * 3600_000;
        const mBuy = fresh && w.manual_buy_exalt != null ? { amount: w.manual_buy_exalt, ccy: (w.manual_buy_ccy ?? "EXALT") as Currency } : null;
        const mSell = fresh && w.manual_sell_chaos != null ? { amount: w.manual_sell_chaos, ccy: (w.manual_sell_ccy ?? "CHAOS") as Currency } : null;
        const flip = scoreItem(current, rates, mBuy, mSell);
        // > ~200% "spread" is never a real flip — it's a bad manual price (wrong currency/typo). Skip, don't alert garbage.
        const SANE_MAX_MARGIN = 200;
        if (flip.mode === "REAL" && flip.marginPct >= w.buy_threshold_pct && flip.marginPct <= SANE_MAX_MARGIN) {
          fireAlert(u.id, {
            type: "SPREAD",
            itemId: w.item_id,
            itemName: w.item_name,
            message: `${flip.marginPct.toFixed(1)}% — buy ${roundPrice(flip.buyExalt)}ex → sell ${roundPrice(flip.sellChaos)}c · market ~${flip.marketMarginPct.toFixed(0)}%`,
            value: flip.marginPct,
            threshold: w.buy_threshold_pct,
          });
        }
      }

      // --- trend alert ---
      const history = priceHistory(w.item_id, 168);
      const trend = analyzeTrend(w.item_name, current.change7d, history, current.volume);
      if (trend.signal === "BUY" || trend.signal === "SELL") {
        fireAlert(u.id, {
          type: "TREND",
          itemId: w.item_id,
          itemName: w.item_name,
          message: `${trend.signal}: ${trend.reason}`,
          value: trend.change7d,
          threshold: config.thresholds.change7dPct,
        });
      } else if (current.change7d != null && current.change7d >= config.thresholds.change7dPct) {
        // price spike without a clear trend signal — still worth surfacing on a watched item
        fireAlert(u.id, {
          type: "SPIKE",
          itemId: w.item_id,
          itemName: w.item_name,
          message: `+${current.change7d.toFixed(0)}% 7d — spiking, watch for a flip window`,
          value: current.change7d,
          threshold: config.thresholds.change7dPct,
        });
      }
    }
  }
  console.log(`[poll] cycle done`);
}

function start(): void {
  const expr = `*/${config.pollIntervalMin} * * * *`;
  console.log(`poller starting — cron "${expr}", league "${config.league}"`);

  // Run once immediately so the dashboard has data without waiting a full interval.
  runCycle().catch((e) => console.error("[poll] initial cycle failed:", e instanceof Error ? e.message : e));

  cron.schedule(expr, () => {
    runCycle().catch((e) => console.error("[poll] cycle failed:", e instanceof Error ? e.message : e));
  });

  // The owner's cred (stored or .env) backs the shared auto-snipe market scan.
  const ownerCred = credForUser({ id: OWNER_ID, role: "owner" });

  // Hunt = periodic per-user poll-diff scan (newest listings first, de-duped by listing id).
  // The old trade WebSocket path is gone: trade2 live sockets require a saved on-account search
  // AND a browser TLS fingerprint — Cloudflare reaps plain Node clients seconds after connect.
  // Polling every couple of minutes sits comfortably inside the 30-per-300s search budget.
  if (config.hunt.enabled) {
    const huntExpr = `*/${config.hunt.intervalMin} * * * *`;
    console.log(`[hunt] periodic per-user scan every ${config.hunt.intervalMin}m`);
    cron.schedule(huntExpr, () => {
      scanAll()
        .then((s) => { if (s.hits > 0) console.log(`[hunt] periodic scan: ${s.hits} new across ${s.scanned} hunt(s)`); })
        .catch((e) => console.error("[hunt] periodic scan failed:", e instanceof Error ? e.message : e));
    });
  }

  // Autonomous rare-snipe scanner — OFF unless AUTOSNIPE_ENABLED=true. Rotates the built-in
  // valuable archetypes, values each from its own search, alerts EVERY user on underpriced
  // listings. Shared market scan → runs once under the owner's cred (per-user would multiply
  // the per-IP rate budget by the user count for the same public listings).
  if (config.autoSnipe.enabled && ownerCred) {
    const asExpr = `*/${config.autoSnipe.intervalMin} * * * *`;
    console.log(`[autosnipe] scanning ${SNIPE_PROFILES.length} archetypes every ${config.autoSnipe.intervalMin}m`);
    cron.schedule(asExpr, () => {
      scanAutoSnipes(ownerCred)
        .then((r) => {
          if (r.findings.length > 0) console.log(`[autosnipe] ${r.findings.length} snipe(s) across ${r.searched} archetypes`);
          if (r.errors.length > 0) console.warn(`[autosnipe] ${r.errors.length} archetype error(s):`, r.errors.map((e) => `${e.profile}: ${e.error}`).join("; "));
        })
        .catch((e) => console.error("[autosnipe] scan failed:", e instanceof Error ? e.message : e));
    });
  } else if (config.autoSnipe.enabled) {
    console.warn("[autosnipe] AUTOSNIPE_ENABLED=true but owner POESESSID missing — scanner stays off");
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
      const snap = insertBalance(u.id, {
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
