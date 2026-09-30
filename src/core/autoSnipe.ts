import { searchListings, type TradeCred } from "../api/tradeClient";
import { metered, newMeter, type TradeMeter } from "../api/tradeMeter";
import { fetchTradeMeta } from "../api/tradeMeta";
import { config } from "../config/env";
import { fireAlert } from "./alertEngine";
import { lastScanReport, saveSnipeFailure, saveSnipeReport } from "../db/snipeReportQueries";
import { getDefaultLeague } from "./leagueState";
import { listUsers } from "../db/userQueries";
import { buildStatIndex, type StatIndex, type ResolvedStat } from "./statResolver";
import { valueListingLive } from "./comparableValuation";
import { SNIPE_PROFILES, profileToQuery, type SnipeProfile } from "./snipeProfiles";
import { pickArchetypes, pickCandidates, rankCandidates, type Candidate } from "./autoSnipeCandidates";
import { bookReference, feedPriceBook, newBookCounters, describeRefusals, type BookCounters } from "./priceBookFeed";
import { evaluateSnipe, type SnipeGateInput, type SnipeGateResult } from "./snipeGate";
import { NEAR_MISS_KEEP, NEAR_MISS_MIN_MARGIN_PCT, nearMissReason, selectNearMisses, toNearMiss, type NearMissLimits } from "./snipeNearMiss";
import { scanRates } from "./scanRates";
import { snipeAlertMessage } from "./snipeAlert";
import { buildSnipeCard, listingTradeQuery } from "./snipeCard";
import { recordSnipeOutcome } from "../db/snipeOutcomeQueries";
import type { SnipeCard } from "../lib/snipeCard";
import type { NearMiss } from "../lib/snipeScanContract";
import type { DivRates } from "./listingPrice";

/**
 * Autonomous snipe scanner. Values each ITEM individually, the way a real price-check works:
 *   1. For a rotating slice of the valuable archetypes, pull the NEWEST instant-buyout listings
 *      (indexed desc, 1-day window) and feed them to the price book under the roll signature.
 *   2. Rank by desirability (price only as a tiebreak) above a price floor → candidates.
 *   3. Value each candidate by a relaxed comparable search on ITS OWN rolls (trimmed median of
 *      instant-buyout comparables, candidate excluded).
 *   4. Alert only what passes the shared snipe gate — once per listing, ever.
 *
 * Trade2 spend is capped per scan (scan-local search budget + archetype rotation) so craft margins
 * keep their cadence. Read-only throughout: it alerts, the human buys.
 */
export interface SnipeFinding {
  profile: string;
  label: string;
  listingId: string;
  account: string;
  itemName: string;
  baseType: string;
  keyMods: string; // human summary of the value-driving rolls
  whisper: string | null;
  online: boolean;
  priceDiv: number;
  valueDiv: number;
  marginPct: number;
  samples: number; // comparables behind the value (confidence)
  searchUrl: string; // working trade link to the comparable search
  card: SnipeCard; // what the alert renders: icon, mods, valuation basis, item trade link
}

/** Per-archetype diagnostics — explains what each archetype contributed (tune mins/categories). */
export interface ProfileDiag {
  key: string;
  label: string;
  total: number; // total live listings the archetype search reports
  fetched: number; // buyable, rated listings we pulled and screened
  candidates: number;
  verified: number; // candidates we actually live-valued (budget permitting)
  snipes: number;
  floorDiv: number; // trimmed-median reference (diagnostic only, NOT the value we snipe on)
  zeroModRares: number; // rares with no mods — mod capture broken if > 0
  unrated: number;
  note: string;
}

export interface ScanReport {
  /** The league the scan ran in, fixed at scan time. Readers (the Coach) must match on this, not
   *  on the current default league: a league switch leaves the last report in place. */
  league: string;
  profiles: number;
  searched: number;
  exaltPerDivine: number; // so the UI can render small Div values in exalt
  valuations: number; // per-item comparable searches spent this scan
  maxValuations: number;
  searches: number; // trade2 searches THIS scan issued (the scarce resource: 600 per 6h per IP)
  fetches: number;
  maxSearches: number;
  book: BookCounters;
  findings: SnipeFinding[];
  /** Best still-fresh near-misses of this and earlier scans (Market › Opportunities), deepest first. */
  nearMisses: NearMiss[];
  diags: ProfileDiag[];
  errors: Array<{ profile: string; error: string }>;
}

interface ScanCtx {
  idx: StatIndex;
  rates: DivRates;
  cred: TradeCred;
  league: string;
  report: ScanReport;
  meter: TradeMeter; // counts only this scan's requests — other consumers on the shared limiter don't eat it
  nearPool: NearMiss[]; // valued listings that just missed the gate, newest scan first
}

/** A candidate with its archetype's diagnostics and the id of the search that FOUND it — the id a
 *  later /fetch of this listing must quote (the outcome checker re-fetches with it). */
type PoolEntry = Candidate & { diag: ProfileDiag; queryId: string };

// an archetype costs 1 search; a valuation up to 2 (distinctive + pseudo-only fallback)
const hasBudget = (ctx: ScanCtx, searches: number): boolean => ctx.meter.search + searches <= config.autoSnipe.maxSearchesPerScan;

/** One-line summary of the value-driving rolls, for the alert + UI ("Life 118 · Res 134 · +2 Cold skills"). */
function describeStats(stats: ResolvedStat[]): string {
  return stats
    .filter((s) => s.group === "pseudo" || s.value > 0)
    .slice(0, 4)
    .map((s) => (s.value > 0 ? s.text.replace("#", String(Math.round(s.value))) : s.text))
    .join(" · ");
}

function diagNote(resolved: number, d: ProfileDiag): string {
  if (resolved === 0) return "stat text didn't resolve — category-only search (fix profile text)";
  if (d.zeroModRares > 0) return `${d.zeroModRares} rare listing(s) had no mods — trade2 mod capture broken`;
  if (d.candidates === 0) return "no candidate items (below price floor, stale, or too few resolved mods)";
  return "";
}

/** Pull + record one archetype's newest listings and surface its most desirable candidates. */
async function collectArchetype(profile: SnipeProfile, ctx: ScanCtx): Promise<{ candidates: Candidate[]; diag: ProfileDiag; queryId: string }> {
  const { query, resolved } = profileToQuery(profile, ctx.idx);
  const { total, listings, queryId } = await searchListings(query, config.autoSnipe.fetchPerArchetype, { indexed: "desc" }, ctx.cred);
  const { candidates, floorDiv, observations, diag: cd } = pickCandidates(profile, listings, ctx.rates, ctx.idx);
  for (const o of observations) feedPriceBook(ctx.league, o, ctx.report.book);

  const diag: ProfileDiag = {
    key: profile.key,
    label: profile.label,
    total,
    fetched: cd.fetched,
    candidates: candidates.length,
    verified: 0,
    snipes: 0,
    floorDiv,
    zeroModRares: cd.zeroModRares,
    unrated: cd.unrated,
    note: "",
  };
  diag.note = diagNote(resolved, diag);
  return { candidates, diag, queryId };
}

function alertEveryone(finding: SnipeFinding, ctx: ScanCtx): void {
  // market snipes are shared opportunities — alert every account holder, once per listing each.
  // The scan runs under ONE cred in the app default league, so that is the market they belong to.
  for (const u of listUsers()) {
    fireAlert(u.id, ctx.league, {
      type: "SNIPE",
      itemId: finding.listingId,
      itemName: finding.itemName,
      message: snipeAlertMessage({
        marginPct: finding.marginPct,
        askDiv: finding.priceDiv,
        valueDiv: finding.valueDiv,
        samples: finding.samples,
        exPerDiv: ctx.rates.exaltPerDivine,
        basis: "comps",
        keyMods: finding.keyMods,
      }),
      value: finding.marginPct,
      threshold: config.valuation.discountPct,
      whisper: finding.whisper,
      link: finding.card.tradeUrl, // finds THIS listing; the comparable search rides in the card
      details: finding.card,
      dedupe: "once",
    });
  }
}

/** Start outcome tracking for an alerted snipe. A failure is reported, never allowed to lose the finding. */
function trackOutcome(c: PoolEntry, finding: SnipeFinding, ctx: ScanCtx): void {
  // the re-search fallback must find the seller's copy: without a known account it cannot
  const recheck = listingTradeQuery(c.listing);
  try {
    recordSnipeOutcome({
      listingId: finding.listingId,
      league: ctx.league,
      profile: finding.profile,
      baseType: finding.baseType,
      itemName: finding.itemName,
      askDiv: finding.priceDiv,
      valueDiv: finding.valueDiv,
      marginPct: finding.marginPct,
      samples: finding.samples,
      queryId: c.queryId,
      recheckQuery: recheck.account ? recheck : null,
      alertedAt: Date.now(),
    });
  } catch (e) {
    const error = `outcome tracking: ${e instanceof Error ? e.message : String(e)}`;
    console.error(`[autosnipe] ${finding.listingId}: ${error}`);
    ctx.report.errors.push({ profile: c.profile.key, error });
  }
}

const nearMissLimits = (): NearMissLimits => ({
  gate: config.snipeGate,
  minMarginPct: NEAR_MISS_MIN_MARGIN_PCT,
  minValueDiv: config.valuation.minValueDiv,
});

/** Keep a gate failure that was only short on margin or comparables — free, the value is already known. */
function noteNearMiss(c: PoolEntry, input: SnipeGateInput, verdict: SnipeGateResult, basis: NearMiss["basis"], ctx: ScanCtx): void {
  const reason = nearMissReason(input, verdict, nearMissLimits());
  if (reason == null || verdict.pass || input.refDiv == null) return;
  ctx.nearPool.push(
    toNearMiss({
      listing: c.listing,
      archetype: c.profile.label,
      league: ctx.league,
      askDiv: c.div,
      refDiv: input.refDiv,
      samples: input.samples,
      basis,
      reason,
      detail: verdict.detail,
      exaltPerDivine: ctx.rates.exaltPerDivine,
    }),
  );
}

const gateInput = (c: PoolEntry, refDiv: number | null, samples: number): SnipeGateInput => ({
  askDiv: c.div,
  refDiv,
  samples,
  resolvedMods: c.resolvedMods,
  indexed: c.listing.indexed,
  discountPct: config.valuation.discountPct,
});

/** Confirm + alert a candidate as a snipe, or return null. Spends up to two comparable searches. */
async function valueAndAlert(c: PoolEntry, ctx: ScanCtx): Promise<SnipeFinding | null> {
  const { value, plan, searchUrl, broadened } = await valueListingLive(c.listing, ctx.idx, ctx.rates, ctx.cred);
  const input = gateInput(c, value.valueDiv, value.samples);
  const verdict = evaluateSnipe(input);
  if (!verdict.pass) noteNearMiss(c, input, verdict, "comps", ctx);
  if (!verdict.pass || verdict.valueDiv < config.valuation.minValueDiv) return null;

  const finding: SnipeFinding = {
    profile: c.profile.key,
    label: c.profile.label,
    listingId: c.listing.listingId,
    account: c.listing.account,
    itemName: c.listing.itemName || c.profile.label,
    baseType: c.listing.baseType,
    keyMods: describeStats(plan.searchStats),
    whisper: c.listing.whisper,
    online: c.listing.online,
    priceDiv: c.div,
    valueDiv: verdict.valueDiv,
    marginPct: verdict.marginPct,
    samples: value.samples,
    searchUrl,
    card: buildSnipeCard({
      listing: c.listing,
      league: ctx.league,
      priceDiv: c.div,
      valueDiv: verdict.valueDiv,
      marginPct: verdict.marginPct,
      exaltPerDivine: ctx.rates.exaltPerDivine,
      value,
      searchStats: plan.searchStats,
      broadened,
      comparablesUrl: searchUrl,
    }),
  };
  alertEveryone(finding, ctx);
  trackOutcome(c, finding, ctx);
  return finding;
}

/** Book short-circuit: a well-sampled signature whose ask isn't under the book's discount line
 *  is a known fair price — skip the live valuation and save the rate budget. Such a listing may
 *  still be a near-miss on the book's value. */
function knownFair(c: PoolEntry, ctx: ScanCtx): boolean {
  const ref = bookReference(ctx.league, c.sig, c.listing.listingId);
  if (ref.valueDiv == null || ref.samples < config.snipeGate.minSamples) return false;
  if (c.div <= ref.valueDiv * (1 - config.valuation.discountPct / 100)) return false;
  const input = gateInput(c, ref.valueDiv, ref.samples);
  noteNearMiss(c, input, evaluateSnipe(input), "book", ctx);
  return true;
}

async function collectPhase(profiles: SnipeProfile[], ctx: ScanCtx): Promise<PoolEntry[]> {
  const pool: PoolEntry[] = [];
  for (const p of profiles) {
    if (!hasBudget(ctx, 1)) {
      ctx.report.errors.push({ profile: p.key, error: "search budget reached — archetype deferred to a later scan" });
      continue;
    }
    try {
      const { candidates, diag, queryId } = await collectArchetype(p, ctx);
      ctx.report.searched++;
      ctx.report.diags.push(diag);
      for (const c of candidates) pool.push({ ...c, diag, queryId });
    } catch (e) {
      ctx.report.errors.push({ profile: p.key, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return pool;
}

async function valuationPhase(pool: PoolEntry[], ctx: ScanCtx): Promise<void> {
  for (const c of rankCandidates(pool)) {
    if (ctx.report.valuations >= config.autoSnipe.maxValuations || !hasBudget(ctx, 2)) {
      if (!c.diag.note) c.diag.note = "valuation budget reached — candidate not valued this scan";
      continue;
    }
    if (knownFair(c, ctx)) continue;
    ctx.report.valuations++;
    c.diag.verified++;
    try {
      const finding = await valueAndAlert(c, ctx);
      if (finding) {
        ctx.report.findings.push(finding);
        c.diag.snipes++;
      }
    } catch (e) {
      ctx.report.errors.push({ profile: c.profile.key, error: `valuation: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
}

/**
 * The last report's near-misses, when it was scanned in the same league. Each scan covers only a
 * slice of the archetypes, so without carrying them the list would shrink to whatever this slice saw.
 * An unreadable last report carries nothing and says so.
 */
function carriedNearMisses(league: string): NearMiss[] {
  const report = lastScanReport()?.report;
  return report && report.league === league ? (report.nearMisses ?? []) : [];
}

let rotationCursor = 0;
let running = false;

export function emptyReport(exaltPerDivine: number, league: string): ScanReport {
  return {
    league,
    profiles: SNIPE_PROFILES.length,
    searched: 0,
    exaltPerDivine,
    valuations: 0,
    maxValuations: config.autoSnipe.maxValuations,
    searches: 0,
    fetches: 0,
    maxSearches: config.autoSnipe.maxSearchesPerScan,
    book: newBookCounters(),
    findings: [],
    nearMisses: [],
    diags: [],
    errors: [],
  };
}


async function runScan(cred: TradeCred): Promise<ScanReport> {
  // Read once, before any await: the rates and the report's league stamp must be the same
  // league even if the default switches while trade metadata loads.
  const league = getDefaultLeague();
  const rates = scanRates(league);
  const { stats } = await fetchTradeMeta();
  const { picked, next } = pickArchetypes(SNIPE_PROFILES, rotationCursor, config.autoSnipe.archetypesPerScan);
  rotationCursor = next;
  const report = emptyReport(rates.exaltPerDivine, league);
  const ctx: ScanCtx = { idx: buildStatIndex(stats), rates, cred, league, report, meter: newMeter(), nearPool: [] };

  await metered(ctx.meter, async () => valuationPhase(await collectPhase(picked, ctx), ctx));
  // this scan's near-misses first (newer), then the last report's that are still fresh
  report.nearMisses = selectNearMisses([...ctx.nearPool, ...carriedNearMisses(league)], Date.now(), nearMissLimits(), NEAR_MISS_KEEP);
  report.searches = ctx.meter.search;
  report.fetches = ctx.meter.fetch;
  const refusals = describeRefusals(report.book);
  if (refusals) report.errors.push({ profile: "(price book)", error: refusals });
  return report;
}

/**
 * Run one autonomous scan over the next slice of archetypes. Throws if a scan is already in
 * flight in this process (the poller also guards, this makes the invariant local). A scan that
 * fails as a whole records its error apart from the report, so the last good findings survive.
 */
export async function scanAutoSnipes(cred: TradeCred): Promise<ScanReport> {
  if (running) throw new Error("autosnipe scan already running");
  running = true;
  try {
    const report = await runScan(cred);
    saveSnipeReport(JSON.stringify(report)); // the UI reads the latest scan across processes
    return report;
  } catch (e) {
    saveSnipeFailure(`scan failed: ${e instanceof Error ? e.message : String(e)}`); // last good report kept
    throw e;
  } finally {
    running = false;
  }
}
