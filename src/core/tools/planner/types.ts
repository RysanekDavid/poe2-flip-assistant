import type { ClaimVerdict } from "../../../lib/claim";
import type { CraftMaterial } from "../../craftMaterials";
import type { AffixSide, CatalogCombo, CraftCatalog } from "../craftmoves/catalog";
import type { SourceRef } from "./sources";

/**
 * Shared vocabulary of the craft planner (src/core/tools/planner/*). The planner works on an
 * ABSTRACT item: which slots hold a wanted mod (a target), which hold junk whose identity does not
 * matter, and three flags (fractured / crafted / desecrated). Every number it shows carries a
 * basis: exact (count-based: removals, fracture, side omens, essence writes), estimate (anything
 * that depends on which mod a random add rolls — PoE2 ships no spawn weights), unknown (bounds).
 */

export const BASES = ["exact", "estimate", "unknown"] as const;
export type Basis = (typeof BASES)[number];

/** A non-negative quantity with its band; `low <= point <= high`. */
export interface Band {
  point: number;
  low: number;
  high: number;
}

/** A probability (or rate) with the basis it rests on and the formula that produced it. */
export interface Estimate {
  point: number | null;
  low: number | null;
  high: number | null;
  basis: Basis;
  formula: string;
  inputs: Record<string, number | string>;
}

export type PlanAffixKind = "explicit" | "fractured" | "crafted" | "desecrated";
/** "any": a junk mod whose side the plan cannot know in advance (the player sees it). */
export type PlanSide = AffixSide | "any";
/** Mods that change the item's rules (Breach-essence quality, Contempt allowances); "fractured-crafted" marks a
 * crafted mod that was fractured — it still holds the one crafted slot. */
export type AffixSpecial = "breach-quality" | "contempt-prefix" | "contempt-suffix" | "fractured-crafted";

export interface PlanAffix {
  side: PlanSide;
  kind: PlanAffixKind;
  /** Index into PlanCtx.targets, or null for junk. */
  target: number | null;
  /** On a pool slot: which candidate landed (index into the slot's `alts`); null otherwise. */
  alt: number | null;
  unrevealed: boolean;
  special: AffixSpecial | null;
}

export type PlanRarity = "Normal" | "Magic" | "Rare";

export interface PlanState {
  rarity: PlanRarity;
  /** Canonically ordered (see state.ts canonical): two equal items have equal arrays. */
  affixes: readonly PlanAffix[];
  quality: number;
  /** Catalyst id the quality belongs to (catalystTags.ts), or null with quality 0. */
  catalyst: string | null;
}

export type TargetSource = "natural" | "essence" | "desecrated";
export type Faction = "amanamu" | "ulaman" | "kurgal";

/** A user target resolved against the catalog. "Natural" = it can roll from currency. */
export interface ResolvedTarget {
  idx: number;
  family: string;
  side: AffixSide;
  /** The minimum tier the user accepts; its level is the item-level gate. */
  modId: string;
  level: number;
  /** Rolled text of the minimum tier, ranges kept ("+(165-179) to maximum Mana"). */
  text: string;
  groups: readonly string[];
  tags: readonly string[];
  source: TargetSource;
  /** The finished item must carry this mod FRACTURED. */
  fractured: boolean;
  /** Essence writes that satisfy the target (tier >= minimum), from essenceOutcomes.ts. */
  essences: readonly EssenceWrite[];
  faction: Faction | null;
  /** Index of the request pool this slot fills; null for a single wanted mod. */
  group: number | null;
  /**
   * A pool slot's candidates (each a concrete mod, `idx` = this slot), likeliest first: when a random
   * add can land several, the plan assumes the first one still possible lands (the most likely
   * outcome, and it leaves the rarer candidates for later — never flatters the next step). Empty
   * for a single mod. A slot's own family/modId/groups are placeholders: read the landed candidate.
   */
  alts: readonly ResolvedTarget[];
}

/** One request pool: `need` of the slots `slots` (target indices), all sharing the candidates. */
export interface TargetGroup {
  side: AffixSide;
  need: number;
  slots: readonly number[];
}

/** The base the plan starts from (see PlanStartInput). */
export type StartChoice =
  | { kind: "clean" }
  | { kind: "bought"; carried: ReadonlyArray<{ ref: number; fractured: boolean }> | null; askDiv: number | null };

/** Read-only numbers from the curated craft-mining priors (src/data/poe2/craft/priors) the planner uses. */
export interface RevealPriors {
  /** Options the Well of Souls offers per reveal. */
  options: number;
  /** Where that number comes from, as the player reads it. */
  optionsBasis: string;
  /** Creators' Omen of Light count for a top attack flat or rarity on a ring prefix (a ceiling), or null. */
  lightAnchor: { point: number; high: number; basis: string } | null;
}

export interface EssenceWrite {
  essenceId: string;
  label: string;
  modId: string;
  /** "alloy": a Verisium alloy, written like a Perfect essence (rare, remove-then-replace). */
  tier: "greater" | "perfect" | "corrupted" | "special" | "alloy";
  source: string;
}

export interface BaseInfo {
  name: string;
  itemClass: string;
  ilvl: number;
  implicits: readonly string[];
  /** Signed "±N … Modifier allowed" implicit allowance (Dusk Ring +1 / -1, …). */
  allowance: { p: number; s: number };
  /** Catalyst quality cap (20 + "Maximum Quality" implicits) for rings/amulets, else null. */
  qualityCap: number | null;
  jewel: boolean;
  timeLost: boolean;
}

export interface QualityGoal {
  catalyst: string;
  pct: number;
}

export interface PlanCtx {
  cat: CraftCatalog;
  combo: CatalogCombo;
  base: BaseInfo;
  targets: readonly ResolvedTarget[];
  /** Live Divine price of one unit, null when unpriced (never 0). */
  priceOf: (materialId: string) => number | null;
  includeUnverified: boolean;
  quality: QualityGoal | null;
  groups: readonly TargetGroup[];
  start: StartChoice;
  reveal: RevealPriors;
}

export interface MaterialUse {
  mat: CraftMaterial;
  /** Expected quantity over the whole macro, retries included. */
  qty: Band;
}

/** Where a failed step sends the player: its own macro's first step, or the plan's first step. */
export type RetryScope = "self" | "start";

/** One instruction, written as a TARGET ("Chaos Orb until +(165-179) to maximum Mana"), never a count. */
export interface StepText {
  do: string;
  why: string;
  mats: readonly CraftMaterial[];
  check: string | null;
  pick: readonly string[];
  onFail: string | null;
  retry: RetryScope | null;
  /** Where the why comes from (sources.ts); the why itself is plain player prose. */
  sources: readonly SourceRef[];
}

/** One application of a macro method to a state: the plan graph's edge. */
export interface Move {
  methodId: string;
  /** Phase title in the generated guide. */
  title: string;
  next: PlanState;
  steps: readonly StepText[];
  uses: readonly MaterialUse[];
  /** The macro's headline odds (1 / exact for deterministic writes). */
  odds: Estimate;
  costBasis: Basis;
  /** Set when a miss can't be repaired: the plan restarts on a new base with success chance p. */
  restartP: number | null;
  ruleIds: readonly string[];
  grade: ClaimVerdict;
  /** The macro rests on a rule whose CORE is unknown: only planned with includeUnverified. */
  coreUnknown: boolean;
  /** Visible badge text when any fact under the macro is below "verified". */
  unverified: string | null;
  /** A miss's repair can remove a target the macro already landed (a steered Annulment on a side of several targets). */
  undoRisk: boolean;
  /** Set on a start that buys a base carrying wanted mods: what it carries (the plan reports it). */
  bought?: BoughtStart;
}

export interface BoughtStart {
  rarity: "Magic" | "Rare";
  carried: ReadonlyArray<{ ref: number; fractured: boolean }>;
}

/**
 * An edge whose Move is costly to build (a retry chain solved three times): the search offers it at
 * `bound` and builds it only if that bound is ever the cheapest thing left (search.ts).
 */
export interface LazyEdge {
  methodId: string;
  next: PlanState;
  /** A lower bound on rankCost(build()): ADMISSIBLE, or the search could return a dearer plan. */
  bound: number;
  /** The Move, or null where the eager method would have offered none. */
  build: () => Move | null;
  /** Optional middle step: the same edge with a tighter (still admissible) bound, or null = no Move. */
  refine?: () => LazyEdge | null;
}

export interface Method {
  id: string;
  /** Tie-break preference between equal-cost plans (lower first): stable, explainable output. */
  order: number;
  moves: (state: PlanState, ctx: PlanCtx) => Move[];
  /** The same edges as `moves`, in the same order, unbuilt (slam-fill, whittle-loop). */
  lazy?: (state: PlanState, ctx: PlanCtx) => LazyEdge[];
}
