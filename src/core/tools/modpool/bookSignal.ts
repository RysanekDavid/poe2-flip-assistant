import { placeholder } from "../../itemParser";
import { referenceValue, type ReferenceValue } from "../../priceBook";
import { applyPseudos, isPseudoSource } from "../../pseudoRules";
import { resolveLine, type StatIndex } from "../../statResolver";
import type { BookSignalView } from "../../../lib/tools/modPoolContract";

/**
 * Catalog tier text → trade stat → price-book signal, at zero trade2 budget. The book holds asks
 * for whole items keyed by rollSignature (base + stat refs + roll buckets), so a family's signal is
 * "asks for items on this base whose signature carries this stat" — never the mod's own price.
 */

/** "(41-45)" or "(-10--5)": a catalog roll range; a bare number is a fixed roll. */
const RANGE_OR_NUMBER = /\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)|-?\d+(?:\.\d+)?/g;

export interface TierTemplate {
  /** The first line exactly as the catalog words it: "+(41-45)% to Fire Resistance". */
  line: string;
  lines: number;
  /** Hybrid tier: only its first line is resolved and searched. */
  partial: boolean;
  /** The line with every roll replaced by "#", the key the stat resolver matches. */
  placeholdered: string;
  /** Lowest roll on the line — the average for "Adds # to #", as the resolver reads rolls; null = no roll. */
  minRoll: number | null;
}

/** The tier's first line as a stat template plus its lowest roll. Pure. */
export function tierTemplate(text: string): TierTemplate {
  const all = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const line = all[0] ?? text.trim();
  const mins: number[] = [];
  // "reduced" tiers are written high-to-low, "(60-56)%": the lower bound is whichever end is smaller
  const hashed = line.replace(RANGE_OR_NUMBER, (whole: string, a: string | undefined, b: string | undefined) => {
    mins.push(a != null && b != null ? Math.min(Number(a), Number(b)) : Number(whole));
    return "#";
  });
  const minRoll = mins.length === 0 ? null : Math.round((mins.reduce((a, b) => a + b, 0) / mins.length) * 100) / 100;
  return { line, lines: Math.max(all.length, 1), partial: all.length > 1, placeholdered: placeholder(hashed), minRoll };
}

export interface ResolvedTier {
  statId: string;
  /** The ref the book's signatures carry for this stat, or null when it is never signed alone. */
  bookRef: string | null;
  viaPseudo: boolean;
}

/**
 * Resolve a tier's first line against the trade stat catalog. A pseudo SOURCE (single resistance,
 * life, an attribute) never appears in a signature on its own — comparable plans keep only the
 * pseudo total — so the book is read under that total instead, and the row says so.
 */
export function resolveTier(t: TierTemplate, idx: StatIndex): ResolvedTier | null {
  const stat = resolveLine({ raw: t.line, placeholdered: t.placeholdered, numbers: [], marker: "explicit" }, idx);
  if (!stat) return null;
  if (!isPseudoSource(stat.ref)) return { statId: stat.id, bookRef: stat.ref, viaPseudo: false };
  // value 1: applyPseudos only forms a total from a positive roll; the roll itself is irrelevant here
  const pseudo = applyPseudos([{ ...stat, value: 1 }], idx)[0];
  return { statId: stat.id, bookRef: pseudo?.ref ?? null, viaPseudo: pseudo != null };
}

/** Book prices under a ref on the chosen base; `null` = every modded observation of the base. */
export type ObsLookup = (ref: string | null) => number[];

/** Trimmed-median book signal for one stat, with its uplift over the base-wide median. Pure. */
export function bookSignal(prices: number[], baseline: ReferenceValue, viaPseudo: boolean): BookSignalView {
  const ref = referenceValue(prices);
  const upliftPct =
    ref.valueDiv != null && baseline.valueDiv != null ? Math.round((ref.valueDiv / baseline.valueDiv - 1) * 1000) / 10 : null;
  return { valueDiv: ref.valueDiv, minDiv: ref.minDiv, samples: ref.samples, upliftPct, viaPseudo };
}
