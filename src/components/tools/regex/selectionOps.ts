/*
 * Immutable edits of a pool-tab selection, and the number-field parsing the controls share. Kept
 * tidy on purpose: a mod set back to Ignore or away from Want drops its thresholds, so share links
 * and presets carry only what the string uses. Pure (no React) so the node tests cover it.
 */
import type { PresetParams } from "../../../lib/tools/regexContract";
import {
  WAYSTONE_TIER_MAX,
  WAYSTONE_TIER_MIN,
  parseThresholdKey,
  type ModState,
  type PoolTabSelection,
  type ValueRange,
  type VendorSelection,
  type WaystoneSelection,
} from "../../../lib/tools/regexPoolContract";

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

export function setModState<S extends PoolTabSelection>(sel: S, modId: string, choice: ModChoice): S {
  const mods = { ...sel.mods };
  if (choice === "ignore") delete mods[modId];
  else mods[modId] = choice;
  const own = (k: string): boolean => parseThresholdKey(k).modId === modId;
  // untouched thresholds keep their identity, so memoized rows of other mods do not re-render
  const thresholds = choice === "want" || !Object.keys(sel.thresholds).some(own)
    ? sel.thresholds
    : Object.fromEntries(Object.entries(sel.thresholds).filter(([k]) => !own(k)));
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

export interface Bounds {
  lo: number;
  hi: number;
}

export const VALUE_BOUNDS: Bounds = { lo: 0, hi: 100_000 };

export type ParsedNumber = { ok: true; value: number | null } | { ok: false; error: string };

/** One number field's text → a whole number within bounds, or null when empty. Never clamps. */
export function parseNumberText(raw: string, bounds: Bounds = VALUE_BOUNDS): ParsedNumber {
  const text = raw.trim();
  if (text === "") return { ok: true, value: null };
  const n = Number(text);
  if (!Number.isInteger(n) || n < bounds.lo || n > bounds.hi) return { ok: false, error: `"${text}" is not a whole number from ${bounds.lo} to ${bounds.hi}` };
  return { ok: true, value: n };
}

export type ParsedRange = { ok: true; min: number | null; max: number | null } | { ok: false; error: string };

/**
 * Min/max field texts → a range. A max below the min is an error for the player to fix — never
 * rewritten, because rewriting mid-typing made values like "15" untypeable (the "1" got clamped).
 */
export function parseRangeText(minText: string, maxText: string, bounds: Bounds = VALUE_BOUNDS): ParsedRange {
  const min = parseNumberText(minText, bounds);
  if (!min.ok) return min;
  const max = parseNumberText(maxText, bounds);
  if (!max.ok) return max;
  if (min.value !== null && max.value !== null && min.value > max.value) return { ok: false, error: "min is above max" };
  return { ok: true, min: min.value, max: max.value };
}

/** A committed min/max pair → the selection's range shape (null when both are empty). */
export function rangeOf(min: number | null, max: number | null, floor = 0): ValueRange | null {
  if (min === null && max === null) return null;
  return { min: min ?? floor, max };
}

/** Tier fields → the selection tier: an open end means "from T1" / "up to T16"; both empty = any tier. */
export function tierOf(min: number | null, max: number | null): WaystoneSelection["tier"] {
  if (min === null && max === null) return null;
  return { min: min ?? WAYSTONE_TIER_MIN, max: max ?? WAYSTONE_TIER_MAX };
}

/** Whether a pool selection sets anything at all (marks or filters) — nothing to link to trade otherwise. */
export function selectsAnything(s: PoolTabSelection): boolean {
  const tier = s.tab === "waystone" && s.tier !== null;
  const types = s.tab === "tablet" && s.types.length > 0;
  return Object.keys(s.mods).length > 0 || Object.keys(s.props).length > 0 || s.rarity.length > 0 || s.corrupted !== "any" || tier || types;
}
