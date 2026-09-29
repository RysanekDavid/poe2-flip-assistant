import type { Confidence } from "./schema";

// Two disagreeing samples beat no sample at all, but trail a single uncontested one.
export const CONFIDENCE_RANK: Record<Confidence, number> = { unverified: 0, conflicting: 1, "single-source": 2, confirmed: 3 };

/** Weakest label among the deciding lines; nothing deciding is nothing confirmed. */
export function weakest(confidences: readonly Confidence[]): Confidence {
  if (confidences.length === 0) return "unverified";
  return confidences.reduce<Confidence>((w, c) => (CONFIDENCE_RANK[c] < CONFIDENCE_RANK[w] ? c : w), "confirmed");
}
