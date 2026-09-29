/*
 * What the in-game stash search would highlight, emulated for one item. Semantics assumed from
 * poe2.re-style tools and checked against the golden clipboard corpus (testRegexEmulator):
 *   - unquoted spaces separate AND terms, "…" keeps spaces in one term, a leading ! negates it;
 *   - a term is a case-insensitive regex tested against each tooltip line on its own, and holds
 *     when any line matches (so ^ and $ are line anchors);
 *   - "!a|b" negates the whole alternation (NOT (a OR b)).
 * Patterns go through safeRegex (validated AST, re-serialized), never `new RegExp(rawText)`.
 */
import { parseSearch } from "./explain";
import { compileSafeRegex } from "./safeRegex";

export interface CompiledTerm {
  raw: string;
  negated: boolean;
  regex: RegExp;
}

export interface CompiledSearch {
  source: string;
  terms: CompiledTerm[];
}

/** Throws SearchParseError (quoting/empty terms) or SafeRegexError (pattern outside the dialect). */
export function compileSearch(search: string): CompiledSearch {
  const ast = parseSearch(search);
  const terms = ast.terms.map((t) => ({
    raw: t.raw,
    negated: t.negated,
    // parseSearch splits on every "|", including those inside ( ); rejoining restores the pattern
    regex: compileSafeRegex(t.alternatives.join("|")),
  }));
  return { source: search, terms };
}

const SEPARATOR = /^-{4,}$/;
// Clipboard-only markers the tooltip does not print, so the search cannot see them.
const MARKER_TAG = / \((augmented|implicit|enchant|rune|added rune|crafted|fractured|desecrated|unmet)\)$/;
// Advanced copy (Ctrl+Alt+C) prints "23(20-25)%"; the tooltip shows "23%".
const ADVANCED_RANGE = /(\d+(?:\.\d+)?)\((?:-?\d+(?:\.\d+)?)-(?:-?\d+(?:\.\d+)?)\)/g;

/** Clipboard text (normal or advanced copy) → the lines the tooltip search sees. */
export function tooltipLines(clipboard: string): string[] {
  return clipboard
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !SEPARATOR.test(l) && !l.startsWith("{"))
    .map((l) => l.replace(MARKER_TAG, "").replace(ADVANCED_RANGE, "$1"));
}

/*
 * Real tooltip lines stay far below this. The dialect's backtracking bound is polynomial in line
 * length, so a pasted wall of text is refused rather than tested.
 */
export const EMULATOR_MAX_LINE_CHARS = 300;

export function termMatches(term: CompiledTerm, lines: readonly string[]): boolean {
  const long = lines.find((l) => l.length > EMULATOR_MAX_LINE_CHARS);
  if (long !== undefined) throw new RangeError(`a ${long.length}-char line is not tooltip text (limit ${EMULATOR_MAX_LINE_CHARS})`);
  const hit = lines.some((line) => term.regex.test(line));
  return hit !== term.negated;
}

/** True when the search highlights an item with these tooltip lines. */
export function matchesItem(search: string | CompiledSearch, lines: readonly string[]): boolean {
  const compiled = typeof search === "string" ? compileSearch(search) : search;
  return compiled.terms.every((t) => termMatches(t, lines));
}
