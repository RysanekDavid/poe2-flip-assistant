/*
 * Pure helpers behind the strategy cards and their drawer: ordering, the two headline drops, the
 * trend text, the status chip and the Regex-tool link. No React, so src/scripts/testStrategies.ts
 * pins every rule.
 */
import { BUDGET_TIERS, type WaystoneTotal } from "../../../core/strategies/schema";
import type { StrategyView, Trend, YieldView } from "../../../lib/strategiesContract";
import { encodeShare, SHARE_PARAM, emptyPoolSelection, type WaystoneSelection } from "../../../lib/tools/regexPoolContract";

export const STRATEGY_SORTS = ["hot", "cheap", "easy"] as const;
export type StrategySort = (typeof STRATEGY_SORTS)[number];

export const SORT_LABEL: Record<StrategySort, string> = { hot: "Hot now", cheap: "Cheapest", easy: "Easiest" };
export const SORT_HINT: Record<StrategySort, string> = {
  hot: "drops whose prices rose most this week first",
  cheap: "lowest budget first, then the hottest",
  easy: "lowest build + complexity rating first; unrated last",
};

type Sortable = Pick<StrategyView, "id" | "trend" | "budget" | "ratings">;

/** Rising first; a strategy with no priced trend sorts after every one that has a number. */
const byTrend = (a: Sortable, b: Sortable): number => (b.trend?.change7d ?? -Infinity) - (a.trend?.change7d ?? -Infinity);

/** Build + complexity; an unrated half makes the whole sum unknown, which sorts last. */
function effort(s: Sortable): number {
  const { build, complexity } = s.ratings;
  return build.value === null || complexity.value === null ? Infinity : build.value + complexity.value;
}

/** A new array in the chosen order; ties fall back to the trend, then the id, so the order is stable. */
export function sortStrategies<T extends Sortable>(strategies: readonly T[], sort: StrategySort): T[] {
  const tie = (a: T, b: T): number => byTrend(a, b) || a.id.localeCompare(b.id);
  const primary: Record<StrategySort, (a: T, b: T) => number> = {
    hot: () => 0,
    cheap: (a, b) => BUDGET_TIERS.indexOf(a.budget.tier) - BUDGET_TIERS.indexOf(b.budget.tier),
    easy: (a, b) => {
      const ea = effort(a);
      const eb = effort(b);
      return ea === eb ? 0 : ea < eb ? -1 : 1;
    },
  };
  return [...strategies].sort((a, b) => primary[sort](a, b) || tie(a, b));
}

const ROLE_ORDER: Record<YieldView["role"], number> = { primary: 0, secondary: 1, lottery: 2 };

/** The card's payout chips: main drops first, then the priciest; the rest is a "+N" count. */
export function topDrops(yields: readonly YieldView[], count = 2): { shown: YieldView[]; more: number } {
  const ranked = [...yields].sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || (b.price?.div ?? 0) - (a.price?.div ?? 0));
  return { shown: ranked.slice(0, count), more: Math.max(0, yields.length - count) };
}

/** "+12%", "−6%", "0%": a whole-percent move with a real minus sign. */
export function fmtChange(change: number): string {
  const rounded = Math.round(change);
  if (rounded === 0) return "0%";
  return rounded > 0 ? `+${rounded}%` : `−${Math.abs(rounded)}%`;
}

export type TrendTone = "up" | "down" | "flat";

/** Under ±1% reads as flat: a one-percent wobble is noise, not a signal to farm or avoid. */
export function changeTone(change: number): TrendTone {
  if (Math.abs(change) < 1) return "flat";
  return change > 0 ? "up" : "down";
}

export const trendTone = (trend: Trend | null): TrendTone => (trend ? changeTone(trend.change7d) : "flat");

/** Text colour per tone: green up, red down (red is for losses), neutral when flat. */
export const TONE_TEXT: Record<TrendTone, string> = { up: "text-good", down: "text-bad", flat: "text-neutral-400" };

/** The trend pill's hover: what the number is, what it is computed from, and what it is not. */
export function trendTip(trend: Trend | null): string {
  if (!trend) return "None of these drops has a poe.ninja price with a 7-day change yet, so there is no trend to show.";
  return (
    `How the prices of these drops moved over 7 days on poe.ninja, weighted by value and trade volume ` +
    `(${trend.counted} of ${trend.total} drops priced). A price move, not profit per hour: drop rates are unknown.`
  );
}

export interface StatusChip {
  text: string;
  tone: "draft" | "verified" | "stale";
  tip: string;
}

/** Draft until an owner review; reviewed shows the patch it was checked on; stale says recheck. */
export function statusChip(strategy: Pick<StrategyView, "status" | "patch">): StatusChip {
  const checked = `facts checked against ${strategy.patch.verified_against} on ${strategy.patch.stamped_at} (${strategy.patch.leagues.join(", ")})`;
  switch (strategy.status) {
    case "draft":
      return { text: "draft", tone: "draft", tip: `Draft: ${checked}; not yet reviewed by a player who ran it.` };
    case "reviewed":
      return { text: `${strategy.patch.verified_against} ✓`, tone: "verified", tip: `Reviewed: ${checked}.` };
    case "stale":
      return { text: "stale", tone: "stale", tip: `Stale: ${checked}; a later patch may have changed it.` };
  }
}

/** Waystone totals → the Regex tool's header properties (core/tools/regex/pools/headers.ts ids). */
const WAYSTONE_PROP: Record<WaystoneTotal, string> = {
  item_rarity: "itemRarity",
  pack_size: "packSize",
  monster_rarity: "monsterRarity",
  monster_effectiveness: "monsterEffectiveness",
  waystone_drop_chance: "waystoneDrop",
};

/**
 * A Regex › Waystone share link with the strategy's preferred totals selected. Each starts at
 * "has any" (min 1): the strategy names which totals matter, not how much, so the player sets the
 * minimums there. Null when the strategy prefers no total.
 */
export function waystoneRegexHref(prefer: readonly WaystoneTotal[]): string | null {
  if (prefer.length === 0) return null;
  const selection: WaystoneSelection = {
    ...emptyPoolSelection("waystone"),
    props: Object.fromEntries(prefer.map((total) => [WAYSTONE_PROP[total], { min: 1, max: null }])),
  };
  const params = new URLSearchParams({ tab: "regex", tool: "waystone", [SHARE_PARAM]: encodeShare(selection) });
  return `?${params.toString()}`;
}
