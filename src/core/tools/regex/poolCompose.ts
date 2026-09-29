/*
 * Pool tab selection → stash-search strings of at most maxChars. Pure and synchronous: the client
 * panel calls it on every (debounced) change with the lazily imported pool JSON.
 *
 * String shape: every string starts with the filter terms (tier, properties, rarity, corruption,
 * tablet type, `"!avoid|…"`), then the wanted mods — one alternation in "any" mode, one term per
 * mod in "all" mode. Too long → climb the ladder (anchored fragments, thresholds rounded to tens),
 * then split the wanted part over several strings that each repeat the filters.
 */
import type { PoolTabSelection, PoolWarning } from "../../../lib/tools/regexPoolContract";
import { renderChunk } from "./compose";
import { buildPoolNamespace, memoPoolNamespace, modKey } from "./poolNamespace";
import type { PoolHeader } from "./pools/headers";
import type { RegexPool } from "./pools/schema";
import { LADDER, globalTerms, resolveContext, wantTerms, type ComposeContext, type Term } from "./poolTerms";
import { tokenHitsMod } from "./poolSamples";
import type { PoolToken } from "./poolTokens";
import { compileSafeRegex } from "./safeRegex";
import { buildPoolWarnings } from "./poolWarnings";

export interface ComposedToken extends PoolToken {
  /** Pool mod ids (outside `covers`) whose tooltip lines this token also matches. */
  alsoMatches: string[];
}

export interface PoolChunk {
  text: string;
  chars: number;
  /** Wanted mod ids this string can highlight. */
  covers: string[];
}

export interface PoolComposeResult {
  chunks: PoolChunk[];
  tokens: ComposedToken[];
  /** Wanted mods the avoid term also matches — an item with them is hidden, not highlighted. */
  masked: string[];
  /** Wanted mods whose token cannot fit in maxChars next to the filters. */
  uncovered: string[];
  warnings: PoolWarning[];
  /** Why there is no string; null whenever chunks is non-empty. */
  reason: string | null;
}

export interface PoolComposeOptions {
  maxChars: number;
}

const renderTerm = (t: Term): string => renderChunk(t.tokens.map((x) => x.text), t.negated ? "trash" : "keep");
const joinTerms = (terms: readonly string[]): string => terms.filter((t) => t.length > 0).join(" ");

/** "any" mode: fold wanted mods an earlier literal token already hits into that token. */
function mergeAnyTerms(ctx: ComposeContext, terms: readonly Term[]): Term[] {
  const kept: Term[] = [];
  for (const term of terms) {
    const mod = ctx.wants.find((m) => m.id === term.modIds[0]);
    const host = mod && kept.find((k) => k.tokens.every((t) => t.kind === "mod") && k.tokens.some((t) => tokenHitsMod(compileSafeRegex(t.text), mod)));
    if (!host || term.tokens.some((t) => t.kind === "threshold")) {
      kept.push(term);
      continue;
    }
    host.modIds.push(term.modIds[0] ?? "");
    const first = host.tokens[0];
    if (first) host.tokens[0] = { ...first, covers: [...first.covers, ...term.tokens.flatMap((t) => t.covers)] };
  }
  return kept;
}

/** The wanted part of one string: one alternation ("any") or space-separated terms ("all"). */
function renderWanted(ctx: ComposeContext, terms: readonly Term[]): string {
  if (terms.length === 0) return "";
  if (ctx.selection.match === "all") return joinTerms(terms.map(renderTerm));
  return renderTerm({ tokens: terms.flatMap((t) => t.tokens), negated: false, modIds: [] });
}

interface Attempt {
  globals: Term[];
  wanted: Term[];
  single: string;
}

function attempt(ctx: ComposeContext, rungIndex: number): Attempt {
  const rung = LADDER[rungIndex] ?? LADDER[0];
  if (!rung) throw new Error("empty ladder");
  // selection notes do not depend on the rung; collect them once, on the rung that always runs
  const collectNotes = rungIndex === 0;
  const globals = globalTerms(ctx, rung, collectNotes);
  const raw = wantTerms(ctx, rung, collectNotes);
  const wanted = ctx.selection.match === "any" ? mergeAnyTerms(ctx, raw) : raw;
  return { globals, wanted, single: joinTerms([...globals.map(renderTerm), renderWanted(ctx, wanted)]) };
}

interface Packed {
  chunks: PoolChunk[];
  uncovered: string[];
  reason: string | null;
}

/** First-fit the wanted terms into strings that each repeat the filter prefix. */
function pack(ctx: ComposeContext, a: Attempt, maxChars: number): Packed {
  const prefix = joinTerms(a.globals.map(renderTerm));
  if (prefix.length > maxChars) {
    return { chunks: [], uncovered: [], reason: `the filters alone need ${prefix.length} chars — over the ${maxChars}-char limit` };
  }
  const render = (terms: readonly Term[]): string => joinTerms([prefix, renderWanted(ctx, terms)]);
  const bins: Term[][] = [];
  const uncovered: string[] = [];
  for (const term of a.wanted) {
    if (render([term]).length > maxChars) {
      uncovered.push(...term.modIds);
      continue;
    }
    const bin = bins.find((b) => render([...b, term]).length <= maxChars);
    if (bin) bin.push(term);
    else bins.push([term]);
  }
  if (bins.length === 0 && a.wanted.length > 0) return { chunks: [], uncovered, reason: "no wanted mod fits next to the filters" };
  const chunks = (bins.length > 0 ? bins : [[]]).map((bin) => {
    const text = render(bin);
    return { text, chars: text.length, covers: [...new Set(bin.flatMap((t) => t.modIds))] };
  });
  return { chunks, uncovered, reason: null };
}

function withAlsoMatches(pool: RegexPool, tokens: readonly PoolToken[]): ComposedToken[] {
  return tokens.map((t) => {
    const regex = compileSafeRegex(t.text);
    const alsoMatches = pool.mods.filter((m) => !t.covers.includes(modKey(m.id)) && tokenHitsMod(regex, m)).map((m) => m.id);
    return { ...t, alsoMatches };
  });
}

function maskedMods(ctx: ComposeContext, globals: readonly Term[]): string[] {
  const avoid = globals.filter((t) => t.negated && t.tokens.some((x) => x.kind === "avoid"));
  const regexes = avoid.flatMap((t) => t.tokens.map((x) => compileSafeRegex(x.text)));
  return ctx.wants.filter((m) => regexes.some((r) => tokenHitsMod(r, m))).map((m) => m.id);
}

function nothingSelected(ctx: ComposeContext): boolean {
  const s = ctx.selection;
  const tier = s.tab === "waystone" && s.tier !== null;
  const types = s.tab === "tablet" && s.types.length > 0;
  const rarity = s.rarity.length > 0 && s.rarity.length < 4;
  return ctx.wants.length === 0 && ctx.avoids.length === 0 && Object.keys(s.props).length === 0 && !tier && !types && !rarity && s.corrupted === "any";
}

/** Compose the search strings for a pool tab selection. Throws only on programmer errors. */
export function composePool(pool: RegexPool, headers: readonly PoolHeader[], selection: PoolTabSelection, options: PoolComposeOptions): PoolComposeResult {
  const ns = memoPoolNamespace(pool, () => buildPoolNamespace(pool, headers));
  const ctx = resolveContext(pool, headers, ns, selection);
  if (nothingSelected(ctx)) {
    const warnings = buildPoolWarnings({ ctx, tokens: [], chunks: [], masked: [], uncovered: [] });
    return { chunks: [], tokens: [], masked: [], uncovered: [], warnings, reason: "nothing selected — mark a mod Want/Avoid or set a filter" };
  }
  let chosen: Attempt | null = null;
  for (let i = 0; i < LADDER.length; i++) {
    chosen = attempt(ctx, i);
    if (chosen.single.length <= options.maxChars) break;
  }
  if (!chosen) throw new Error("empty ladder");
  const packed = chosen.single.length <= options.maxChars
    ? { chunks: [{ text: chosen.single, chars: chosen.single.length, covers: chosen.wanted.flatMap((t) => t.modIds) }], uncovered: [], reason: null }
    : pack(ctx, chosen, options.maxChars);
  const tokens = withAlsoMatches(pool, [...chosen.globals, ...chosen.wanted].flatMap((t) => t.tokens));
  const masked = maskedMods(ctx, chosen.globals);
  const warnings = buildPoolWarnings({ ctx, tokens, chunks: packed.chunks, masked, uncovered: packed.uncovered });
  return { chunks: packed.chunks, tokens, masked, uncovered: packed.uncovered, warnings, reason: packed.reason };
}
