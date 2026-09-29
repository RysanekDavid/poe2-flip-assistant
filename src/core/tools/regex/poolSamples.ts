/*
 * Concrete tooltip lines for regex checks: a template has "#" where the game prints a number, and
 * a pattern that spans or reads numbers can only be tested against real digits.
 */
import type { PoolMod, PoolTier } from "./pools/schema";
import { fillTemplate, slotCount } from "./pools/template";

/** The template with the same value in every number slot. */
export const fillSample = (template: string, value: number): string =>
  fillTemplate(template, Array.from({ length: slotCount(template) }, () => value));

/** Tooltip lines of one tier with every number at its range minimum or maximum. */
export function sampleLines(mod: PoolMod, tier: PoolTier, pick: "min" | "max"): string[] {
  return tier.lines.map(({ line, ranges }) => {
    const template = mod.lines[line]?.template;
    if (template === undefined) throw new Error(`${mod.id} tier ${tier.modId} points at missing line ${line}`);
    return fillTemplate(template, ranges.map((r) => r[pick]));
  });
}

const PICKS = ["min", "max"] as const;

/** Whether a compiled token hits any tier of the mod (numbers at range min or max). */
export function tokenHitsMod(regex: RegExp, mod: PoolMod): boolean {
  return mod.tiers.some((t) => PICKS.some((pick) => sampleLines(mod, t, pick).some((l) => regex.test(l))));
}

/** Whether a compiled token hits EVERY tier of the mod, at both ends of its ranges. */
export function tokenCoversMod(regex: RegExp, mod: PoolMod): boolean {
  return mod.tiers.every((t) => PICKS.every((pick) => sampleLines(mod, t, pick).some((l) => regex.test(l))));
}
