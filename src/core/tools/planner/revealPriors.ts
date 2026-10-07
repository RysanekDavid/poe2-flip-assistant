import type { PriorEntry, PriorsFile } from "../../research/craftMining/schema";
import type { Band, CatalysingPriors, RevealPriors } from "./types";

/**
 * The reveal numbers the planner reads from the curated craft-mining priors
 * (src/data/poe2/craft/priors): how many options the Well of Souls offers, and the creators' Omen of
 * Light count for a top ring prefix (an anchor the tests hold the model to, and a line the step
 * shows), plus the Omen of Catalysing Exaltation multiplier band. Every number keeps its basis as player prose. The priors are parsed and cross-checked by
 * the craft-mining loader, which throws on any defect; without them the planner uses the patch-note
 * fact (three options) and no anchor.
 */

export const OPTIONS_KEY = "reveal.options";
export const LIGHT_ANCHOR_KEY = "reveal.lightLoopAnchor.t1-attack-flat-or-rarity";

export const DEFAULT_REVEAL: RevealPriors = { options: 3, optionsBasis: "three options per reveal, game patch notes", lightAnchor: null };

export const CATALYSING_KEYS = { at20: "catalysing.multiplier@20", at40: "catalysing.multiplier@40" } as const;

/**
 * Mirrors global.json (a test holds them equal): the planner must not fall back to a different
 * number than the one the curated priors ship, only to the same one without the file.
 */
export const DEFAULT_CATALYSING: CatalysingPriors = { at20: { point: 2, low: 2, high: 5 }, at40: { point: 3, low: 3, high: 7.5 } };

const BASIS_WORDS: Record<PriorEntry["basis"], string> = {
  creator_measured: "creator-measured",
  creator_stated: "a creator's statement",
  community_model: "a community model",
  owner_test: "an in-game test",
};

const GRADE_WORDS: Partial<Record<PriorEntry["claim"]["v"], string>> = {
  vp: "confirmed by game patch notes",
  vs: "two or more sources",
  ss: "one source",
  cf: "sources disagree",
};

function basisText(e: PriorEntry): string {
  const grade = GRADE_WORDS[e.claim.v];
  return grade ? `${BASIS_WORDS[e.basis]}, ${grade}` : BASIS_WORDS[e.basis];
}

function find(files: readonly PriorsFile[], scope: PriorsFile["scope"], key: string): PriorEntry | null {
  return files.find((f) => f.scope === scope)?.entries.find((e) => e.key === key) ?? null;
}

/** The reveal priors from the parsed prior files (throws when a present entry can't be used). */
export function revealPriorsFrom(files: readonly PriorsFile[]): RevealPriors {
  const options = find(files, "global", OPTIONS_KEY);
  const anchor = find(files, "Rings", LIGHT_ANCHOR_KEY);
  if (options && (!Number.isInteger(options.value.point) || options.value.point < 1)) throw new Error(`planner priors: ${OPTIONS_KEY} must be a whole number of options, got ${options.value.point}`);
  return {
    options: options?.value.point ?? DEFAULT_REVEAL.options,
    optionsBasis: options ? `${options.value.point} options per reveal, ${basisText(options)}` : DEFAULT_REVEAL.optionsBasis,
    lightAnchor: anchor ? { point: anchor.value.point, high: anchor.value.high, basis: basisText(anchor) } : null,
  };
}

function multiplierBand(files: readonly PriorsFile[], key: string, fallback: Band): Band {
  const e = find(files, "global", key);
  if (!e) return fallback;
  const { point, low, high } = e.value;
  // a multiplier under 1 would turn the omen into a penalty; the band must hold the point
  if (!(low >= 1 && low <= point && point <= high && Number.isFinite(high))) throw new Error(`planner priors: ${key} must be a multiplier band 1 ≤ low ≤ point ≤ high, got ${low} / ${point} / ${high}`);
  return { point, low, high };
}

/** Omen of Catalysing Exaltation's multiplier band at 20% and 40% from the parsed prior files. */
export function catalysingPriorsFrom(files: readonly PriorsFile[]): CatalysingPriors {
  return {
    at20: multiplierBand(files, CATALYSING_KEYS.at20, DEFAULT_CATALYSING.at20),
    at40: multiplierBand(files, CATALYSING_KEYS.at40, DEFAULT_CATALYSING.at40),
  };
}
