import { placeholder } from "../../itemParser";
import { referenceValue, type ReferenceValue } from "../../priceBook";
import { applyPseudos, isPseudoSource } from "../../pseudoRules";
import { resolveLine, type StatIndex } from "../../statResolver";
import { MIN_UPLIFT_SAMPLES, type BookSignalView } from "../../../lib/tools/modPoolContract";

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

export interface PseudoTotal {
  /** The pseudo total's ref, as signatures carry it: "#% total elemental resistance". */
  ref: string;
  /** "Σ total Elemental Resistance" — what the row shows instead of a per-family number. */
  label: string;
}

export interface ResolvedTier {
  statId: string;
  /** The ref the book records this stat under on its own; null for a pseudo source. */
  bookRef: string | null;
  /** Set for a pseudo source whose total the catalog has: the only thing the book records. */
  pseudo: PseudoTotal | null;
}

/**
 * Resolve a tier's first line against the trade stat catalog. A pseudo SOURCE (single resistance,
 * life, an attribute) never appears in a signature on its own — comparable plans keep only the
 * pseudo total, which sibling mods (and often the base implicit) feed too — so it gets NO book
 * reference of its own, only the name of the total it hides in.
 */
export function resolveTier(t: TierTemplate, idx: StatIndex): ResolvedTier | null {
  const stat = resolveLine({ raw: t.line, placeholdered: t.placeholdered, numbers: [], marker: "explicit" }, idx);
  if (!stat) return null;
  if (!isPseudoSource(stat.ref)) return { statId: stat.id, bookRef: stat.ref, pseudo: null };
  // value 1: applyPseudos only forms a total from a positive roll; the roll itself is irrelevant here
  const total = applyPseudos([{ ...stat, value: 1 }], idx)[0];
  const pseudo = total ? { ref: total.ref, label: `Σ ${total.text.replace(/[+#%]/g, "").replace(/\s+/g, " ").trim()}` } : null;
  return { statId: stat.id, bookRef: null, pseudo };
}

/** Pseudo totals the base's own implicit lines feed — on those, every recorded item carries the total. */
export function implicitPseudoRefs(implicits: readonly string[], idx: StatIndex): Set<string> {
  const refs = implicits.map((line) => resolveTier(tierTemplate(line), idx)?.pseudo?.ref);
  return new Set(refs.filter((r): r is string => r != null));
}

/** Book prices under a ref on the chosen base; `null` = every modded observation of the base. */
export type ObsLookup = (ref: string | null) => number[];

/** Trimmed-median book signal for one stat; the uplift over the base median needs MIN_UPLIFT_SAMPLES. Pure. */
export function bookSignal(prices: number[], baseline: ReferenceValue): BookSignalView {
  const ref = referenceValue(prices);
  const upliftPct =
    ref.valueDiv != null && baseline.valueDiv != null && ref.samples >= MIN_UPLIFT_SAMPLES
      ? Math.round((ref.valueDiv / baseline.valueDiv - 1) * 1000) / 10
      : null;
  return { valueDiv: ref.valueDiv, minDiv: ref.minDiv, samples: ref.samples, upliftPct };
}
