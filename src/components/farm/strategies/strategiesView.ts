/*
 * Pure filters and labels for Farm › Strategies. The route returns every strategy; the page narrows
 * them here, so the same rules are unit-tested (src/scripts/testStrategies.ts) and shared by the
 * filter chips and the ?budget= deep link.
 */
import { BUDGET_TIERS, type BudgetTier, type Mechanic, type WaystoneTotal } from "../../../core/strategies/schema";
import type { Claim } from "../../../lib/claim";
import type { StrategyView } from "../../../lib/strategiesContract";

export const MECHANIC_LABEL: Record<Mechanic, string> = {
  breach: "Breach",
  abyss: "Abyss",
  delirium: "Delirium",
  ritual: "Ritual",
  expedition: "Expedition",
  essence: "Essence",
  strongbox: "Strongbox",
  map_boss: "Map bosses",
  corruption: "Corruption",
  anomaly: "Anomaly",
};

export const BUDGET_LABEL: Record<BudgetTier, string> = {
  league_start: "League start",
  mid: "Mid",
  high: "High",
};

export const WAYSTONE_LABEL: Record<WaystoneTotal, string> = {
  item_rarity: "Item rarity",
  pack_size: "Pack size",
  monster_rarity: "Monster rarity",
  monster_effectiveness: "Monster effectiveness",
  waystone_drop_chance: "Waystone drop chance",
};

export interface StrategyFilter {
  /** Empty = every mechanic; otherwise a strategy must touch at least one. */
  mechanics: ReadonlySet<Mechanic>;
  /** What the player can spend: keeps every tier at or below it; null = no limit. */
  budget: BudgetTier | null;
  /** Yield name search (case-, apostrophe- and whitespace-insensitive substring); "" = any. */
  yieldQuery: string;
}

export const EMPTY_FILTER: StrategyFilter = { mechanics: new Set(), budget: null, yieldQuery: "" };

const searchKey = (text: string): string => text.replace(/[‘’']/g, "").replace(/\s+/g, " ").trim().toLowerCase();

/** A ?budget= value, or null when absent or not a tier (an unknown value must not hide every card). */
export function parseBudget(raw: string | null): BudgetTier | null {
  return BUDGET_TIERS.find((tier) => tier === raw) ?? null;
}

export function affordable(tier: BudgetTier, budget: BudgetTier | null): boolean {
  return budget === null || BUDGET_TIERS.indexOf(tier) <= BUDGET_TIERS.indexOf(budget);
}

export function matchesYield(strategy: Pick<StrategyView, "yields">, query: string): boolean {
  const needle = searchKey(query);
  return needle === "" || strategy.yields.some((y) => searchKey(y.ref.name).includes(needle));
}

export function filterStrategies<T extends Pick<StrategyView, "mechanics" | "budget" | "yields">>(
  strategies: readonly T[],
  filter: StrategyFilter,
): T[] {
  return strategies.filter(
    (s) =>
      (filter.mechanics.size === 0 || s.mechanics.some((m) => filter.mechanics.has(m))) &&
      affordable(s.budget.tier, filter.budget) &&
      matchesYield(s, filter.yieldQuery),
  );
}

/** Mechanics that at least one strategy covers, in schema order — only those get a chip. */
export function presentMechanics(strategies: readonly Pick<StrategyView, "mechanics">[]): Mechanic[] {
  const seen = new Set(strategies.flatMap((s) => s.mechanics));
  return (Object.keys(MECHANIC_LABEL) as Mechanic[]).filter((m) => seen.has(m));
}

/** Distinct yield names for the typeahead, alphabetical. */
export function yieldNames(strategies: readonly Pick<StrategyView, "yields">[]): string[] {
  return [...new Set(strategies.flatMap((s) => s.yields.map((y) => y.ref.name)))].sort((a, b) => a.localeCompare(b));
}

/** A primary-graded fact shows no badge; its sources and note ride in the row's tooltip instead. */
export function showsBadge(claim: Claim): boolean {
  return claim.v !== "vp";
}

/** "checked against poe2db.tw/us/Hidden_Scars, …" plus the note, for a row tooltip. */
export function evidenceTip(claim: Claim): string {
  const hosts = claim.src.map((url) => {
    const { host, pathname } = new URL(url);
    return `${host.replace(/^www\./, "")}${pathname === "/" ? "" : pathname}`;
  });
  const checked = hosts.length > 0 ? `Checked against ${hosts.join(", ")}.` : "";
  return [checked, claim.note ?? ""].filter((part) => part !== "").join(" ");
}

/** Where the strategy was verified, when that is not the viewer's league; null when it is. */
export function leagueMismatch(leagues: readonly string[], league: string): string | null {
  return leagues.includes(league) ? null : `checked in ${leagues.join(", ")}, not in ${league}`;
}

/** How much of the basket the exchange prices; unit prices are never summed — drop rates are unknown. */
export function pricedCount(strategy: Pick<StrategyView, "yields">): { priced: number; total: number } {
  return { priced: strategy.yields.filter((y) => y.price !== null).length, total: strategy.yields.length };
}
