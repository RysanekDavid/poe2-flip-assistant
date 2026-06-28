import { searchListings, type Listing, type TradeCred } from "../api/tradeClient";
import { fetchScout, type ScoutRates } from "../api/scoutClient";
import { fetchTradeMeta } from "../api/tradeMeta";
import { config } from "../config/env";
import { fireAlert } from "./alertEngine";
import { recordObservation, observedPrices } from "../db/queries";
import { listUsers } from "../db/userQueries";
import { toDivine } from "./huntEngine";
import { buildStatIndex, type StatIndex, type ResolvedStat } from "./statResolver";
import { summarizePrices, snipeVerdict } from "./priceBook";
import { buildPlan, listingToItem, valueListingLive, checkSnipe } from "./comparableValuation";
import { SNIPE_PROFILES, profileToQuery, type SnipeProfile } from "./snipeProfiles";

/**
 * Autonomous snipe scanner — REDESIGNED.
 *
 * The old model valued a whole CATEGORY by the median of its cheapest listings. That is
 * structurally wrong: a category has no single value (a 90-life and a 140-life glove are not
 * the same item), and the cheapest listings of a broad search are 1-exalt vendor junk, so the
 * "value" collapsed to the junk floor and every item looked worthless.
 *
 * This version values each ITEM individually, the way a real price-check works:
 *   1. For each valuable archetype, pull the cheapest listings and record them in the price
 *      book under a ROLL-AWARE signature (base + mods + roll buckets).
 *   2. Take the cheapest REAL listings (≥ minCandidateDiv, ≤ maxTargetDiv) as candidates —
 *      these are the snipe-likely ones; sub-junk is skipped so we never waste a valuation on it.
 *   3. Value each candidate by a relaxed comparable search on ITS OWN rolls → a concrete fair
 *      value with a concrete item name and the comparables behind it.
 *   4. A candidate priced far under its own value (and worth ≥ minValueDiv) is a SNIPE → alert
 *      with the item, the key mods, the price/value gap, a working trade link, and the whisper.
 *
 * Per-item searches are the rate-limit risk, so they are hard-capped per scan (maxValuations)
 * and the book short-circuits candidates whose signature is already known to be fairly priced.
 * Read-only throughout: it alerts, the human buys.
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
  fetched: number; // priced+online listings we pulled and recorded
  candidates: number; // cheapest real listings put forward for valuation
  verified: number; // candidates we actually live-valued (budget permitting)
  snipes: number;
  floorDiv: number; // trimmed-median reference (diagnostic only, NOT the value we snipe on)
  note: string;
}

export interface ScanReport {
  profiles: number;
  searched: number;
  exaltPerDivine: number; // so the UI can render small Div values in exalt
  valuations: number; // per-item comparable searches spent this scan
  maxValuations: number;
  findings: SnipeFinding[];
  diags: ProfileDiag[];
  errors: Array<{ profile: string; error: string }>;
}

const sortAsc = (xs: number[]): number[] => [...xs].sort((a, b) => a - b);
const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = sortAsc(xs);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Median of the cluster left after dropping the cheapest `trim` fraction — a junk-resistant
 *  central price, used ONLY as a diagnostic reference, never as the value we alert on. */
export function trimmedMedian(divsAsc: number[], trim = 0.25): number {
  if (divsAsc.length === 0) return 0;
  const start = Math.floor(divsAsc.length * trim);
  return median(divsAsc.slice(start));
}

/**
 * Value-driving mod count of a planned item: distinctive explicits (skill levels, spirit, spell/
 * attack dmg, crit, speed) weigh 2, pseudo totals (life/res/attr) weigh 1. Junk (only generic
 * life+res → pseudos) scores low; a multi-chase-mod item scores high. Used to spend the limited
 * valuation budget on the most promising CHEAP listings rather than random or merely-cheapest ones.
 */
export function desirability(searchStats: ResolvedStat[]): number {
  return searchStats.reduce((s, st) => s + (st.group === "pseudo" ? 1 : 2), 0);
}

export interface Candidate {
  profile: SnipeProfile;
  listing: Listing;
  div: number;
  sig: string;
  score: number;
  floorDiv: number;
}

export interface Observation {
  sig: string;
  baseType: string;
  div: number;
  listingId: string | null;
}

/**
 * Pure: resolve + score every listing, then surface the best snipe candidates = highest
 * value-driving mods PER DIVINE. There is deliberately NO absolute price floor — a god-roll
 * fat-fingered to 1 exalt is the juiciest snipe of all, and the old floor skipped exactly those.
 * The desirability score (not price) separates a cheap god-roll from cheap vendor junk; the
 * per-item valuation + `minValueDiv` gate downstream reject anything genuinely worthless. Also
 * returns the full observation set so the caller can feed the price book.
 */
export function pickCandidates(
  profile: SnipeProfile,
  listings: Listing[],
  rates: ScoutRates,
  idx: StatIndex,
): { candidates: Candidate[]; floorDiv: number; fetched: number; observations: Observation[] } {
  const scored = listings
    .filter((l) => l.price && l.online)
    .map((l) => {
      const div = toDivine(l.price!.amount, l.price!.currency, rates);
      const plan = buildPlan(listingToItem(l), idx);
      return { l, div, sig: plan.signature, score: desirability(plan.searchStats) };
    })
    .filter((x) => Number.isFinite(x.div) && x.div > 0);

  const floorDiv = trimmedMedian([...scored.map((x) => x.div)].sort((a, b) => a - b));
  const observations: Observation[] = scored.map((x) => ({
    sig: x.sig,
    baseType: x.l.baseType || profile.label,
    div: x.div,
    listingId: x.l.listingId,
  }));

  const candidates = scored
    .filter(
      (x) =>
        x.score >= config.autoSnipe.minCandidateScore &&
        x.div >= config.autoSnipe.minCandidateDiv &&
        x.div <= config.snipe.maxTargetDiv,
    )
    .sort((a, b) => b.score / b.div - a.score / a.div) // best mods-per-Divine first
    .slice(0, config.autoSnipe.candidatesPerArchetype)
    .map((x) => ({ profile, listing: x.l, div: x.div, sig: x.sig, score: x.score, floorDiv }));

  return { candidates, floorDiv, fetched: scored.length, observations };
}

/** One-line summary of the value-driving rolls, for the alert + UI ("Life 118 · Res 134 · +2 Cold skills"). */
function describeStats(stats: ResolvedStat[]): string {
  return stats
    .filter((s) => s.group === "pseudo" || s.value > 0)
    .slice(0, 4)
    .map((s) => (s.value > 0 ? s.text.replace("#", String(Math.round(s.value))) : s.text))
    .join(" · ");
}

/** Pull + record one archetype's listings and surface its cheapest real candidates. */
async function collectArchetype(
  profile: SnipeProfile,
  idx: StatIndex,
  rates: ScoutRates,
  cred: TradeCred,
): Promise<{ candidates: Candidate[]; diag: ProfileDiag }> {
  const { query, resolved } = profileToQuery(profile, idx);
  // 0 resolved stats no longer aborts — we still scan the category (per-item valuation is the
  // real filter); a bad stat text just means coarser candidates. Surfaced via the diag note.
  const { total, listings } = await searchListings(query, config.autoSnipe.fetchPerArchetype, "asc", cred);

  const { candidates, floorDiv, fetched, observations } = pickCandidates(profile, listings, rates, idx);

  // feed the price book (builds the per-signature distribution over scans → lets us short-circuit
  // known-fair items later)
  for (const o of observations) recordObservation(o.sig, o.baseType, o.div, o.listingId);
  const diag: ProfileDiag = {
    key: profile.key,
    label: profile.label,
    total,
    fetched,
    candidates: candidates.length,
    verified: 0,
    snipes: 0,
    floorDiv,
    note:
      resolved === 0
        ? "stat text didn't resolve — category-only search (fix profile text)"
        : candidates.length === 0
          ? "no candidate items (mods too plain / nothing resolved)"
          : "",
  };
  return { candidates, diag };
}

/** Confirm + alert a candidate as a snipe, or return null. Spends one (sometimes two) trade2 searches. */
async function valueAndAlert(c: Candidate, idx: StatIndex, rates: ScoutRates, cred: TradeCred): Promise<SnipeFinding | null> {
  const { value, plan, searchUrl } = await valueListingLive(c.listing, idx, rates, cred);
  const verdict = checkSnipe(c.div, value);
  if (!verdict.isSnipe || value.valueDiv < config.valuation.minValueDiv) return null;

  const keyMods = describeStats(plan.searchStats);
  const finding: SnipeFinding = {
    profile: c.profile.key,
    label: c.profile.label,
    listingId: c.listing.listingId,
    account: c.listing.account,
    itemName: c.listing.itemName || c.profile.label,
    baseType: c.listing.baseType,
    keyMods,
    whisper: c.listing.whisper,
    online: c.listing.online,
    priceDiv: c.div,
    valueDiv: value.valueDiv,
    marginPct: verdict.marginPct,
    samples: value.samples,
    searchUrl,
  };

  // market snipes are shared opportunities — alert every account holder (fireAlert de-dupes by
  // listingId within the cooldown, so each user only pings once per listing)
  for (const u of listUsers()) {
    fireAlert(u.id, {
      type: "SNIPE",
      itemId: finding.listingId || `auto-${c.profile.key}`,
      itemName: finding.itemName,
      message: `${Math.round(finding.marginPct)}% under — ${finding.priceDiv.toFixed(0)} vs ~${finding.valueDiv.toFixed(0)} Div (${finding.samples} comps)${keyMods ? ` · ${keyMods}` : ""}`,
      value: finding.marginPct,
      threshold: config.valuation.discountPct,
      whisper: finding.whisper,
      link: finding.searchUrl,
    });
  }
  return finding;
}

/**
 * Run one autonomous scan: collect candidates from every archetype (cheap searches), then spend
 * a capped per-item valuation budget on the most promising ones. A candidate whose signature is
 * already well-sampled in the book AND not below its book floor is skipped for free.
 */
export async function scanAutoSnipes(cred: TradeCred): Promise<ScanReport> {
  const { rates } = await fetchScout();
  const { stats } = await fetchTradeMeta();
  const idx = buildStatIndex(stats);

  const report: ScanReport = {
    profiles: SNIPE_PROFILES.length,
    searched: 0,
    exaltPerDivine: rates.exaltPerDivine,
    valuations: 0,
    maxValuations: config.autoSnipe.maxValuations,
    findings: [],
    diags: [],
    errors: [],
  };

  // phase 1 — collect candidates (one cheap search per archetype)
  const pool: Array<Candidate & { diag: ProfileDiag }> = [];
  for (const p of SNIPE_PROFILES) {
    try {
      const { candidates, diag } = await collectArchetype(p, idx, rates, cred);
      report.searched++;
      report.diags.push(diag);
      for (const c of candidates) pool.push({ ...c, diag });
    } catch (e) {
      report.errors.push({ profile: p.key, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // rank: most value-driving mods per Divine first (most likely to be a real snipe)
  pool.sort((a, b) => b.score / b.div - a.score / a.div);

  // phase 2 — spend the valuation budget
  for (const c of pool) {
    if (report.valuations >= config.autoSnipe.maxValuations) {
      if (!c.diag.note) c.diag.note = "valuation budget reached — raise AUTOSNIPE_MAX_VALUATIONS to value more";
      break;
    }

    // book short-circuit: if we've seen this exact roll-bucket enough and the ask isn't below the
    // book floor, it's a known fair price — skip the live search (saves rate budget)
    const book = summarizePrices(observedPrices(c.sig));
    if (book.samples >= config.snipe.minSamples && !snipeVerdict(c.sig, c.div, book).isSnipe) continue;

    report.valuations++;
    c.diag.verified++;
    try {
      const finding = await valueAndAlert(c, idx, rates, cred);
      if (finding) {
        report.findings.push(finding);
        c.diag.snipes++;
      }
    } catch (e) {
      report.errors.push({ profile: c.profile.key, error: `valuation: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  return report;
}
