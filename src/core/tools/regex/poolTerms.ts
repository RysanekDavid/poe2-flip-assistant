/*
 * Selection → search terms for one pool tab, at one rung of the length ladder. A term is what one
 * space-separated (or quoted) piece of the search string holds: an alternation of tokens, possibly
 * negated. Selection problems (unknown ids, unusable thresholds) are collected as notes here and
 * surface as warnings — never dropped silently.
 */
import { parseThresholdKey, type PoolTabSelection, type ValueRange } from "../../../lib/tools/regexPoolContract";
import { modKey, type PoolNamespace } from "./poolNamespace";
import type { PoolHeader } from "./pools/headers";
import type { PoolMod, RegexPool } from "./pools/schema";
import { slotCount } from "./pools/template";
import {
  baseTypeTokens,
  corruptedToken,
  modToken,
  propertyToken,
  rarityTokens,
  thresholdToken,
  tierToken,
  type PoolToken,
} from "./poolTokens";

export interface Rung {
  anchors: boolean;
  round10: boolean;
}

/** Shortest-first: plain literals, then line anchors, then thresholds widened to tens. */
export const LADDER: readonly Rung[] = [
  { anchors: false, round10: false },
  { anchors: true, round10: false },
  { anchors: true, round10: true },
];

export interface Term {
  tokens: PoolToken[];
  negated: boolean;
  /** Wanted mod ids this term stands for (empty for filters). */
  modIds: string[];
}

export interface ComposeContext {
  pool: RegexPool;
  headers: readonly PoolHeader[];
  ns: PoolNamespace;
  selection: PoolTabSelection;
  wants: PoolMod[];
  avoids: PoolMod[];
  /** Threshold keys usable per wanted mod id, already validated. */
  thresholds: Map<string, Array<{ line: number; slot: number; range: ValueRange }>>;
  notes: { unknown: string[]; ignored: string[] };
}

function validThreshold(ctx: ComposeContext, key: string, wanted: ReadonlySet<string>): { modId: string; line: number; slot: number } | null {
  const { modId, line, slot } = parseThresholdKey(key);
  if (!wanted.has(modId)) return null; // thresholds only apply to wanted mods; leftovers are UI state
  const mod = ctx.pool.mods.find((m) => m.id === modId);
  const target = mod?.lines[line];
  if (!target || slot >= target.numeric.count) {
    ctx.notes.ignored.push(`${key}: no such number on the mod`);
    return null;
  }
  if (target.numeric.decimals > 0) {
    ctx.notes.ignored.push(`${key}: "${target.template}" has decimal values, which a digit range cannot express`);
    return null;
  }
  return { modId, line, slot };
}

/** Wanted/avoided mods in pool order, validated thresholds, notes for ids the pool lacks. */
export function resolveContext(pool: RegexPool, headers: readonly PoolHeader[], ns: PoolNamespace, selection: PoolTabSelection): ComposeContext {
  if (selection.tab !== pool.tab) throw new Error(`selection is for ${selection.tab}, pool is ${pool.tab}`);
  const ctx: ComposeContext = { pool, headers, ns, selection, wants: [], avoids: [], thresholds: new Map(), notes: { unknown: [], ignored: [] } };
  const known = new Set(pool.mods.map((m) => m.id));
  ctx.notes.unknown = Object.keys(selection.mods).filter((id) => !known.has(id)).sort();
  ctx.wants = pool.mods.filter((m) => selection.mods[m.id] === "want");
  ctx.avoids = pool.mods.filter((m) => selection.mods[m.id] === "avoid");
  const wanted = new Set(ctx.wants.map((m) => m.id));
  for (const [key, range] of Object.entries(selection.thresholds).sort(([a], [b]) => a.localeCompare(b))) {
    const t = validThreshold(ctx, key, wanted);
    if (!t) continue;
    ctx.thresholds.set(t.modId, [...(ctx.thresholds.get(t.modId) ?? []), { line: t.line, slot: t.slot, range }]);
  }
  return ctx;
}

function header(ctx: ComposeContext, id: string): PoolHeader | null {
  return ctx.headers.find((h) => h.id === id) ?? null;
}

function propertyTerms(ctx: ComposeContext, rung: Rung, collectNotes: boolean): Term[] {
  const terms: Term[] = [];
  for (const [id, range] of Object.entries(ctx.selection.props).sort(([a], [b]) => a.localeCompare(b))) {
    const h = header(ctx, id);
    if (!h || h.kind !== "property" || slotCount(h.template) !== 1) {
      if (collectNotes) ctx.notes.ignored.push(`property ${id}: not a numeric ${ctx.pool.tab} header`);
      continue;
    }
    terms.push({ tokens: [propertyToken(ctx.ns, h, range, rung.round10)], negated: false, modIds: [] });
  }
  return terms;
}

function stateTerms(ctx: ComposeContext): Term[] {
  const { selection, ns, pool } = ctx;
  const terms: Term[] = [];
  if (selection.tab === "waystone" && selection.tier) {
    const h = header(ctx, "tier");
    if (!h) throw new Error("waystone headers lack the tier line");
    terms.push({ tokens: [tierToken(ns, pool, h, selection.tier)], negated: false, modIds: [] });
  }
  if (selection.rarity.length > 0 && selection.rarity.length < 4) {
    terms.push({ tokens: rarityTokens(ns, selection.rarity), negated: false, modIds: [] });
  }
  if (selection.corrupted !== "any") {
    terms.push({ tokens: corruptedToken(ns), negated: selection.corrupted === "exclude", modIds: [] });
  }
  if (selection.tab === "tablet" && selection.types.length > 0) {
    const bases = pool.bases.filter((b) => (pool.baseBands[b] ?? []).some((t) => (selection.types as readonly string[]).includes(t)));
    if (bases.length > 0 && bases.length < pool.bases.length) terms.push({ tokens: baseTypeTokens(ns, bases), negated: false, modIds: [] });
  }
  return terms;
}

function avoidTerm(ctx: ComposeContext, rung: Rung): Term | null {
  if (ctx.avoids.length === 0) return null;
  const allowed = new Set(ctx.avoids.map((m) => modKey(m.id)));
  const tokens = dedupe(ctx.avoids.map((m) => modToken(ctx.ns, m, allowed, { anchors: rung.anchors, kind: "avoid" })));
  return { tokens, negated: true, modIds: [] };
}

/** Filters every string repeats: tier, properties, rarity, corruption, tablet type, avoided mods. */
export function globalTerms(ctx: ComposeContext, rung: Rung, collectNotes: boolean): Term[] {
  const avoid = avoidTerm(ctx, rung);
  return [...stateTerms(ctx), ...propertyTerms(ctx, rung, collectNotes), ...(avoid ? [avoid] : [])];
}

function dedupe(tokens: readonly PoolToken[]): PoolToken[] {
  const byText = new Map<string, PoolToken>();
  for (const t of tokens) {
    const prev = byText.get(t.text);
    byText.set(t.text, prev ? { ...prev, covers: [...new Set([...prev.covers, ...t.covers])] } : t);
  }
  return [...byText.values()];
}

/*
 * "At least N" on a mod line: the highest roll the data allows bounds how many digits a value can
 * have, which keeps `[1-9]..` out of a 2-digit line's pattern. Doubled for headroom, because
 * "increased effect of modifiers" sources (atlas, instilling) push shown values past the tier max.
 */
function openCeiling(mod: PoolMod, line: number, slot: number, min: number): number {
  const rolled = mod.tiers.flatMap((t) => t.lines.filter((l) => l.line === line).map((l) => l.ranges[slot]?.max ?? 0));
  const top = Math.max(min, 2 * Math.max(0, ...rolled));
  return 10 ** String(Math.ceil(top)).length - 1;
}

function wantTokens(ctx: ComposeContext, mod: PoolMod, rung: Rung, allowed: ReadonlySet<string>, collectNotes: boolean): PoolToken[] {
  const ths = ctx.thresholds.get(mod.id) ?? [];
  if (ths.length === 0) return [modToken(ctx.ns, mod, allowed, { anchors: rung.anchors })];
  const usable = ctx.selection.match === "any" ? ths.slice(0, 1) : ths;
  if (collectNotes && usable.length < ths.length) {
    ctx.notes.ignored.push(`${mod.id}: "any" mode keeps one threshold per mod (an alternation cannot AND two numbers)`);
  }
  return usable.map(({ line, slot, range }) => {
    const template = mod.lines[line]?.template;
    if (template === undefined) throw new Error(`${mod.id} lost line ${line}`);
    const bounds = { min: range.min, max: range.max ?? openCeiling(mod, line, slot, range.min) };
    return thresholdToken(ctx.ns, { key: modKey(mod.id), template }, slot, bounds, { kind: "threshold", round10: rung.round10 });
  });
}

/**
 * Wanted mods as terms: "any" puts one token per mod into a single alternation (so fragments may
 * share text with other wanted mods); "all" gives each mod its own term(s) and keeps every
 * fragment exclusive to its mod, because a term satisfied by a different mod would be a lie.
 */
export function wantTerms(ctx: ComposeContext, rung: Rung, collectNotes: boolean): Term[] {
  const any = ctx.selection.match === "any";
  const allowed = any ? new Set(ctx.wants.map((m) => modKey(m.id))) : new Set<string>();
  const perMod = ctx.wants.map((mod) => ({ mod, tokens: wantTokens(ctx, mod, rung, allowed, collectNotes) }));
  if (!any) return perMod.flatMap(({ mod, tokens }) => tokens.map((t) => ({ tokens: [t], negated: false, modIds: [mod.id] })));
  return perMod.map(({ mod, tokens }) => ({ tokens, negated: false, modIds: [mod.id] }));
}
