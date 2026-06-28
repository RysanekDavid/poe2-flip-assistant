import WebSocket from "ws";
import { config } from "../config/env";
import { createSearch, fetchListings, type Listing } from "../api/tradeClient";
import { fetchScout, type ScoutRates } from "../api/scoutClient";
import { fireAlert } from "./alertEngine";
import { huntToQuery, toDivine } from "./huntEngine";
import { getHunts, recentHitByListing, insertHit, touchHuntScan, setRuntime, type Hunt } from "../db/queries";

/**
 * Live-search manager. For each active hunt it opens the official PoE2 trade
 * WebSocket (instant push of new listing ids), fetches details via the rate-limited
 * REST client, de-dupes by listing id, records hits, and desktop-alerts. Read-only:
 * we never buy or whisper — the human reviews the feed and acts.
 *
 * Runs in the poller process (long-lived). The UI reads hits + status from the DB.
 */
const WS_BASE = "wss://www.pathofexile.com/api/trade2/live/poe2";
const MAX_CONN = 20; // hard GGG cap on simultaneous live connections per account
const RECONCILE_MS = 30_000;
// The live socket uses the owner's .env POESESSID (wsHeaders), so it serves only the OWNER's
// hunts. Members get the per-user REST backstop (huntEngine.scanAll) instead — one shared
// account can't open live sockets on everyone's behalf without crossing accounts.
const OWNER_ID = 1;

interface Conn {
  huntId: number;
  ws: WebSocket;
  queryId: string;
  closing: boolean;
}

const conns = new Map<number, Conn>();
let rates: ScoutRates | null = null;
let running = false;
let reconcileTimer: NodeJS.Timeout | null = null;
let lastError: string | null = null;

function wsHeaders(): Record<string, string> {
  return {
    Cookie: `POESESSID=${config.poesessid}`,
    Origin: "https://www.pathofexile.com",
    "User-Agent": `poe2-flip-assistant/0.1 live-search${config.poeContact ? ` (${config.poeContact})` : ""}`,
  };
}

function publishStatus(bumpEvent = false): void {
  try {
    setRuntime(conns.size, lastError, bumpEvent);
  } catch {
    /* status is best-effort */
  }
}

function recordHit(h: Hunt, l: Listing): void {
  if (!l.price || !l.listingId || recentHitByListing(h.user_id, l.listingId)) return;
  const priceDiv = rates ? toDivine(l.price.amount, l.price.currency, rates) : NaN;
  const marginPct = h.target_div != null && priceDiv > 0 ? ((h.target_div - priceDiv) / priceDiv) * 100 : null;

  insertHit(h.user_id, {
    hunt_id: h.id,
    item_name: l.itemName,
    base_type: l.baseType || h.base_type,
    price_amount: l.price.amount,
    price_ccy: l.price.currency,
    price_div: Number.isFinite(priceDiv) ? priceDiv : 0,
    margin_pct: marginPct,
    account: l.account,
    whisper: l.whisper,
    listing_id: l.listingId,
    seller_online: l.online ? 1 : 0,
    listed_at: l.indexed,
    sig: `${h.id}|${l.account}|${l.price.amount}|${l.price.currency}`,
  });
  touchHuntScan(h.id, true);

  fireAlert(h.user_id, {
    type: h.mode,
    itemId: `hunt-${h.id}`,
    itemName: h.label,
    message: `${l.price.amount} ${l.price.currency} — ${l.itemName}${l.online ? " ●" : ""}`,
    value: l.price.amount,
    threshold: 0,
  });
}

async function handleMessage(h: Hunt, queryId: string, raw: string): Promise<void> {
  let msg: { new?: string[] };
  try {
    msg = JSON.parse(raw);
  } catch {
    return; // heartbeats / non-JSON frames
  }
  const ids = Array.isArray(msg.new) ? msg.new : [];
  if (ids.length === 0) return;

  for (let i = 0; i < ids.length; i += 10) {
    const listings = await fetchListings(ids.slice(i, i + 10), queryId);
    for (const l of listings) recordHit(h, l);
  }
  publishStatus(true);
}

async function openHunt(h: Hunt): Promise<void> {
  const search = await createSearch(huntToQuery(h)); // rate-limited POST → queryId
  const url = `${WS_BASE}/${encodeURIComponent(config.league)}/${search.id}`;
  const ws = new WebSocket(url, { headers: wsHeaders() });
  const conn: Conn = { huntId: h.id, ws, queryId: search.id, closing: false };
  conns.set(h.id, conn);

  ws.on("open", () => {
    lastError = null;
    publishStatus();
  });
  ws.on("message", (data) => {
    handleMessage(h, search.id, data.toString()).catch((e) => {
      lastError = e instanceof Error ? e.message : String(e);
      publishStatus();
    });
  });
  ws.on("error", (e) => {
    lastError = `ws ${h.label}: ${e instanceof Error ? e.message : String(e)}`;
  });
  ws.on("close", () => {
    conns.delete(h.id);
    publishStatus(); // reconcile loop will reopen if still active
  });
}

async function reconcile(): Promise<void> {
  if (!running) return;
  try {
    rates = (await fetchScout()).rates;
  } catch {
    /* keep stale rates */
  }

  const active = getHunts(true)
    .filter((h) => h.user_id === OWNER_ID)
    .slice(0, MAX_CONN);
  const activeIds = new Set(active.map((h) => h.id));

  // close sockets for hunts that were paused/removed
  for (const [id, c] of conns) {
    if (!activeIds.has(id)) {
      c.closing = true;
      c.ws.close();
      conns.delete(id);
    }
  }
  // open sockets for new/reconnecting hunts (sequential → throttled by the REST limiter)
  for (const h of active) {
    if (conns.has(h.id)) continue;
    try {
      await openHunt(h);
    } catch (e) {
      lastError = `open ${h.label}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  publishStatus();
}

export function startLiveHunts(): void {
  if (running) return;
  running = true;
  console.log(`live-hunt manager ON (max ${MAX_CONN} connections)`);
  void reconcile();
  reconcileTimer = setInterval(() => void reconcile(), RECONCILE_MS);
}

export function stopLiveHunts(): void {
  running = false;
  if (reconcileTimer) clearInterval(reconcileTimer);
  for (const c of conns.values()) {
    c.closing = true;
    c.ws.close();
  }
  conns.clear();
  publishStatus();
}
