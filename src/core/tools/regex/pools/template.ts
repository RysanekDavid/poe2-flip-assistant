/*
 * Mod-line templates: "Monsters deal (5-9)% of Damage as Extra Fire" ⇄ "Monsters deal #% of Damage
 * as Extra Fire" + ranges. Shared by the offline builder (generalize), the client (segments for
 * collision checks) and the tests (fill a template with rolled numbers to fake a clipboard line).
 * Pure; no data access.
 */

/** Stands for one rolled number; a sign stays literal text around it ("+#%", "-#%"). */
export const NUMBER_SLOT = "#";

export interface NumberRange {
  min: number;
  max: number;
}

export interface GeneralizedLine {
  template: string;
  ranges: NumberRange[];
  /** Most decimal places any number on the line shows (0 for integer-only lines). */
  decimals: number;
}

// "(a-b)" as RePoE writes a roll range — either end may be the larger (e.g. "(30-20)% less") —
// or a plain fixed number. Signs outside the parentheses are display text, not part of the value.
const NUMBER = /\((\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)\)|\d+(?:\.\d+)?/g;

const decimalsOf = (raw: string): number => raw.split(".")[1]?.length ?? 0;

export function generalizeLine(text: string): GeneralizedLine {
  if (text.includes(NUMBER_SLOT)) throw new Error(`line already contains "${NUMBER_SLOT}": ${text}`);
  const ranges: NumberRange[] = [];
  let decimals = 0;
  const template = text.replace(NUMBER, (whole: string, a: string | undefined, b: string | undefined) => {
    const lo = a ?? whole;
    const hi = b ?? whole;
    decimals = Math.max(decimals, decimalsOf(lo), decimalsOf(hi));
    const x = Number(lo);
    const y = Number(hi);
    ranges.push({ min: Math.min(x, y), max: Math.max(x, y) });
    return NUMBER_SLOT;
  });
  return { template, ranges, decimals };
}

/** Lowercased text between number slots; always `slots + 1` entries (possibly empty). */
export function segmentsOf(template: string): string[] {
  return template.toLowerCase().split(NUMBER_SLOT);
}

export function slotCount(template: string): number {
  return template.split(NUMBER_SLOT).length - 1;
}

/** The line as the game prints it for these rolled values (one per slot, in order). */
export function fillTemplate(template: string, values: readonly number[]): string {
  const parts = template.split(NUMBER_SLOT);
  if (values.length !== parts.length - 1) {
    throw new RangeError(`template "${template}" has ${parts.length - 1} slots, got ${values.length} values`);
  }
  return parts.reduce((acc, part, i) => (i === 0 ? part : `${acc}${String(values[i - 1])}${part}`), "");
}
