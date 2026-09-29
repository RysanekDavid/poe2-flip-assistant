/*
 * What the in-game stash search would highlight, emulated for one item. Semantics assumed from
 * poe2.re-style tools and checked against the golden clipboard corpus (testRegexEmulator):
 *   - unquoted spaces separate AND terms, "…" keeps spaces in one term, a leading ! negates it;
 *   - a term is a case-insensitive regex tested against each tooltip line on its own, and holds
 *     when any line matches (so ^ and $ are line anchors);
 *   - "!a|b" negates the whole alternation (NOT (a OR b)).
 * Patterns go through safeRegex (validated AST, re-serialized), never `new RegExp(rawText)`.
 *
 * Defense in depth: safeRegex's step budgets bound backtracking by construction, and every input
 * is capped (search length and terms, line length and count). The UI still runs pasted/explained
 * strings in a Web Worker with a hard ~200 ms timeout and terminates it on overrun, so a gap in the
 * cost model degrades to "explanation unavailable", never a frozen tab. For that this module stays
 * worker-friendly: pure functions, no DOM or Node APIs, plain-data results (evaluateSearch).
 */
import { SearchParseError, parseSearch } from "./explain";
import { SAFE_REGEX_LINE_CHARS, SafeRegexError, compileSafeRegex } from "./safeRegex";

export interface CompiledTerm {
  raw: string;
  negated: boolean;
  regex: RegExp;
}

export interface CompiledSearch {
  source: string;
  terms: CompiledTerm[];
}

/*
 * The game box holds 250 chars; 500 leaves room for pasted guide strings (same cap as the price
 * explain route). Each term is compiled and tested per line, so their count is capped too.
 */
export const SEARCH_MAX_CHARS = 500;
export const SEARCH_MAX_TERMS = 40;

/** Throws SearchParseError (length, quoting, empty or too many terms) or SafeRegexError (pattern outside the dialect). */
export function compileSearch(search: string): CompiledSearch {
  if (search.length > SEARCH_MAX_CHARS) throw new SearchParseError(`search is longer than ${SEARCH_MAX_CHARS} chars`, SEARCH_MAX_CHARS);
  const ast = parseSearch(search);
  const extra = ast.terms[SEARCH_MAX_TERMS];
  if (extra) throw new SearchParseError(`more than ${SEARCH_MAX_TERMS} terms`, extra.position);
  const terms = ast.terms.map((t) => ({
    raw: t.raw,
    negated: t.negated,
    // the original-case pattern: lowercasing first would turn a refused \D into an accepted \d
    regex: compileSafeRegex(t.pattern),
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
export const EMULATOR_MAX_LINE_CHARS = SAFE_REGEX_LINE_CHARS;

/** A tooltip has a few dozen lines; the cost bound is per line, so the count is capped too. */
export const EMULATOR_MAX_LINES = 100;

function assertTooltip(lines: readonly string[]): void {
  if (lines.length > EMULATOR_MAX_LINES) throw new RangeError(`${lines.length} lines is not one item (limit ${EMULATOR_MAX_LINES})`);
  const long = lines.find((l) => l.length > EMULATOR_MAX_LINE_CHARS);
  if (long !== undefined) throw new RangeError(`a ${long.length}-char line is not tooltip text (limit ${EMULATOR_MAX_LINE_CHARS})`);
}

export function termMatches(term: CompiledTerm, lines: readonly string[]): boolean {
  assertTooltip(lines);
  const hit = lines.some((line) => term.regex.test(line));
  return hit !== term.negated;
}

/** True when the search highlights an item with these tooltip lines. */
export function matchesItem(search: string | CompiledSearch, lines: readonly string[]): boolean {
  const compiled = typeof search === "string" ? compileSearch(search) : search;
  return compiled.terms.every((t) => termMatches(t, lines));
}

export type SearchEvaluation =
  | { ok: true; matched: boolean; terms: Array<{ raw: string; negated: boolean; holds: boolean; hitLines: number[] }> }
  | { ok: false; error: string; position: number | null };

/**
 * Worker entry point: search text + tooltip lines in, structured-clone-safe result out. Refusals
 * (parse errors, patterns outside the dialect, oversized input) come back as `ok: false` with the
 * reason — the one place errors become data, because a worker must answer every message.
 */
export function evaluateSearch(search: string, lines: readonly string[]): SearchEvaluation {
  let compiled: CompiledSearch;
  try {
    compiled = compileSearch(search);
    assertTooltip(lines);
  } catch (error: unknown) {
    if (error instanceof SearchParseError || error instanceof SafeRegexError) return { ok: false, error: error.message, position: error.position };
    if (error instanceof RangeError) return { ok: false, error: error.message, position: null };
    throw error;
  }
  const terms = compiled.terms.map((t) => {
    const hitLines = lines.flatMap((line, i) => (t.regex.test(line) ? [i] : []));
    return { raw: t.raw, negated: t.negated, holds: (hitLines.length > 0) !== t.negated, hitLines };
  });
  return { ok: true, matched: terms.every((t) => t.holds), terms };
}
