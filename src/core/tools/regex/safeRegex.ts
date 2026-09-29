/*
 * The restricted regex dialect stash-search strings use, parsed into an AST and re-serialized
 * before anything is compiled. Player-pasted strings reach this code (the emulator explains what a
 * pasted string would light up), and a raw `new RegExp(userText)` would let `(.+)+x` hang the tab
 * (ReDoS). The dialect has no construct that nests repetition: quantifiers apply to one character
 * atom only, groups cannot be quantified, and each top-level branch must fit a backtracking step
 * budget (paths × n^(unbounded+1)), so a compiled RegExp stays fast on any tooltip line.
 *
 * Accepted: literals, `\`-escaped punctuation, `\d`, `.`, `[...]` / `[^...]` with ranges, `( | )`,
 * `^` `$`, and `*` `+` `?` after a single character atom. Everything else (counted `{n,m}`,
 * lookarounds, backreferences, `\w`/`\b`, lazy or stacked quantifiers) throws SafeRegexError.
 */

export class SafeRegexError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(`${message} (at char ${position + 1})`);
    this.name = "SafeRegexError";
  }
}

export type RegexAtom =
  | { kind: "char"; char: string }
  | { kind: "any" }
  | { kind: "digit" }
  | { kind: "set"; negated: boolean; ranges: Array<[string, string]> }
  | { kind: "group"; alternatives: RegexSequence[] }
  | { kind: "start" }
  | { kind: "end" };

export type Quantifier = "" | "*" | "+" | "?";
export interface RegexPiece {
  atom: RegexAtom;
  quantifier: Quantifier;
}
export type RegexSequence = RegexPiece[];
export interface RegexAst {
  alternatives: RegexSequence[];
}

export const SAFE_REGEX_MAX_LENGTH = 500;
/** Longest tooltip line a compiled pattern is ever tested against (the emulator enforces it). */
export const SAFE_REGEX_LINE_CHARS = 300;
/*
 * Worst-case backtracking of one top-level branch on an n-char line ≈
 *   paths × n (start positions) × n^unbounded (splits of each `*`/`+`) × tail
 * where tail = atoms after the first unbounded repeat, re-matched at every split (min(tail, n),
 * at least 1). V8 skips most of that when the tail is a plain literal, but not when an anchor or
 * group follows it, so the model assumes the worst. Measured cold on V8 at n = 300 (≈2–3 ms per
 * 1e6): `.*` + 100 atoms + `$b` 13 ms (9e6); with 110 paths in front 1.3 s (1e9); two `.*`
 * 30–70 ms; 8 × `a?` with two `.*` 21 s. The composer's own terms peak at ~3.1e6, so 5e6 per
 * branch and 8e6 per pattern keep every accepted string under ~25 ms with room to spare.
 */
export const SAFE_REGEX_STEP_BUDGET = 5e6;
/** Top-level alternatives run one after another, so their costs add up (4 × 9e6 measured 50 ms). */
export const SAFE_REGEX_PATTERN_BUDGET = 8e6;

const QUANTIFIERS = new Set(["*", "+", "?"]);
const ESCAPABLE = /[^A-Za-z0-9]/;

class Parser {
  pos = 0;
  /** Start offset of every top-level branch, for error positions. */
  branchStarts: number[] = [];
  constructor(readonly src: string) {}

  fail(message: string, at = this.pos): never {
    throw new SafeRegexError(message, at);
  }

  peek(): string {
    return this.src.charAt(this.pos);
  }

  done(): boolean {
    return this.pos >= this.src.length;
  }

  alternation(closing: string | null): RegexSequence[] {
    const alternatives: RegexSequence[] = [];
    let start = this.pos;
    if (closing === null) this.branchStarts.push(start);
    let seq: RegexSequence = [];
    while (!this.done() && this.peek() !== closing) {
      if (this.peek() === "|") {
        if (seq.length === 0) this.fail("empty alternative before |", start);
        alternatives.push(seq);
        seq = [];
        this.pos += 1;
        start = this.pos;
        if (closing === null) this.branchStarts.push(start);
        continue;
      }
      seq.push(this.piece());
    }
    if (seq.length === 0) this.fail(alternatives.length > 0 ? "empty alternative after |" : "empty pattern", start);
    alternatives.push(seq);
    return alternatives;
  }

  piece(): RegexPiece {
    const atom = this.atom();
    const q = this.peek();
    if (!QUANTIFIERS.has(q)) return { atom, quantifier: "" };
    if (atom.kind === "group") this.fail("a quantifier on a group can nest repetition — not supported", this.pos);
    if (atom.kind === "start" || atom.kind === "end") this.fail("an anchor cannot be repeated", this.pos);
    this.pos += 1;
    if (QUANTIFIERS.has(this.peek())) this.fail("stacked or lazy quantifiers are not supported", this.pos);
    return { atom, quantifier: q as Quantifier };
  }

  atom(): RegexAtom {
    const at = this.pos;
    const c = this.peek();
    this.pos += 1;
    switch (c) {
      case ".":
        return { kind: "any" };
      case "^":
        return { kind: "start" };
      case "$":
        return { kind: "end" };
      case "\\":
        return this.escape(at);
      case "[":
        return this.set(at);
      case "(":
        return this.group(at);
      case ")":
        return this.fail("unmatched )", at);
      case "{":
      case "}":
        return this.fail("counted repetition {n,m} is not supported", at);
      default:
        if (QUANTIFIERS.has(c)) return this.fail(`${c} has nothing to repeat`, at);
        return { kind: "char", char: c };
    }
  }

  escape(at: number): RegexAtom {
    if (this.done()) this.fail("pattern ends with a lone backslash", at);
    const c = this.peek();
    this.pos += 1;
    if (c === "d") return { kind: "digit" };
    if (!ESCAPABLE.test(c)) this.fail(`\\${c} is not supported (only \\d and escaped punctuation)`, at);
    return { kind: "char", char: c };
  }

  setChar(): string {
    const c = this.peek();
    if (this.done()) this.fail("unterminated [", this.pos);
    this.pos += 1;
    if (c !== "\\") return c;
    const e = this.peek();
    if (this.done() || !ESCAPABLE.test(e)) this.fail("only escaped punctuation is allowed inside [ ]", this.pos - 1);
    this.pos += 1;
    return e;
  }

  set(at: number): RegexAtom {
    const negated = this.peek() === "^";
    if (negated) this.pos += 1;
    const ranges: Array<[string, string]> = [];
    while (this.peek() !== "]") {
      if (this.done()) this.fail("unterminated [", at);
      const from = this.setChar();
      if (this.peek() === "-" && this.src.charAt(this.pos + 1) !== "]" && this.pos + 1 < this.src.length) {
        this.pos += 1;
        const to = this.setChar();
        if (to < from) this.fail(`range ${from}-${to} is backwards`, this.pos - 1);
        ranges.push([from, to]);
      } else {
        ranges.push([from, from]);
      }
    }
    this.pos += 1;
    if (ranges.length === 0) this.fail("empty [ ]", at);
    return { kind: "set", negated, ranges };
  }

  group(at: number): RegexAtom {
    if (this.peek() === "?") this.fail("lookarounds and (?…) groups are not supported", this.pos);
    const alternatives = this.alternation(")");
    if (this.peek() !== ")") this.fail("unterminated (", at);
    this.pos += 1;
    return { kind: "group", alternatives };
  }
}

/** Parse a pattern of the dialect; throws SafeRegexError with the offending position. */
export function parseSafeRegex(source: string): RegexAst {
  if (source.length > SAFE_REGEX_MAX_LENGTH) throw new SafeRegexError(`pattern longer than ${SAFE_REGEX_MAX_LENGTH} chars`, SAFE_REGEX_MAX_LENGTH);
  const parser = new Parser(source);
  const alternatives = parser.alternation(null);
  if (!parser.done()) parser.fail("unmatched )");
  alternatives.forEach((branch, i) => checkBudget(branch, parser.branchStarts[i] ?? 0));
  const total = alternatives.reduce((sum, branch) => sum + branchSteps(branch), 0);
  if (total > SAFE_REGEX_PATTERN_BUDGET) {
    throw new SafeRegexError(`all alternatives together could backtrack ~${total.toExponential(1)} steps (limit ${SAFE_REGEX_PATTERN_BUDGET.toExponential(0)}) — split the search`, 0);
  }
  return { alternatives };
}

/*
 * Groups in sequence multiply the ways a failing match is retried: (a|a)(a|a)… or a?a?… is
 * exponential even without a quantified group. Top-level alternatives are tried one after another
 * (they add up, not multiply), so every limit applies per top-level branch.
 */
export const SAFE_REGEX_MAX_PATHS = 256;

/** `*` / `+` in a branch, nested groups included (all their alternatives, conservatively). */
function unboundedIn(seq: RegexSequence): number {
  return seq.reduce((n, { atom, quantifier }) => {
    const own = quantifier === "*" || quantifier === "+" ? 1 : 0;
    const nested = atom.kind === "group" ? atom.alternatives.reduce((m, alt) => m + unboundedIn(alt), 0) : 0;
    return n + own + nested;
  }, 0);
}

/** Atoms a match attempt walks once: a group counts as its longest alternative. */
function atomCount(seq: RegexSequence): number {
  return seq.reduce((n, { atom }) => n + (atom.kind === "group" ? Math.max(...atom.alternatives.map(atomCount)) : 1), 0);
}

/** Atoms after the first unbounded repeat (inside a group, the rest of that group counts too). */
function tailAfterUnbounded(seq: RegexSequence): number | null {
  for (let i = 0; i < seq.length; i++) {
    const piece = seq[i];
    if (!piece) continue;
    const rest = atomCount(seq.slice(i + 1));
    if (piece.quantifier === "*" || piece.quantifier === "+") return rest;
    if (piece.atom.kind === "group") {
      const inner = piece.atom.alternatives.map(tailAfterUnbounded).filter((t): t is number => t !== null);
      if (inner.length > 0) return Math.max(...inner) + rest;
    }
  }
  return null;
}

/** The step model above for one top-level branch (exported for tests and tuning). */
export function branchSteps(branch: RegexSequence, paths = sequencePaths(branch)): number {
  const n = SAFE_REGEX_LINE_CHARS;
  const tail = Math.max(1, Math.min(tailAfterUnbounded(branch) ?? 0, n));
  return paths * n * n ** unboundedIn(branch) * tail;
}

function checkBudget(branch: RegexSequence, at: number): void {
  const paths = sequencePaths(branch);
  if (paths > SAFE_REGEX_MAX_PATHS) {
    throw new SafeRegexError(`${paths} alternative combinations in one branch (limit ${SAFE_REGEX_MAX_PATHS}) — backtracking would explode`, at);
  }
  const steps = branchSteps(branch, paths);
  if (steps > SAFE_REGEX_STEP_BUDGET) {
    throw new SafeRegexError(
      `branch with ${unboundedIn(branch)} unbounded repeat(s) (* or +) and ${paths} paths could backtrack ~${steps.toExponential(1)} steps (limit ${SAFE_REGEX_STEP_BUDGET.toExponential(0)}) — use at most one .* per alternative and keep what follows it short`,
      at,
    );
  }
}

function sequencePaths(seq: RegexSequence): number {
  let paths = 1;
  for (const { atom, quantifier } of seq) {
    if (atom.kind === "group") paths *= atom.alternatives.reduce((sum, alt) => sum + sequencePaths(alt), 0);
    if (quantifier === "?") paths *= 2;
    if (paths > SAFE_REGEX_MAX_PATHS) return paths;
  }
  return paths;
}

const escapeChar = (c: string): string => (/[\\^$.*+?()[\]{}|/-]/.test(c) ? `\\${c}` : c);

function serializeAtom(atom: RegexAtom): string {
  switch (atom.kind) {
    case "char":
      return escapeChar(atom.char);
    case "any":
      return ".";
    case "digit":
      return "[0-9]";
    case "start":
      return "^";
    case "end":
      return "$";
    case "set": {
      const body = atom.ranges.map(([a, b]) => (a === b ? escapeChar(a) : `${escapeChar(a)}-${escapeChar(b)}`)).join("");
      return `[${atom.negated ? "^" : ""}${body}]`;
    }
    case "group":
      return `(?:${serializeAlternatives(atom.alternatives)})`;
  }
}

function serializeAlternatives(alternatives: readonly RegexSequence[]): string {
  return alternatives.map((seq) => seq.map((p) => `${serializeAtom(p.atom)}${p.quantifier}`).join("")).join("|");
}

/** JS RegExp source rebuilt from the AST — never the player's raw text. */
export function serializeSafeRegex(ast: RegexAst): string {
  return serializeAlternatives(ast.alternatives);
}

/** Case-insensitive RegExp for a dialect pattern, compiled from the validated AST. */
export function compileSafeRegex(source: string): RegExp {
  return new RegExp(serializeSafeRegex(parseSafeRegex(source)), "i");
}
