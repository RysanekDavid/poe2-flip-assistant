import { searchListings, type TradeCred } from "../api/tradeClient";
import { metered, newMeter, type TradeMeter } from "../api/tradeMeter";
import { fetchTradeMeta } from "../api/tradeMeta";
import { config } from "../config/env";
import { fireAlert } from "./alertEngine";
import { saveSnipeReport } from "../db/huntQueries";
import { getDefaultLeague } from "./leagueState";
import { listUsers } from "../db/userQueries";
import { buildStatIndex, type StatIndex, type ResolvedStat } from "./statResolver";
import { valueListingLive } from "./comparableValuation";
import { SNIPE_PROFILES, profileToQuery, type SnipeProfile } from "./snipeProfiles";
import { pickArchetypes, pickCandidates, rankCandidates, type Candidate } from "./autoSnipeCandidates";
import { bookReference, feedPriceBook, newBookCounters, describeRefusals, type BookCounters } from "./priceBookFeed";
import { evaluateSnipe } from "./snipeGate";
import { scanRates } from "./scanRates";
import { snipeAlertMessage } from "./snipeAlert";
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
 * Trade2 spend is capped per scan (scan-local search budget + archetype rotation) so hunts keep their
 * cadence. Read-only throughout: it alerts, the human buys.
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
  diags: ProfileDiag[];
  errors: Array<{ profile: string; error: string }>;
  error?: string; // set when the scan failed as a whole (the UI shows it instead of waiting forever)
}

interface ScanCtx {
  idx: StatIndex;
  rates: DivRates;
  cred: TradeCred;
  league: string;
  report: ScanReport;
  meter: TradeMeter; // counts only this scan's requests — hunts on the shared limiter don't eat it
}

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
async function collectArchetype(profile: SnipeProfile, ctx: ScanCtx): Promise<{ candidates: Candidate[]; diag: ProfileDiag }> {
  const { query, resolved } = profileToQuery(profile, ctx.idx);
  const { total, listings } = await searchListings(query, config.autoSnipe.fetchPerArchetype, { indexed: "desc" }, ctx.cred);
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
  return { candidates, diag };
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
      link: finding.searchUrl,
      dedupe: "once",
    });
  }
}

/** Confirm + alert a candidate as a snipe, or return null. Spends up to two comparable searches. */
async function valueAndAlert(c: Candidate, ctx: ScanCtx): Promise<SnipeFinding | null> {
  const { value, plan, searchUrl } = await valueListingLive(c.listing, ctx.idx, ctx.rates, ctx.cred);
  const verdict = evaluateSnipe({
    askDiv: c.div,
    refDiv: value.valueDiv,
    samples: value.samples,
    resolvedMods: c.resolvedMods,
    indexed: c.listing.indexed,
    discountPct: config.valuation.discountPct,
  });
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
  };
  alertEveryone(finding, ctx);
  return finding;
}

/** Book short-circuit: a well-sampled signature whose ask isn't under the book's discount line
 *  is a known fair price — skip the live valuation and save the rate budget. */
function knownFair(c: Candidate, ctx: ScanCtx): boolean {
  const ref = bookReference(ctx.league, c.sig, c.listing.listingId);
  if (ref.valueDiv == null || ref.samples < config.snipeGate.minSamples) return false;
  return c.div > ref.valueDiv * (1 - config.valuation.discountPct / 100);
}

async function collectPhase(profiles: SnipeProfile[], ctx: ScanCtx): Promise<Array<Candidate & { diag: ProfileDiag }>> {
  const pool: Array<Candidate & { diag: ProfileDiag }> = [];
  for (const p of profiles) {
    if (!hasBudget(ctx, 1)) {
      ctx.report.errors.push({ profile: p.key, error: "search budget reached — archetype deferred to a later scan" });
      continue;
    }
    try {
      const { candidates, diag } = await collectArchetype(p, ctx);
      ctx.report.searched++;
      ctx.report.diags.push(diag);
      for (const c of candidates) pool.push({ ...c, diag });
    } catch (e) {
      ctx.report.errors.push({ profile: p.key, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return pool;
}

async function valuationPhase(pool: Array<Candidate & { diag: ProfileDiag }>, ctx: ScanCtx): Promise<void> {
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

let rotationCursor = 0;
let running = false;

function emptyReport(exaltPerDivine: number): ScanReport {
  return {
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
    diags: [],
    errors: [],
  };
}

/** Persist a scan that failed as a whole, so the UI stops waiting and shows why. */
export function saveFailedSnipeReport(error: string): void {
  saveSnipeReport(JSON.stringify({ ...emptyReport(0), error }));
}

async function runScan(cred: TradeCred): Promise<ScanReport> {
  const rates = scanRates();
  const { stats } = await fetchTradeMeta();
  const { picked, next } = pickArchetypes(SNIPE_PROFILES, rotationCursor, config.autoSnipe.archetypesPerScan);
  rotationCursor = next;
  const report = emptyReport(rates.exaltPerDivine);
  const ctx: ScanCtx = { idx: buildStatIndex(stats), rates, cred, league: getDefaultLeague(), report, meter: newMeter() };

  await metered(ctx.meter, async () => valuationPhase(await collectPhase(picked, ctx), ctx));
  report.searches = ctx.meter.search;
  report.fetches = ctx.meter.fetch;
  const refusals = describeRefusals(report.book);
  if (refusals) report.errors.push({ profile: "(price book)", error: refusals });
  return report;
}

/**
 * Run one autonomous scan over the next slice of archetypes. Throws if a scan is already in
 * flight in this process (the poller also guards, this makes the invariant local). A scan that
 * fails as a whole still writes a report carrying the error.
 */
export async function scanAutoSnipes(cred: TradeCred): Promise<ScanReport> {
  if (running) throw new Error("autosnipe scan already running");
  running = true;
  try {
    const report = await runScan(cred);
    saveSnipeReport(JSON.stringify(report)); // the UI reads the latest scan across processes
    return report;
  } catch (e) {
    saveFailedSnipeReport(`scan failed: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  } finally {
    running = false;
  }
}
