/*
 * Collision namespace for the price-aware stash regex.
 *
 * In-game stash search matches EVERY line of an item's text, not just its name, so a fragment is
 * only safe if it appears in nothing else a stash could hold: other item names, unique names, base
 * types and every mod line. poeregex-style tools shorten against names only — "rune" would then
 * also light up every "Rune of …" mod. This module owns that corpus plus a trigram index so the
 * fragment search stays fast over ~20k lines. Pure except for the per-signature memo at the end.
 */

import type { NameKind } from "../../../lib/tools/regexContract";

export interface NameEntry {
  /** Lowercased identity; for stats the template with `#` removed and whitespace collapsed. */
  key: string;
  /** Display text as the source spells it. */
  name: string;
  kind: NameKind;
  itemId?: string;
  category?: string;
  /** Per-unit Div value; null for anything we cannot price (bases, stats, unpriced uniques). */
  valueDiv: number | null;
  icon?: string | null;
  /** poe.ninja's "(Level 20)"-style suffix, which is a listing label and not text on the item. */
  qualifier?: string;
  /**
   * What an in-game search can actually see: lowercased segments joined by "\n". Stat templates
   * are split at each `#` because the real line has a number there — a fragment spanning that gap
   * can never match in-game, so it must not count as a collision either.
   */
  haystack: string;
}

export interface ExchangeInput {
  itemId: string;
  itemName: string;
  category: string;
  baseValue: number;
  icon: string | null;
}

export interface NamespaceInput {
  exchange: readonly ExchangeInput[];
  /** name(lowercased or not) → per-unit Div, from the scout valuation cache. */
  uniqueValues: ReadonlyMap<string, number>;
  /** Unique proper names from trade2 reference data (unpriced ones still collide). */
  uniqueNames: readonly string[];
  bases: readonly string[];
  statTexts: readonly string[];
}

export interface Namespace {
  entries: readonly NameEntry[];
  byKey: ReadonlyMap<string, NameEntry>;
  /** trigram → indices into `entries` whose haystack contains it (each index once). */
  trigrams: ReadonlyMap<string, readonly number[]>;
}

/*
 * Lines every stash item of these kinds carries regardless of name. Not in any API we read, so
 * listed by hand: a fragment like "stack" would otherwise look unique and highlight every stack.
 */
export const ITEM_TEXT_BOILERPLATE: readonly string[] = [
  "Stackable Currency",
  "Stack Size",
  "Item Level",
  "Requires Level",
  "Quality",
  "Corrupted",
  "Unidentified",
  "Right click this item then left click",
  "Shift click to unstack",
  "Place into an allocated Jewel Socket",
];

// poe2scout's placeholder name for unreleased/unidentified uniques — not a real item text.
const SCOUT_PLACEHOLDER = "incomplete";

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function statEntry(template: string): NameEntry | null {
  const segments = template
    .split(/#|\n/)
    .map(normalizeText)
    .filter((s) => s.length > 0);
  if (segments.length === 0) return null;
  const key = normalizeText(template.replace(/#/g, ""));
  return { key, name: template, kind: "stat", valueDiv: null, haystack: segments.join("\n") };
}

function plainEntry(name: string, kind: NameKind, extra: Partial<NameEntry> = {}): NameEntry {
  const key = normalizeText(name);
  return { key, name, kind, valueDiv: null, haystack: key, ...extra };
}

const NINJA_QUALIFIER = /\s*\([^)]*\)/g;

function exchangeEntry(x: ExchangeInput): NameEntry {
  const base = { itemId: x.itemId, category: x.category, valueDiv: x.baseValue, icon: x.icon };
  const bare = normalizeText(x.itemName.replace(NINJA_QUALIFIER, ""));
  const qualifier = x.itemName.match(NINJA_QUALIFIER)?.join("").trim();
  if (!qualifier || bare.length === 0) return plainEntry(x.itemName, "exchange", base);
  // The stash only shows the bare name, so that is what collides with (and is found by) a search.
  return plainEntry(x.itemName, "exchange", { ...base, qualifier, haystack: bare });
}

function candidateEntries(input: NamespaceInput): NameEntry[] {
  const out: NameEntry[] = [];
  for (const x of input.exchange) out.push(exchangeEntry(x));
  const priced = new Map<string, number>();
  for (const [name, div] of input.uniqueValues) priced.set(normalizeText(name), div);
  const uniqueNames = new Map<string, string>();
  for (const n of input.uniqueNames) uniqueNames.set(normalizeText(n), n);
  // item_values keys are lowercased names; trade2 supplies the display spelling when it knows it.
  for (const key of priced.keys()) if (!uniqueNames.has(key)) uniqueNames.set(key, key);
  for (const [key, name] of uniqueNames) out.push(plainEntry(name, "unique", { valueDiv: priced.get(key) ?? null }));
  for (const b of input.bases) out.push(plainEntry(b, "base"));
  for (const t of [...input.statTexts, ...ITEM_TEXT_BOILERPLATE]) {
    const e = statEntry(t);
    if (e) out.push(e);
  }
  return out;
}

/** trigram → indices of the entries whose haystack contains it (each index once per trigram). */
export function indexTrigrams(entries: readonly NameEntry[]): Map<string, number[]> {
  const index = new Map<string, number[]>();
  entries.forEach((entry, i) => {
    const seen = new Set<string>();
    for (let p = 0; p + 3 <= entry.haystack.length; p++) {
      const tri = entry.haystack.slice(p, p + 3);
      if (tri.includes("\n") || seen.has(tri)) continue;
      seen.add(tri);
      const list = index.get(tri);
      if (list) list.push(i);
      else index.set(tri, [i]);
    }
  });
  return index;
}

/**
 * Dedupes by key with the FIRST source winning — exchange, unique, base, stat — so a priced item
 * is never shadowed by an unpriced mod line of the same text.
 */
export function buildNamespace(input: NamespaceInput): Namespace {
  const byKey = new Map<string, NameEntry>();
  for (const entry of candidateEntries(input)) {
    if (entry.key.length === 0 || entry.key === SCOUT_PLACEHOLDER) continue;
    if (!byKey.has(entry.key)) byKey.set(entry.key, entry);
  }
  const entries = [...byKey.values()];
  return { entries, byKey, trigrams: indexTrigrams(entries) };
}

// One slot per league (the poller caps leagues at 4), replaced when that league's data moves.
const memo = new Map<string, { signature: string; ns: Namespace }>();

/**
 * Rebuilds only when the league's signature (ninja fetch time + uniques refresh + trade2 meta
 * load) changes: the trigram index is the expensive part and the inputs move at most hourly.
 */
export function memoNamespace(league: string, signature: string, build: () => Namespace): Namespace {
  const hit = memo.get(league);
  if (hit && hit.signature === signature) return hit.ns;
  const ns = build();
  memo.set(league, { signature, ns });
  return ns;
}
