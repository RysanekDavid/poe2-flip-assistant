/*
 * Immutable edits of a pool-tab selection. Kept tidy on purpose: a mod set back to Ignore or away
 * from Want drops its thresholds, so share links and presets carry only what the string uses.
 */
import type { PresetParams } from "../../../lib/tools/regexContract";
import { parseThresholdKey, type ModState, type PoolTabSelection, type ValueRange, type VendorSelection } from "../../../lib/tools/regexPoolContract";

export type ModChoice = ModState | "ignore";

export const isPoolSelection = (p: PresetParams): p is PoolTabSelection => p.tab !== "price" && p.tab !== "vendor";

/** A vendor selection that filters nothing. */
export function emptyVendorSelection(): VendorSelection {
  return {
    tab: "vendor",
    match: "any",
    quality: null,
    movementSpeed: null,
    resistances: { fire: null, cold: null, lightning: null, chaos: null },
    plusSkills: null,
    sockets: null,
    classes: [],
    itemLevel: null,
    requiredLevel: null,
    rarity: [],
  };
}

/** Min/max inputs → a range, or null when both are empty (max below min is lifted to min). */
export function toRange(min: number | null, max: number | null): ValueRange | null {
  if (min === null && max === null) return null;
  const lo = min ?? 0;
  return { min: lo, max: max === null ? null : Math.max(lo, max) };
}

export function setModState<S extends PoolTabSelection>(sel: S, modId: string, choice: ModChoice): S {
  const mods = { ...sel.mods };
  if (choice === "ignore") delete mods[modId];
  else mods[modId] = choice;
  const thresholds = choice === "want"
    ? sel.thresholds
    : Object.fromEntries(Object.entries(sel.thresholds).filter(([k]) => parseThresholdKey(k).modId !== modId));
  return { ...sel, mods, thresholds };
}

export function setThreshold<S extends PoolTabSelection>(sel: S, key: string, range: ValueRange | null): S {
  const thresholds = { ...sel.thresholds };
  if (range === null) delete thresholds[key];
  else thresholds[key] = range;
  return { ...sel, thresholds };
}

export function setProp<S extends PoolTabSelection>(sel: S, id: string, min: number | null): S {
  const props = { ...sel.props };
  if (min === null) delete props[id];
  else props[id] = { min, max: null };
  return { ...sel, props };
}

/** Number input text → a non-negative integer, or null for empty/invalid (the field then clears). */
export function parseMin(raw: string): number | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 100_000 ? n : null;
}
