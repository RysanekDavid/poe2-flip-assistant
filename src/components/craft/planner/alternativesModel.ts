import type { AlternativeView, ImpracticalView, TargetChangeView } from "../../../lib/tools/craftPlannerContract";
import { IMPRACTICAL_CLICKS } from "../../../core/tools/planner/sanity";
import { genericText, targetIndex, toRequest, type PlannerInput, type Side, type SlotPick } from "./plannerModel";

/**
 * Pure helpers for the planner's cost-sanity UI: how loud an impractical step is, the words on a
 * cheaper-targets chip, and the input item a chip turns the current one into. No React.
 */

/** Past ten times the limit the banner turns red: that is not a long craft, it is a lottery. */
export const severityOf = (imp: ImpracticalView): "amber" | "red" => (imp.clicks.point >= 10 * IMPRACTICAL_CLICKS ? "red" : "amber");

export { IMPRACTICAL_CLICKS };

/** "P7+": the same side letter + tier marker the item tooltip shows. */
export const tierTag = (side: Side, k: number): string => `${side === "prefix" ? "P" : "S"}${k}+`;

/** The family as trade sites write it ("Adds # to # Lightning damage to Attacks"). */
export const familyName = (c: TargetChangeView): string => genericText(c.from.text.split("\n")[0] ?? c.from.text);

/** One change in full, for the chip's tooltip. */
export function changeText(c: TargetChangeView): string {
  return c.kind === "relax" ? `${familyName(c)}: ${tierTag(c.side, c.from.k)} → ${tierTag(c.side, c.to.k)} (${c.to.text})` : `${familyName(c)}: leave it off`;
}

/** The chip's words: short enough for one line on a phone; the tooltip lists every change. */
export function alternativeLabel(alt: AlternativeView): string {
  const [first] = alt.changes;
  if (!first) throw new Error("planner: an alternative without a change");
  if (alt.changes.length === 1) return first.kind === "relax" ? `${familyName(first)} → ${tierTag(first.side, first.to.k)}` : `without ${familyName(first)}`;
  const relax = alt.changes.filter((c): c is Extract<TargetChangeView, { kind: "relax" }> => c.kind === "relax");
  const sides = new Set(relax.map((c) => c.side));
  const tiers = new Set(relax.map((c) => c.to.k));
  const [r] = relax;
  if (r && relax.length === alt.changes.length && sides.size === 1 && tiers.size === 1) return `${relax.length} ${r.side}es → ${tierTag(r.side, r.to.k)}`;
  return `${alt.changes.length} mods a tier lower`;
}

function slotOf(input: PlannerInput, target: number): { side: Side; i: number } {
  for (const side of ["prefix", "suffix"] as const) {
    for (let i = 0; i < input.slots[side].length; i++) if (targetIndex(input.slots, side, i) === target) return { side, i };
  }
  throw new Error(`planner: no slot holds target ${target}`);
}

/** The input item with the alternative applied — exactly the targets the server costed, or it throws. */
export function withAlternative(input: PlannerInput, alt: AlternativeView): PlannerInput {
  const slots: Record<Side, (SlotPick | null)[]> = { prefix: [...input.slots.prefix], suffix: [...input.slots.suffix] };
  // every slot is found on the ORIGINAL slots first: a drop must not shift the indices of the next change
  const at = alt.changes.map((c) => ({ c, ...slotOf(input, c.target) }));
  for (const { c, side, i } of at) {
    const pick = input.slots[side][i];
    if (!pick || pick.minModId !== c.from.modId) throw new Error(`planner: slot ${side} ${i} no longer holds ${c.from.modId}`);
    slots[side][i] = c.kind === "drop" ? null : { ...pick, minModId: c.to.modId };
  }
  const next: PlannerInput = { ...input, slots };
  if (!sameTargets(toRequest(next).targets, alt.targets)) throw new Error("planner: the alternative no longer matches the item's slots");
  return next;
}

type Targets = AlternativeView["targets"];
const sameTargets = (a: Targets, b: Targets): boolean =>
  a.length === b.length && a.every((t, i) => t.family === b[i]!.family && t.side === b[i]!.side && t.minModId === b[i]!.minModId && t.fractured === b[i]!.fractured);
