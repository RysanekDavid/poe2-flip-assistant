import type { RecipeMarginReport } from "./craftRecipes";
import type { Confidence, RankGate } from "./craftValuation";

/**
 * Three-tier ranking of craft recipes (pure). A list with no profitable pick must still say which
 * craft is closest to profit and why the others could not be priced — "no recipe has enough
 * listings" alone told the player nothing. Mirrored by services/coach craft_gate.rank_key; the
 * golden fixture services/coach/tests/fixtures/craft_rank_golden.json pins both orderings.
 *   picks       — gate passes AND EV > 0, by EV desc
 *   nearMisses  — base and result both priced but not a pick, by margin % desc, then confidence
 *   unpriced    — a leg failed / materials missing / never scanned, most recent scan first
 */
export interface RankInput {
  key: string;
  report: RecipeMarginReport | null;
  gate: RankGate;
  scannedAt: string | null; // sqlite "YYYY-MM-DD HH:MM:SS" — sorts lexicographically
}

export type Verdict = "pick" | "near_miss" | "unpriced";

export interface RankTiers<T extends RankInput> {
  picks: T[];
  nearMisses: T[];
  unpriced: T[];
}

const CONFIDENCE_ORDER: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

/** Which tier a recipe lands in. Priced = both legs priced in an "ok" report. */
export function verdictOf(gateOk: boolean, evDiv: number, priced: boolean): Verdict {
  if (!priced) return "unpriced";
  return gateOk && evDiv > 0 ? "pick" : "near_miss";
}

const priced = (r: RecipeMarginReport | null): r is RecipeMarginReport => r?.status === "ok" && r.base != null && r.result != null;

const confidenceRank = (v: RankInput): number => CONFIDENCE_ORDER[v.report?.nearMiss?.confidence ?? "low"];
const byKey = (a: RankInput, b: RankInput): number => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

function byEv(a: RankInput, b: RankInput): number {
  return (b.report?.evDiv ?? 0) - (a.report?.evDiv ?? 0) || byKey(a, b);
}

function byMarginThenConfidence(a: RankInput, b: RankInput): number {
  return (b.report?.marginPct ?? 0) - (a.report?.marginPct ?? 0) || confidenceRank(a) - confidenceRank(b) || byKey(a, b);
}

function byRecentScan(a: RankInput, b: RankInput): number {
  if (a.scannedAt === b.scannedAt) return byKey(a, b);
  if (a.scannedAt === null) return 1;
  if (b.scannedAt === null) return -1;
  return a.scannedAt < b.scannedAt ? 1 : -1;
}

/** Split recipe views into the three tiers, each sorted by its own key. */
export function rankCandidates<T extends RankInput>(views: readonly T[]): RankTiers<T> {
  const tiers: RankTiers<T> = { picks: [], nearMisses: [], unpriced: [] };
  for (const v of views) {
    const verdict = verdictOf(v.gate.ok, v.report?.evDiv ?? 0, priced(v.report));
    if (verdict === "pick") tiers.picks.push(v);
    else if (verdict === "near_miss") tiers.nearMisses.push(v);
    else tiers.unpriced.push(v);
  }
  tiers.picks.sort(byEv);
  tiers.nearMisses.sort(byMarginThenConfidence);
  tiers.unpriced.sort(byRecentScan);
  return tiers;
}
