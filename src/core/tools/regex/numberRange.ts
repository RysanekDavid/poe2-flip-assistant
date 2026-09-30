/*
 * Integer range → stash-search regex fragment, in the dialect poe2.re strings use: `.` as "any
 * digit", `[a-b]` digit classes, `( | )` alternation. (15, 42) → `(1[5-9]|[2-3].|4[0-2])`.
 *
 * The fragment matches the exact decimal spelling of every value in range and nothing else ONLY
 * when the caller puts a non-digit literal on both sides (`% of`, `\)`, a space): there is no
 * lookbehind, and `.` also matches non-digits, so "215%" would satisfy a bare `1[5-9]%`.
 * poolTokens adds that boundary, or (header properties, `label:.*range%`) drops the left one only
 * after testing every value 0–999 (or up to the span top) against numberRangeSpan; any other caller
 * must do one or the other.
 */

export interface NumberRangeOptions {
  /** Widen to whole tens (15–42 → 10–49) for a shorter fragment; the caller must say so. */
  round10?: boolean;
}

/** With no upper bound, values up to this many digits are covered (header sums reach 3 digits). */
const OPEN_MAX_DIGITS = 3;

function assertInteger(name: string, value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(`${name} ${value} is not an integer — decimal thresholds cannot be written as a digit range`);
  }
  if (value < 0) throw new RangeError(`${name} ${value} is negative — signs are literal text around the number`);
}

function digitClass(from: number, to: number): string {
  if (from === to) return String(from);
  if (from === 0 && to === 9) return ".";
  return `[${from}-${to}]`;
}

/** Patterns for [lo, hi] where both have the same number of digits. */
function sameLength(lo: string, hi: string): string[] {
  if (lo.length === 0) return [""];
  if (lo === hi) return [lo];
  const a = Number(lo.charAt(0));
  const b = Number(hi.charAt(0));
  const restLo = lo.slice(1);
  const restHi = hi.slice(1);
  if (a === b) return sameLength(restLo, restHi).map((p) => `${a}${p}`);
  const zeros = "0".repeat(restLo.length);
  const nines = "9".repeat(restLo.length);
  const head: string[] = [];
  const tail: string[] = [];
  let from = a;
  let to = b;
  if (restLo !== zeros) {
    head.push(...sameLength(restLo, nines).map((p) => `${a}${p}`));
    from += 1;
  }
  if (restHi !== nines) {
    tail.push(...sameLength(zeros, restHi).map((p) => `${b}${p}`));
    to -= 1;
  }
  const middle = from <= to ? [`${digitClass(from, to)}${".".repeat(restLo.length)}`] : [];
  return [...head, ...middle, ...tail];
}

function widen(min: number, max: number | null): { min: number; max: number | null } {
  return { min: Math.floor(min / 10) * 10, max: max === null ? null : Math.ceil((max + 1) / 10) * 10 - 1 };
}

/**
 * The inclusive values numberRangeRegex(min, max, options) is written for: widened by round10, and
 * an open top ends at the last value of OPEN_MAX_DIGITS digits (or of min's own length if longer).
 */
export function numberRangeSpan(min: number, max: number | null, options: NumberRangeOptions = {}): { lo: number; hi: number } {
  const range = options.round10 ? widen(min, max) : { min, max };
  return { lo: range.min, hi: range.max ?? Math.max(10 ** OPEN_MAX_DIGITS - 1, 10 ** String(range.min).length - 1) };
}

/**
 * Regex fragment for integers min..max (max null = no upper bound). Throws RangeError for
 * decimals, negatives or min > max — a threshold that cannot be expressed must not become a
 * fragment that silently matches something else.
 */
export function numberRangeRegex(min: number, max: number | null, options: NumberRangeOptions = {}): string {
  assertInteger("min", min);
  if (max !== null) assertInteger("max", max);
  if (max !== null && max < min) throw new RangeError(`min ${min} is above max ${max}`);
  const span = numberRangeSpan(min, max, options);
  const hi = span.hi;
  const patterns: string[] = [];
  for (let digits = String(span.lo).length; digits <= String(hi).length; digits++) {
    const lo = Math.max(span.lo, digits === 1 ? 0 : 10 ** (digits - 1));
    const top = Math.min(hi, 10 ** digits - 1);
    patterns.push(...sameLength(String(lo), String(top)));
  }
  return patterns.length === 1 ? (patterns[0] ?? "") : `(${patterns.join("|")})`;
}
