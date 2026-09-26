/**
 * Price Book: value a rare item from observed market listings instead of a per-item live
 * search (which the trade2 rate limit can't sustain at scale). Every listing we see is
 * recorded under ONE signature scheme — `rollSignature` (base + resolved stat refs + roll
 * buckets) — by BOTH hunts and autosnipe, so the two engines feed and read the same space.
 * (They used to write two incompatible key spaces into one table.)
 */

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
 * Roll-AWARE signature: base type + sorted (stat ref + roll bucket). Encodes *how high* each
 * mod rolled, so the price-book distribution under a key is genuinely comparable items — the
 * precondition for a meaningful "this listing is far under value" call.
 */
export function rollSignature(baseType: string, stats: Array<{ ref: string; value: number }>): string {
  const parts = [...new Set(stats.map((s) => `${s.ref}#${bucketCode(s.value)}`))].sort();
  return `${baseType.toLowerCase().trim()}|${parts.join("~")}`;
}

/** How many stat tokens a signature carries. A bare "base|" (mods never resolved) is 0. */
export function signatureModCount(sig: string): number {
  const bar = sig.indexOf("|");
  const tail = bar < 0 ? "" : sig.slice(bar + 1);
  return tail === "" ? 0 : tail.split("~").length;
}

/** Listings under this fraction of the median of the rest are price-fixer bait, not market. */
const OUTLIER_FRACTION = 0.3;
/** At most this many cheap outliers are dropped — more than that and the "outliers" ARE the market. */
const MAX_OUTLIERS = 3;

export interface ReferenceValue {
  valueDiv: number | null; // trimmed median, null when nothing usable remains
  samples: number; // comparables the value stands on (after trimming)
  dropped: number; // cheap outliers removed
  minDiv: number | null; // cheapest surviving comparable
}

const medianOf = (sortedAsc: number[]): number => {
  const m = Math.floor(sortedAsc.length / 2);
  return sortedAsc.length % 2 ? sortedAsc[m]! : (sortedAsc[m - 1]! + sortedAsc[m]!) / 2;
};

/**
 * Trimmed-median reference value of a comparable set: non-positive / non-finite asks are
 * discarded, then up to MAX_OUTLIERS of the cheapest asks are dropped while each sits under
 * OUTLIER_FRACTION × median-of-the-rest. The candidate being judged must NOT be in `prices`
 * (callers exclude it) — including it let a 1-ex listing drag its own reference down.
 */
export function referenceValue(prices: number[]): ReferenceValue {
  const xs = prices.filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  let dropped = 0;
  while (dropped < MAX_OUTLIERS && xs.length > 1 && xs[0]! < OUTLIER_FRACTION * medianOf(xs.slice(1))) {
    xs.shift();
    dropped++;
  }
  if (xs.length === 0) return { valueDiv: null, samples: 0, dropped, minDiv: null };
  return { valueDiv: medianOf(xs), samples: xs.length, dropped, minDiv: xs[0]! };
}
