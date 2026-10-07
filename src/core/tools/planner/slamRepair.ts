import type { AffixSide } from "../craftmoves/catalog";
import { EXALT_TIERS, mat, sideOmen } from "./methodKit";
import { rankPrice } from "./rank";
import { otherSide } from "./state";
import type { PlanCtx } from "./types";

/**
 * How a slam chain's Annulment repairs a miss. An Orb of Annulment removes a random mod (KB §1);
 * like the rest of the chain we read "random" as uniform over the removable mods.
 *
 * - plain: the other side holds no removable mod, so the Annulment can only take this side's.
 * - steered: the side's Annulment omen keeps it on this side (KB §4).
 * - unsteered: the other side holds only plain throwaways (`otherLoose` of them). A plain Annulment
 *   that takes one of them is a self-loop: an Exalted Orb puts a throwaway back there (with the
 *   other side's Exaltation omen while this side still has an open slot) and the repair is retried.
 *
 * Conditioned on not taking an other-side throwaway, the unsteered Annulment picks uniformly among
 * this side's `t` removable mods, exactly like the steered one. So the two repairs move the chain
 * the same way and differ only in what one finished repair costs on average:
 *   steered   annul + omen
 *   unsteered (N·annul + o·replant) / t,   N = t + o
 * (a geometric number of self-loops, mean o/t, each one Annulment + one re-plant). Choosing the
 * cheaper per chain node is therefore exactly the cheapest repair policy, and the search bound
 * (edgeBounds.ts) can use the same per-level price.
 */

/** What the chain needs to know about the side it fills to price a repair. */
export interface RepairScope {
  side: AffixSide;
  /** Removable mods on the other side. */
  otherLoose: number;
  /** Every one of them is a plain throwaway: taking one only costs a re-plant. */
  otherJunkOnly: boolean;
}

export type Repair = { kind: "plain" } | { kind: "steered" } | { kind: "unsteered"; replantOmen: boolean };

/** The Exalted Orb that re-plants an other-side throwaway (any mod will do: the lowest tier). */
export const REPLANT_TIER = EXALT_TIERS[0]!;

/** The materials of one re-plant: the Exalt, plus the other side's Exaltation omen when this side has an open slot. */
export function replantCost(scope: RepairScope, replantOmen: boolean): Record<string, number> {
  const cost: Record<string, number> = { [mat(REPLANT_TIER.key).id]: 1 };
  if (replantOmen) cost[mat(sideOmen(otherSide(scope.side), "Exaltation").key).id] = 1;
  return cost;
}

const priceOfCost = (ctx: PlanCtx, cost: Record<string, number>): number => Object.entries(cost).reduce((sum, [id, qty]) => sum + qty * rankPrice(ctx, id), 0);

/**
 * The repair at a chain node whose side holds `t` removable mods (the miss + landed targets +
 * starting junk) and `open` open slots, and the rank price of one finished repair.
 */
export function chooseRepair(ctx: PlanCtx, scope: RepairScope, t: number, open: number): { repair: Repair; price: number } {
  const annul = rankPrice(ctx, mat("annul").id);
  if (scope.otherLoose === 0) return { repair: { kind: "plain" }, price: annul };
  const steered = annul + rankPrice(ctx, mat(sideOmen(scope.side, "Annulment").key).id);
  if (!scope.otherJunkOnly) return { repair: { kind: "steered" }, price: steered };
  const replantOmen = open > 0;
  const o = scope.otherLoose;
  const unsteered = ((t + o) * annul + o * priceOfCost(ctx, replantCost(scope, replantOmen))) / t;
  // ties keep the omen-free repair: one material fewer to buy
  return steered < unsteered ? { repair: { kind: "steered" }, price: steered } : { repair: { kind: "unsteered", replantOmen }, price: unsteered };
}
