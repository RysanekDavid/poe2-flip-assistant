/*
 * Search tokens for the pool tabs, each proven safe against a PoolNamespace:
 *   modToken       — shortest literal (optionally ^/$ anchored) present in EVERY tier of the mod and
 *                    in no line outside the allowed set;
 *   thresholdToken — a number range glued to literal text on both sides of the number, so it can
 *                    only read that one line's number (numberRange.ts needs those boundaries);
 *   literalTokens  — greedy fragment cover for header/base lines (rarity, corrupted, tablet type).
 * "Safe" is checked, not assumed: literal candidates through the trigram index, anchored and
 * numeric ones by testing the compiled pattern against every namespace line.
 */
import type { TokenKind } from "../../../lib/tools/regexPoolContract";
import { coverWithFragments } from "./compose";
import { escapeSearchText, unsafeMatches } from "./fragment";
import { numberRangeRegex } from "./numberRange";
import { baseKey, headerKey, modKey, normalizedSegments, type NsLine, type PoolNamespace } from "./poolNamespace";
import { rarityHeaderId, type PoolHeader, type Rarity } from "./pools/headers";
import type { PoolMod, RegexPool } from "./pools/schema";
import { segmentsOf } from "./pools/template";
import { fillSample } from "./poolSamples";
import { spanToken } from "./poolSpanTokens";
import { compileSafeRegex } from "./safeRegex";

export interface PoolToken {
  /** Pattern in the stash-search dialect, without quotes or a leading "!". */
  text: string;
  kind: TokenKind;
  /** Namespace keys the token is meant to match (mod:…, hdr:…, base:…). */
  covers: string[];
  /** Names of lines outside the allowed set it still matches — non-empty only for fallbacks. */
  collisions: string[];
  /** Uses ^ or $ (line anchors are the least-verified part of the dialect). */
  anchored: boolean;
  /** A threshold widened to whole tens to save characters. */
  rounded: boolean;
  /** Fallback text the player should check in-game before trusting. */
  verify: boolean;
  /** A limit the token applies that the selection did not ask for (e.g. an implied upper bound). */
  note?: string;
}

export interface ValueBounds {
  min: number;
  max: number | null;
}

type Anchor = "" | "^" | "$";
interface Candidate {
  core: string;
  anchor: Anchor;
  cost: number;
}

// Search-syntax characters and digits: a fragment with a digit could straddle a rolled number.
const UNUSABLE = /["!|\\^$.*+?()[\]{}0-9]/;
// Any space forces quotes around the whole term; a spaced fragment must save more than that.
const SPACE_PENALTY = 3;
const MIN_INFIX = 3; // unsafeMatches' trigram index cannot check anything shorter
const MIN_ANCHORED = 2;

const usable = (c: string): boolean => c.length > 0 && !UNUSABLE.test(c) && c.trim() === c;
const costOf = (core: string, anchor: Anchor): number => core.length + (anchor ? 1 : 0) + (core.includes(" ") ? SPACE_PENALTY : 0);
const renderCandidate = (c: Candidate): string => (c.anchor === "^" ? `^${c.core}` : c.anchor === "$" ? `${c.core}$` : c.core);

/** One tier as the search sees it: all segments, line-start texts, line-end texts. */
interface TierView {
  segs: string[];
  firsts: string[];
  lasts: string[];
}

function tierViews(mod: PoolMod): TierView[] {
  return mod.tiers.map((tier) => {
    const view: TierView = { segs: [], firsts: [], lasts: [] };
    for (const { line } of tier.lines) {
      const template = mod.lines[line]?.template;
      if (template === undefined) throw new Error(`${mod.id} tier ${tier.modId} points at missing line ${line}`);
      const segs = normalizedSegments(template);
      view.segs.push(...segs.filter((s) => s.length > 0));
      const first = segs[0] ?? "";
      const last = segs[segs.length - 1] ?? "";
      if (first.length > 0) view.firsts.push(first);
      if (last.length > 0) view.lasts.push(last);
    }
    return view;
  });
}

function pushCandidate(out: Map<string, Candidate>, core: string, anchor: Anchor): void {
  if (!usable(core)) return;
  const c = { core, anchor, cost: costOf(core, anchor) };
  out.set(renderCandidate(c), c);
}

/**
 * Every usable fragment of the tier, cheapest first. With `preferPlain` anchored candidates only
 * come after all plain ones: anchors are the least-verified syntax, so they are used when nothing
 * else separates the mod (e.g. "Monsters take" vs "Rare Monsters take") or to save length.
 */
function candidatesOf(view: TierView, preferPlain: boolean): Candidate[] {
  const out = new Map<string, Candidate>();
  for (const seg of view.segs) {
    for (let len = MIN_INFIX; len <= seg.length; len++) {
      for (let start = 0; start + len <= seg.length; start++) pushCandidate(out, seg.slice(start, start + len), "");
    }
  }
  for (const f of view.firsts) for (let len = MIN_ANCHORED; len <= f.length; len++) pushCandidate(out, f.slice(0, len), "^");
  for (const l of view.lasts) for (let len = MIN_ANCHORED; len <= l.length; len++) pushCandidate(out, l.slice(l.length - len), "$");
  const anchorRank = (a: Anchor): number => (a === "" ? 0 : 1);
  return [...out.values()].sort(
    (a, b) =>
      (preferPlain ? anchorRank(a.anchor) - anchorRank(b.anchor) : 0) ||
      a.cost - b.cost ||
      anchorRank(a.anchor) - anchorRank(b.anchor) ||
      a.core.localeCompare(b.core),
  );
}

function inView(c: Candidate, v: TierView): boolean {
  if (c.anchor === "^") return v.firsts.some((f) => f.startsWith(c.core));
  if (c.anchor === "$") return v.lasts.some((l) => l.endsWith(c.core));
  return v.segs.some((s) => s.includes(c.core));
}

function anchoredHit(c: Candidate, line: NsLine): boolean {
  if (c.anchor === "^") return (line.segments[0] ?? "").startsWith(c.core);
  return (line.segments[line.segments.length - 1] ?? "").endsWith(c.core);
}

/*
 * Lines outside the allowed set that a candidate hits. A line whose template is IDENTICAL to one of
 * the target's lines is not a collision: the search sees text, not mod ids, so an item showing that
 * exact line (e.g. a hybrid desecrated jewel mod's "#% increased Fire Damage") genuinely has it.
 * Such mods surface as `alsoMatches` instead.
 */
function hitLines(c: Candidate, ns: PoolNamespace, allowed: ReadonlySet<string>, same: ReadonlySet<string>, limit: number): NsLine[] {
  const hit = (l: NsLine): boolean =>
    !same.has(l.template) && (c.anchor === "" ? l.segments.some((s) => s.includes(c.core)) : anchoredHit(c, l));
  if (c.anchor !== "") return ns.lines.filter((l) => !allowed.has(l.owner) && hit(l)).slice(0, limit);
  const out: NsLine[] = [];
  for (const entry of unsafeMatches(c.core, ns, allowed, Number.MAX_SAFE_INTEGER)) {
    out.push(...(ns.linesByOwner.get(entry.key) ?? []).filter(hit));
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function fallbackModToken(ns: PoolNamespace, mod: PoolMod, views: readonly TierView[], allowed: ReadonlySet<string>, kind: TokenKind): PoolToken {
  const [first] = views;
  const common = (first?.segs ?? [])
    .filter((s) => s.length >= MIN_INFIX && views.every((v) => v.segs.some((x) => x.includes(s))))
    .sort((a, b) => b.length - a.length)[0];
  if (common === undefined) throw new Error(`mod ${mod.id} has no text shared by all its tiers`);
  const same = new Set(mod.lines.map((l) => l.template));
  const collisions = hitLines({ core: common, anchor: "", cost: 0 }, ns, allowed, same, 5).map((l) => l.template);
  return { text: escapeSearchText(common), kind, covers: [modKey(mod.id)], collisions, anchored: false, rounded: false, verify: true };
}

const MOD_PREFIX = modKey("");

/** Whether a (safe) candidate still lands on another pool mod's line — allowed, but worth avoiding. */
function hitsOtherMod(c: Candidate, ns: PoolNamespace, self: string): boolean {
  const isOther = (owner: string): boolean => owner !== self && owner.startsWith(MOD_PREFIX);
  if (c.anchor !== "") return ns.lines.some((l) => isOther(l.owner) && anchoredHit(c, l));
  return unsafeMatches(c.core, ns, new Set([self]), Number.MAX_SAFE_INTEGER).some((e) => isOther(e.key));
}

/*
 * A fragment that also lands on another mod (allowed in an "any" alternation, or an identical
 * line) makes `alsoMatches` noise and can mask wanted mods when used to avoid. A candidate that
 * stays on its own mod wins if it costs at most this much more; "exclusive" callers take it at
 * any cost.
 */
export const EXCLUSIVE_MARGIN = 3;

export interface ModTokenOptions {
  /** true: ^/$ fragments compete on length; false: they are a last resort. */
  anchors: boolean;
  /** Take a fragment that hits no other mod whenever one exists, whatever it costs. */
  exclusive: boolean;
  kind?: TokenKind;
}

/**
 * Shortest safe fragment for a mod. `allowedKeys` are namespace keys it may also match (other mods
 * in the same alternation); the mod itself is always allowed, headers never should be.
 */
export function modToken(ns: PoolNamespace, mod: PoolMod, allowedKeys: ReadonlySet<string>, options: ModTokenOptions): PoolToken {
  const self = modKey(mod.id);
  const allowed = new Set([...allowedKeys, self]);
  const kind = options.kind ?? "mod";
  const views = tierViews(mod);
  const [first] = views;
  if (!first) throw new Error(`mod ${mod.id} has no tiers`);
  const same = new Set(mod.lines.map((l) => l.template));
  const token = (text: string, anchored: boolean): PoolToken => ({ text, kind, covers: [self], collisions: [], anchored, rounded: false, verify: false });
  let shared: Candidate | null = null;
  for (const c of candidatesOf(first, !options.anchors)) {
    if (shared && !options.exclusive && c.cost > shared.cost + EXCLUSIVE_MARGIN) break;
    if (!views.every((v) => inView(c, v)) || hitLines(c, ns, allowed, same, 1).length > 0) continue;
    if (!hitsOtherMod(c, ns, self)) return token(renderCandidate(c), c.anchor !== "");
    shared ??= c;
  }
  if (shared) return token(renderCandidate(shared), shared.anchor !== "");
  const span = spanToken(ns, mod, allowed, same, options.exclusive ? Number.POSITIVE_INFINITY : EXCLUSIVE_MARGIN);
  if (span) return token(span.text, span.anchored);
  return fallbackModToken(ns, mod, views, allowed, kind);
}

export interface LineTarget {
  /** Namespace key of the line's owner. */
  key: string;
  template: string;
}

interface Edge {
  text: string;
  anchored: boolean;
}

function leadEdges(before: string): Edge[] {
  if (before.length === 0) return [{ text: "^", anchored: true }];
  return Array.from({ length: before.length }, (_, i) => ({ text: escapeSearchText(before.slice(before.length - i - 1)), anchored: false }));
}

function trailEdges(after: string): Edge[] {
  if (after.length === 0) return [{ text: "$", anchored: true }];
  return Array.from({ length: after.length }, (_, i) => ({ text: escapeSearchText(after.slice(0, i + 1)), anchored: false }));
}

function numericCollisions(regex: RegExp, ns: PoolNamespace, target: LineTarget, allowed: ReadonlySet<string>, sample: number): string[] {
  // the identical line on another owner is the same text on the item, not a collision (see hitLines)
  return ns.lines
    .filter((l) => l.template !== target.template && !allowed.has(l.owner))
    .filter((l) => regex.test(fillSample(l.template, sample)))
    .map((l) => l.template);
}

/**
 * `before` + range + `after` for number slot `slot` of the target line, with the shortest literal
 * edges that keep it off every other namespace line (tested with the threshold's own lowest value
 * in every slot). Both edges are mandatory: they are the digit boundaries numberRange.ts needs.
 */
export function thresholdToken(
  ns: PoolNamespace,
  target: LineTarget,
  slot: number,
  bounds: ValueBounds,
  options: { kind: TokenKind; round10: boolean; allowed?: ReadonlySet<string> },
): PoolToken {
  const segs = segmentsOf(target.template);
  const before = segs[slot];
  const after = segs[slot + 1];
  if (before === undefined || after === undefined) throw new RangeError(`"${target.template}" has no number slot ${slot}`);
  const num = numberRangeRegex(bounds.min, bounds.max, { round10: options.round10 });
  const sample = options.round10 ? Math.floor(bounds.min / 10) * 10 : bounds.min;
  const allowed = options.allowed ?? new Set<string>();
  const combos = leadEdges(before).flatMap((lead) => trailEdges(after).map((trail) => ({ lead, trail })));
  const cost = (e: { lead: Edge; trail: Edge }): number => e.lead.text.length + e.trail.text.length + (`${e.lead.text}${e.trail.text}`.includes(" ") ? SPACE_PENALTY : 0);
  combos.sort((a, b) => cost(a) - cost(b));
  let last: PoolToken | null = null;
  for (const { lead, trail } of combos) {
    const text = `${lead.text}${num}${trail.text}`;
    const collisions = numericCollisions(compileSafeRegex(text), ns, target, allowed, sample);
    const token = { text, kind: options.kind, covers: [target.key], collisions, anchored: lead.anchored || trail.anchored, rounded: options.round10, verify: collisions.length > 0 };
    if (collisions.length === 0) return token;
    if (!last || text.length > last.text.length) last = token;
  }
  if (!last) throw new Error(`no threshold candidates for "${target.template}"`);
  return last; // longest edges and still colliding: hand it back flagged for in-game checking
}

/** Greedy literal cover of header/base lines; each covered key is allowed to share a fragment. */
export function literalTokens(ns: PoolNamespace, keys: readonly string[], kind: TokenKind): PoolToken[] {
  const targets = keys.map((k) => {
    const e = ns.byKey.get(k);
    if (!e) throw new Error(`namespace has no entry ${k}`);
    return e;
  });
  return coverWithFragments(targets, ns).map((p) => ({
    text: p.fragment,
    kind,
    covers: p.covers.map((t) => t.key),
    collisions: p.collisions,
    anchored: false,
    rounded: false,
    verify: p.collisions.length > 0 || p.fragment !== p.literal,
  }));
}

export const rarityTokens = (ns: PoolNamespace, rarities: readonly Rarity[]): PoolToken[] =>
  literalTokens(ns, rarities.map((r) => headerKey(rarityHeaderId(r))), "rarity");

export const corruptedToken = (ns: PoolNamespace): PoolToken[] => literalTokens(ns, [headerKey("corrupted")], "corrupted");

/** Fragments that pick out these base types (e.g. tablet types) among all bases and lines. */
export const baseTypeTokens = (ns: PoolNamespace, baseNames: readonly string[]): PoolToken[] =>
  literalTokens(ns, baseNames.map(baseKey), "type");

/** Header property range, e.g. Item Rarity ≥ 40 → `m rarity: \+([4-9].|…)%`-style token. */
export function propertyToken(ns: PoolNamespace, header: PoolHeader, bounds: ValueBounds, round10: boolean): PoolToken {
  return thresholdToken(ns, { key: headerKey(header.id), template: header.template }, 0, bounds, { kind: "property", round10 });
}

/** Waystone tier range. The base-name lines print the same "Waystone (Tier N)" text, so they are allowed. */
export function tierToken(ns: PoolNamespace, pool: RegexPool, tierHeader: PoolHeader, bounds: ValueBounds): PoolToken {
  const allowed = new Set(pool.bases.map(baseKey));
  return thresholdToken(ns, { key: headerKey(tierHeader.id), template: tierHeader.template }, 0, bounds, { kind: "tier", round10: false, allowed });
}
