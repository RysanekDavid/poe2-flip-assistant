import { z } from "zod";
import { searchListings, type TradeCred } from "../api/tradeClient";
import { isZeroModRare, type Listing } from "../api/tradeListing";
import { fetchTradeMeta } from "../api/tradeMeta";
import { config } from "../config/env";
import { fireAlert } from "./alertEngine";
import { credForUser } from "../auth/credForUser";
import { listUsers } from "../db/userQueries";
import { getHunts, touchHuntScan, recentHitSig, recentHitByListing, insertHit, setRuntime, type Hunt } from "../db/huntQueries";
import { getDefaultLeague } from "./leagueState";
import { buildStatIndex, type StatIndex } from "./statResolver";
import { buildPlan, listingToItem } from "./comparableValuation";
import { listingDiv, type DivRates } from "./listingPrice";
import { bookReference, describeRefusals, feedPriceBook, newBookCounters, type BookCounters } from "./priceBookFeed";
import { evaluateSnipe, listingAgeMin } from "./snipeGate";
import { scanRates } from "./scanRates";
import { snipeAlertMessage } from "./snipeAlert";
import { StatFilterSchema } from "../lib/huntSchema";
import type { TradeQuery, Rarity } from "../lib/tradeLink";

const StoredStats = z.array(StatFilterSchema);

export function huntToQuery(h: Hunt): TradeQuery {
  // stats_json is validated on write now; an old malformed row fails HERE with a clear message
  // (recorded on the hunt) instead of producing a silently wrong search
  const stats = h.stats_json ? StoredStats.parse(JSON.parse(h.stats_json)) : undefined;
  return {
    name: h.item_name ?? undefined,
    type: h.base_type ?? undefined,
    category: h.category ?? undefined,
    ilvlMin: h.ilvl_min ?? undefined,
    rarity: (h.rarity as Rarity | null) ?? undefined,
    stats,
    maxPrice:
      h.max_amount && h.max_ccy
        ? { amount: h.max_amount, currency: h.max_ccy as "divine" | "exalted" | "chaos" }
        : undefined,
    online: true,
    // recency feed, not a catalogue: without this, a price-asc scan surfaces week-old
    // zombie/bait listings — a hunt is "tell me when something NEW appears under my price"
    indexedWindow: "1day",
  };
}

/** Listing-level health counters — a scan that sees rares without mods must say so. */
export interface HuntDiag {
  listings: number;
  zeroModRares: number;
  rares: number;
  unrated: number;
  unreadableMods: number;
}

export interface ScanSummary {
  scanned: number;
  hits: number;
  errors: Array<{ hunt: string; error: string }>;
  diag: HuntDiag;
  book: BookCounters;
}

interface ScanCtx {
  league: string;
  rates: DivRates;
  idx: StatIndex;
  diag: HuntDiag;
  book: BookCounters;
}

/**
 * Price-book verdict for one rated listing, through the shared snipe gate.
 *
 * Deliberately OPPORTUNISTIC and mostly inert: it fires only when the book already holds ≥5
 * comparables under this listing's exact roll-bucket signature — which in practice means
 * autosnipe has been pricing the same archetype (hunts contribute few observations: 10 newest
 * listings per scan, and never from price-capped hunts). Kept because it costs one indexed query
 * per listing and can catch a hunted item the user has no target price for; the hunt's own
 * target/ceiling logic (recordHit) is the primary signal.
 */
function bookVerdict(h: Hunt, l: Listing, div: number, ctx: ScanCtx): void {
  if (!l.baseType || !l.listingId) return;
  const plan = buildPlan(listingToItem(l), ctx.idx);
  // a hunt's results are pre-filtered by ITS price ceiling — feeding them would teach the book
  // that the market tops out at that ceiling, so only uncapped hunts contribute observations
  if (h.max_amount == null) {
    feedPriceBook(ctx.league, { sig: plan.signature, baseType: l.baseType, div, listingId: l.listingId }, ctx.book);
  }
  const ref = bookReference(ctx.league, plan.signature, l.listingId);
  const verdict = evaluateSnipe({
    askDiv: div,
    refDiv: ref.valueDiv,
    samples: ref.samples,
    resolvedMods: plan.resolvedCount,
    indexed: l.indexed,
    discountPct: config.snipe.discountPct,
  });
  if (!verdict.pass) return;
  fireAlert(h.user_id, ctx.league, {
    type: "SNIPE",
    itemId: l.listingId,
    itemName: l.itemName,
    message: snipeAlertMessage({ marginPct: verdict.marginPct, askDiv: div, valueDiv: verdict.valueDiv, samples: ref.samples, exPerDiv: ctx.rates.exaltPerDivine, basis: "samples" }),
    value: verdict.marginPct,
    threshold: config.snipe.discountPct,
    whisper: l.whisper,
    dedupe: "once",
  });
}

/** Record a fresh, not-yet-seen listing as a hunt hit. Returns true when a hit was inserted. */
function recordHit(h: Hunt, l: Listing, div: number | null): boolean {
  if (!l.price) return false;
  // a listing that sat unsold for hours is stale bait, not a hit
  if (listingAgeMin(l.indexed) > config.hunt.freshMinutes) return false;
  const sig = `${h.id}|${l.account}|${l.price.amount}|${l.price.currency}`;
  if (recentHitByListing(h.user_id, l.listingId) || recentHitSig(h.user_id, sig, config.alertCooldownMin)) return false;
  insertHit(h.user_id, {
    hunt_id: h.id,
    item_name: l.itemName,
    base_type: l.baseType || h.base_type,
    price_amount: l.price.amount,
    price_ccy: l.price.currency,
    price_div: div,
    margin_pct: h.target_div != null && div != null ? ((h.target_div - div) / div) * 100 : null,
    account: l.account,
    whisper: l.whisper,
    listing_id: l.listingId,
    seller_online: l.online ? 1 : 0,
    listed_at: l.indexed,
    sig,
  });
  return true;
}

function processListing(h: Hunt, l: Listing, ctx: ScanCtx): { hit: boolean; div: number | null } {
  if (!l.price) return { hit: false, div: null };
  ctx.diag.listings++;
  ctx.diag.unreadableMods += l.unreadableMods;
  if ((l.rarity ?? "").toLowerCase() === "rare") ctx.diag.rares++;
  if (isZeroModRare(l)) ctx.diag.zeroModRares++;
  const priced = listingDiv(l.price, ctx.rates);
  const div = priced.kind === "rated" ? priced.div : null;
  if (div == null) ctx.diag.unrated++;
  else bookVerdict(h, l, div, ctx);
  return { hit: recordHit(h, l, div), div };
}

/** Scan one hunt: NEWEST live listings at/under the trigger price (poll-diff), record + alert. */
async function scanHunt(h: Hunt, ctx: ScanCtx, cred: TradeCred): Promise<number> {
  const { listings } = await searchListings(huntToQuery(h), config.hunt.perScan, { indexed: "desc" }, cred);
  let newHits = 0;
  let cheapest: { l: Listing; div: number } | null = null;
  for (const l of listings) {
    const { hit, div } = processListing(h, l, ctx);
    if (hit) newHits++;
    if (div != null && (cheapest == null || div < cheapest.div)) cheapest = { l, div };
  }
  if (newHits > 0) {
    const marginTxt =
      h.target_div != null && cheapest ? ` (~${(((h.target_div - cheapest.div) / cheapest.div) * 100).toFixed(0)}% vs target)` : "";
    const cheapTxt = cheapest?.l.price ? ` — cheapest ${cheapest.l.price.amount} ${cheapest.l.price.currency}` : "";
    fireAlert(h.user_id, ctx.league, {
      type: h.mode,
      itemId: `hunt-${h.id}`,
      itemName: h.label,
      message: `${newHits} new${cheapTxt}${marginTxt}`,
      value: newHits,
      threshold: 0,
    });
  }
  return newHits;
}

/** Health line for the status bar: first hunt error, else a broken-mod-capture warning. */
function runtimeError(errors: ScanSummary["errors"], diag: HuntDiag, book: BookCounters): string | null {
  if (errors.length > 0) return `${errors[0]!.hunt}: ${errors[0]!.error}`;
  if (diag.zeroModRares > 0) {
    return `${diag.zeroModRares}/${diag.rares} rare listing(s) arrived with no mods — trade2 mod capture is broken`;
  }
  if (diag.unreadableMods > 0) return `${diag.unreadableMods} mod entr(ies) in an unknown trade2 shape — parser out of date`;
  return describeRefusals(book);
}

async function buildCtx(): Promise<ScanCtx> {
  const league = getDefaultLeague();
  const rates = scanRates(league);
  const { stats } = await fetchTradeMeta();
  const diag: HuntDiag = { listings: 0, zeroModRares: 0, rares: 0, unrated: 0, unreadableMods: 0 };
  return { league, rates, idx: buildStatIndex(stats), diag, book: newBookCounters() };
}

/**
 * Scan active hunts, each with ITS OWNER's POESESSID. Pass `only` to scan a single user's hunts
 * (a queued manual scan); omit it to scan everyone's, skipping users without a stored cred. One
 * hunt's failure doesn't abort the rest — it is stamped on that hunt (last_error) instead.
 */
export async function scanAll(only?: { userId: number; cred: TradeCred }): Promise<ScanSummary> {
  const all = getHunts(true);
  const hunts = only ? all.filter((h) => h.user_id === only.userId) : all;
  const summary: ScanSummary = {
    scanned: 0,
    hits: 0,
    errors: [],
    diag: { listings: 0, zeroModRares: 0, rares: 0, unrated: 0, unreadableMods: 0 },
    book: newBookCounters(),
  };
  if (hunts.length === 0) return summary;

  let ctx: ScanCtx;
  try {
    ctx = await buildCtx();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setRuntime(0, `scan setup failed: ${msg}`, true);
    return { ...summary, errors: [{ hunt: "(all)", error: msg }] };
  }
  summary.diag = ctx.diag;
  summary.book = ctx.book;

  const credByUser = new Map<number, TradeCred | null>();
  if (only) credByUser.set(only.userId, only.cred);
  else for (const u of listUsers()) credByUser.set(u.id, credForUser(u));

  for (const h of hunts) {
    const cred = credByUser.get(h.user_id) ?? null;
    if (!cred) continue; // user hasn't connected a POESESSID — skip their hunts
    try {
      const hits = await scanHunt(h, ctx, cred);
      summary.hits += hits;
      summary.scanned++;
      touchHuntScan(h.id, hits > 0, null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.errors.push({ hunt: h.label, error: msg });
      touchHuntScan(h.id, false, msg);
    }
  }

  // publish scan health for the UI status bar (cross-process via DB)
  setRuntime(summary.scanned, runtimeError(summary.errors, ctx.diag, ctx.book), true);
  return summary;
}
