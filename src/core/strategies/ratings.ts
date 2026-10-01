/*
 * What each step of a strategy rating means. The scales are written down so a rating in a strategy
 * file is a reading of its sourced facts against a fixed rule, not a feeling: a fact-checker can
 * re-derive every value from the strategy's own cited pages. Plain data (no React) so the UI
 * tooltips, the data README and the node tests share one text.
 */
import { BUDGET_TIERS, RATING_MAX, RATING_MIN, type BudgetTier, type RatingKey } from "./schema";

/** Budget keeps the three curated tiers (cheapest first); the card draws them as a 3-step bar. */
export const BUDGET_SCALE: Record<BudgetTier, string> = {
  league_start: "magic tablets and plain waystones; nothing consumed beyond the map",
  mid: "waystones rolled for two or more totals, three or more tablets, or a consumed entry item (Sacred Bloom, Inscribed Ultimatum)",
  high: "unique tablets or a specific item bought for every run",
};

type Scale = Readonly<Record<1 | 2 | 3 | 4 | 5, string>>;

/** The hardest thing the character must kill or survive, as the strategy's sources describe it. */
const BUILD_SCALE: Scale = {
  1: "ordinary map packs; no required boss",
  2: "a mechanic's own waves or guards, or the ordinary Map Boss",
  3: "one documented step up: extra rares, monster modifiers, or a Powerful Map Boss",
  4: "difficulty that stacks or escalates as you push it, or a Deadly boss",
  5: "pinnacle bosses",
};

/** How much there is to set up and decide, read off the strategy's own steps. */
const COMPLEXITY_SCALE: Scale = {
  1: "atlas setup only; play the map as usual",
  2: "atlas setup and a tablet; one simple habit in the map (rush the boss, open every pit)",
  3: "a choice loop in the map (reroll, defer, pick a chain) or a step outside it (Genesis Tree, keys)",
  4: "a plan across several maps, or a second activity the first one feeds",
  5: "several of the above at once, plus a per-run purchase or a timer",
};

export const RATING_SCALE: Record<RatingKey, Scale> = { build: BUILD_SCALE, complexity: COMPLEXITY_SCALE };

export const RATING_LABEL: Record<RatingKey, string> = { build: "Build", complexity: "Complexity" };

export const RATING_STEPS = RATING_MAX - RATING_MIN + 1;
export const BUDGET_STEPS = BUDGET_TIERS.length;

/** The scale text for a rated value; throws on a value outside the schema's range (a drift). */
export function scaleText(key: RatingKey, value: number): string {
  const text = (RATING_SCALE[key] as Readonly<Record<number, string>>)[value];
  if (text === undefined) throw new Error(`no ${key} scale step ${value}`);
  return text;
}
