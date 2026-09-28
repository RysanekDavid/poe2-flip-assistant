/*
 * Parse a stash-search string and show what it would light up against our namespace.
 *
 * Grammar (as poeregex-style tools write it): unquoted spaces separate AND terms, `"…"` keeps
 * spaces inside one term, `|` separates OR alternatives, a leading `!` negates the term. A
 * malformed string throws SearchParseError with a position — a half-parsed explanation would
 * describe a search the player never typed.
 */
import { NAME_KINDS, type NameKind } from "../../../lib/tools/regexContract";
import type { NameEntry, Namespace } from "./namespace";

export class SearchParseError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(`${message} (at char ${position + 1})`);
    this.name = "SearchParseError";
  }
}

export interface SearchTerm {
  raw: string;
  negated: boolean;
  alternatives: string[];
  position: number;
}

export interface SearchAst {
  terms: SearchTerm[];
}

function readToken(text: string, start: number): { content: string; end: number } {
  let content = "";
  let i = start;
  while (i < text.length && !/\s/.test(text.charAt(i))) {
    if (text.charAt(i) === '"') {
      const close = text.indexOf('"', i + 1);
      if (close === -1) throw new SearchParseError("unterminated quote", i);
      content += text.slice(i + 1, close);
      i = close + 1;
    } else {
      content += text.charAt(i);
      i += 1;
    }
  }
  return { content, end: i };
}

function toTerm(content: string, raw: string, position: number): SearchTerm {
  if (content.length === 0) throw new SearchParseError("empty term", position);
  const negated = content.startsWith("!");
  const body = negated ? content.slice(1) : content;
  if (body.length === 0) throw new SearchParseError("! must be followed by a pattern", position);
  const alternatives = body.split("|");
  const empty = alternatives.findIndex((a) => a.length === 0);
  if (empty !== -1) throw new SearchParseError(`empty alternative #${empty + 1} around |`, position);
  return { raw, negated, alternatives: alternatives.map((a) => a.toLowerCase()), position };
}

export function parseSearch(text: string): SearchAst {
  const terms: SearchTerm[] = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text.charAt(i))) {
      i += 1;
      continue;
    }
    const { content, end } = readToken(text, i);
    terms.push(toTerm(content, text.slice(i, end), i));
    i = end;
  }
  if (terms.length === 0) throw new SearchParseError("search is empty", 0);
  return { terms };
}

type Matcher = (haystack: string) => boolean;

/*
 * Literal substring matching only. Evaluating player-supplied regex on the server would let one
 * pasted `(.+)+x` freeze the process (ReDoS); our own strings are plain text plus `\`-escapes in
 * the full-name fallback, and an escaped character stands for itself, so literal is exact for them.
 */
function compileTerm(term: SearchTerm): Matcher {
  const literals = term.alternatives.map((a) => a.replace(/\\(.)/g, "$1"));
  return (h) => literals.some((a) => h.includes(a));
}

const NAME_LIST_CAP = 30;

export interface TermExplanation {
  raw: string;
  negated: boolean;
  alternatives: string[];
  /** Names per kind (stats excluded — too many to list), capped at NAME_LIST_CAP each. */
  names: Record<Exclude<NameKind, "stat">, string[]>;
  counts: Record<NameKind, number>;
}

export interface SearchExplanation {
  terms: TermExplanation[];
  /** Priced items the whole search highlights, judged by their name line alone. */
  highlighted: string[];
  highlightedCount: number;
}

function explainTerm(term: SearchTerm, match: Matcher, ns: Namespace): TermExplanation {
  const names: TermExplanation["names"] = { exchange: [], unique: [], base: [] };
  const counts = Object.fromEntries(NAME_KINDS.map((k) => [k, 0])) as Record<NameKind, number>;
  for (const e of ns.entries) {
    if (!match(e.haystack)) continue;
    counts[e.kind] += 1;
    if (e.kind !== "stat" && names[e.kind].length < NAME_LIST_CAP) names[e.kind].push(e.name);
  }
  return { raw: term.raw, negated: term.negated, alternatives: term.alternatives, names, counts };
}

export function explainSearch(ast: SearchAst, ns: Namespace): SearchExplanation {
  const matchers = ast.terms.map(compileTerm);
  const terms = ast.terms.map((t, i) => explainTerm(t, matchers[i] ?? (() => false), ns));
  const lit = (e: NameEntry): boolean =>
    ast.terms.every((t, i) => (matchers[i]?.(e.haystack) ?? false) !== t.negated);
  const priced = ns.entries.filter((e) => e.valueDiv !== null && (e.kind === "exchange" || e.kind === "unique"));
  const hits = priced.filter(lit).sort((a, b) => (b.valueDiv ?? 0) - (a.valueDiv ?? 0));
  return { terms, highlighted: hits.slice(0, NAME_LIST_CAP).map((e) => e.name), highlightedCount: hits.length };
}
