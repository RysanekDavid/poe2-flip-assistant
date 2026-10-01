/**
 * The one rule for "a flip we recommend", shared by the Flips page's top cards and Home's flip
 * card so the two can never disagree: an edge observed on GGG's exchange (never the volume-based
 * estimate), that cleared the rank gate, in a market that is not falling — best worthScore first
 * (the table's default order).
 */
import type { Candidate } from "./discoverContract";

export type TopFlipFields = Pick<Candidate, "source" | "ranked" | "risk" | "worthScore">;

export const isRecommendedFlip = (row: TopFlipFields): boolean => row.source === "cx" && row.ranked && row.risk !== "DECLINE";

export function topFlips<T extends TopFlipFields>(rows: readonly T[], count: number): T[] {
  return rows
    .filter(isRecommendedFlip)
    .sort((a, b) => b.worthScore - a.worthScore)
    .slice(0, count);
}
