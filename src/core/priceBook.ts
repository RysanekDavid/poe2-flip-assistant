import { config } from "../config/env";

/**
 * Price Book: value a rare item from observed market listings instead of a per-item live
 * search (which the trade2 rate limit can't sustain at scale). Every listing we see is
 * recorded under a (base + mod-signature) key; the distribution of asks under that key is
 * the market value. A listing far below the median, on a key with enough samples (volume
 * confidence), is a SNIPE.
 *
 * The signature is intentionally coarse for the MVP — same base + same SET of mod types
 * (rolls collapsed to '#'). Roll-quality variance becomes spread in the distribution; a
 * 50-vs-420 outlier still falls below the floor. Refine later with roll-tier bucketing
 * and pseudo-mod grouping (ref: Exiled Exchange 2 stat maps).
 */

/** Collapse a mod line to a roll-independent shape: numbers → '#', lowercased. */
function normMod(m: string): string {
  return m
    .replace(/[+-]?\d+(?:\.\d+)?/g, "#")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Stable key for an item: base type + its sorted, de-duped normalized mod set. */
export function modSignature(baseType: string, mods: string[]): string {
  const norm = [...new Set(mods.map(normMod).filter(Boolean))].sort();
  return `${baseType.toLowerCase().trim()}|${norm.join("~")}`;
}

/**
 * Constant-relative-width roll buckets: two rolls within ~ratio of each other share a code,
 * so a 92-life and a 104-life glove group together but a 92 and a 150 do NOT. This is what
 * keeps a god-roll's price out of the same distribution as a mediocre roll — the flaw that
 * made the old category-median value collapse to the junk floor.
 */
const ROLL_BUCKET_RATIO = 1.25; // ≈ ±25% band per bucket

/** Quantise a roll into a coarse tier label. value ≤ 0 → presence-only ('p'). */
export function bucketCode(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "p";
  return "b" + Math.round(Math.log(value) / Math.log(ROLL_BUCKET_RATIO));
}

/**
 * Roll-AWARE signature: base type + sorted (stat ref + roll bucket). Unlike modSignature this
 * encodes *how high* each mod rolled, so the price-book distribution under a key is genuinely
 * comparable items — the precondition for a meaningful "this listing is far under value" call.
 */
export function rollSignature(baseType: string, stats: Array<{ ref: string; value: number }>): string {
  const parts = [...new Set(stats.map((s) => `${s.ref}#${bucketCode(s.value)}`))].sort();
  return `${baseType.toLowerCase().trim()}|${parts.join("~")}`;
}

export interface PriceStats {
  samples: number;
  median: number | null;
  p25: number | null;
  min: number | null;
}

/** Median / 25th-percentile / min of a price sample (computed in JS — keys are narrow). */
export function summarizePrices(prices: number[]): PriceStats {
  const s = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  if (s.length === 0) return { samples: 0, median: null, p25: null, min: null };
  const at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
  const mid = Math.floor(s.length / 2);
  const median = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return { samples: s.length, median, p25: at(0.25), min: s[0]! };
}

export interface SnipeResult {
  sig: string;
  askDiv: number;
  valueDiv: number | null; // market value estimate (median of comparables)
  samples: number;
  minDiv: number | null;
  p25Div: number | null;
  discountPct: number | null; // % below median
  isSnipe: boolean;
  reason: string;
}

/**
 * Decide whether `askDiv` is a snipe for a signature, given its observed price stats.
 * Snipe = enough samples (volume confidence) AND ask at/below median × (1 - discount).
 */
export function snipeVerdict(sig: string, askDiv: number, stats: PriceStats): SnipeResult {
  const base = { sig, askDiv, valueDiv: stats.median, samples: stats.samples, minDiv: stats.min, p25Div: stats.p25 };
  if (stats.samples < config.snipe.minSamples || stats.median == null) {
    return { ...base, discountPct: null, isSnipe: false, reason: `thin data (${stats.samples}/${config.snipe.minSamples} samples)` };
  }
  const discountPct = (1 - askDiv / stats.median) * 100;
  const isSnipe = askDiv <= stats.median * (1 - config.snipe.discountPct / 100);
  return {
    ...base,
    discountPct,
    isSnipe,
    reason: isSnipe
      ? `${discountPct.toFixed(0)}% below median (${stats.samples} samples)`
      : `only ${discountPct.toFixed(0)}% below median (need ≥${config.snipe.discountPct}%)`,
  };
}
