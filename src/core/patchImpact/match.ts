import { PATCH_TEXT_SOURCES, type PatchTextSource } from "../../lib/patchImpactContract";
import { KEYWORD_CATEGORIES } from "./keywords";

/**
 * Patch text → the items and exchange categories it names. Pure.
 *
 * Whole-name, case-insensitive: both sides are tokenized the same way and a name matches only as a
 * run of whole tokens, so "Divine Orb" never matches inside "Divine Orbital".
 * At each position the LONGEST name wins and the scan resumes after it, so "Greater Rune of
 * Alacrity" does not also report "Rune of Alacrity". The last word may be a plain plural, so
 * "Simulacrum Splinters" is the Splinter, not "Simulacrum". Some names also need capitals where
 * they appear (see Capital).
 */

/** ninja = priced in price_snapshots; the rest have no stored price history. */
export type EntryKind = "ninja" | "exchange" | "unique" | "base";

export interface CatalogEntry {
  name: string;
  kind: EntryKind;
  itemId: string | null;
  category: string | null;
  icon: string | null;
}

export interface PatchText {
  source: PatchTextSource;
  text: string;
}

export interface ItemMatch {
  entry: CatalogEntry;
  sources: PatchTextSource[];
}

export interface CategoryHit {
  category: string;
  keywords: string[];
  sources: PatchTextSource[];
}

export interface PatchMatches {
  items: ItemMatch[];
  categories: CategoryHit[];
}

/** Shorter names ("Gold", "Ring") are ordinary words in patch prose. */
export const MIN_NAME_CHARS = 5;

// When one name exists in several catalogs, keep the one that can carry a price.
const KIND_RANK: Record<EntryKind, number> = { ninja: 0, exchange: 1, unique: 2, base: 3 };

const TOKEN = /[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu;

/** Case-preserving tokens; curly apostrophes fold to ' so "Kulemak’s" matches "Kulemak's". */
function rawTokens(text: string): string[] {
  return text.replace(/[‘’ʼ]/g, "'").match(TOKEN) ?? [];
}

export function tokenize(text: string): string[] {
  return rawTokens(text).map((t) => t.toLowerCase());
}

interface Tokens {
  lower: string[];
  raw: string[];
}

function tokensOf(text: string): Tokens {
  const raw = rawTokens(text);
  return { raw, lower: raw.map((t) => t.toLowerCase()) };
}

/**
 * Where a phrase must be capitalized in the source text:
 * - "first": one-word names. Uniques such as "Incomplete", "Opportunity" or "Redemption" are
 *   everyday words in patch prose.
 * - "words": item bases — "gold ring" or "heavy belt" is prose, "Heavy Belt" is the base.
 * - "none": other multi-word names are distinctive enough to match in any case.
 */
type Capital = "none" | "first" | "words";

interface Phrase<T> {
  tokens: string[];
  capital: Capital;
  payload: T;
}

/** First token → phrases. */
function buildIndex<T>(phrases: Array<Phrase<T>>): Map<string, Array<Phrase<T>>> {
  const index = new Map<string, Array<Phrase<T>>>();
  for (const phrase of phrases) {
    const head = phrase.tokens[0];
    if (head === undefined) continue;
    const bucket = index.get(head) ?? [];
    bucket.push(phrase);
    index.set(head, bucket);
  }
  return index;
}

export const SMALL_WORDS: ReadonlySet<string> = new Set(["of", "the", "and", "a", "an", "in", "on", "to", "for"]);
const startsUpper = (token: string | undefined): boolean => token !== undefined && token[0] !== token[0]?.toLowerCase();

function capitalOk(raw: readonly string[], at: number, phrase: Phrase<unknown>): boolean {
  if (phrase.capital === "none") return true;
  if (phrase.capital === "first") return startsUpper(raw[at]);
  return phrase.tokens.every((token, i) => SMALL_WORDS.has(token) || startsUpper(raw[at + i]));
}

/** The last word may be a plain plural: "Orbs", "Logbooks", "Boxes" (es only after s/x/ch/sh). */
function lastWordMatches(word: string | undefined, token: string): boolean {
  if (word === token || word === `${token}s`) return true;
  return /(?:s|x|ch|sh)$/.test(token) && word === `${token}es`;
}

function matchesAt<T>(text: Tokens, at: number, phrase: Phrase<T>): boolean {
  const last = phrase.tokens.length - 1;
  if (at + last >= text.lower.length) return false;
  if (!phrase.tokens.every((token, i) => (i === last ? lastWordMatches(text.lower[at + i], token) : text.lower[at + i] === token))) return false;
  return capitalOk(text.raw, at, phrase);
}

/** Buckets a word can open: itself, plus its singular stems for one-word phrases ("omens" → "omen"). */
function candidates<T>(index: Map<string, Array<Phrase<T>>>, word: string): ReadonlyArray<Phrase<T>> {
  const exact = index.get(word);
  if (!word.endsWith("s")) return exact ?? [];
  const stems = [exact, index.get(word.slice(0, -1)), word.endsWith("es") ? index.get(word.slice(0, -2)) : undefined];
  return stems.flatMap((bucket) => bucket ?? []);
}

/** At each position the longest matching phrase wins and the scan resumes after it. */
function scan<T>(text: Tokens, index: Map<string, Array<Phrase<T>>>, onHit: (payload: T) => void): void {
  let i = 0;
  while (i < text.lower.length) {
    let hit: Phrase<T> | null = null;
    for (const p of candidates(index, text.lower[i] ?? "")) {
      if ((hit === null || p.tokens.length > hit.tokens.length) && matchesAt(text, i, p)) hit = p;
    }
    if (hit) {
      onHit(hit.payload);
      i += hit.tokens.length;
    } else {
      i += 1;
    }
  }
}

/** One entry per lowercased name (best kind wins); names under MIN_NAME_CHARS are dropped. */
export function dedupeCatalog(entries: readonly CatalogEntry[]): CatalogEntry[] {
  const byKey = new Map<string, CatalogEntry>();
  for (const entry of entries) {
    const name = entry.name.trim();
    if (name.length < MIN_NAME_CHARS) continue;
    const key = tokenize(name).join(" ");
    if (key === "") continue;
    const current = byKey.get(key);
    if (!current || KIND_RANK[entry.kind] < KIND_RANK[current.kind]) byKey.set(key, { ...entry, name });
  }
  return [...byKey.values()];
}

const orderSources = (set: ReadonlySet<PatchTextSource>): PatchTextSource[] => PATCH_TEXT_SOURCES.filter((s) => set.has(s));

function addSource<K>(map: Map<K, Set<PatchTextSource>>, key: K, source: PatchTextSource): void {
  const set = map.get(key) ?? new Set<PatchTextSource>();
  set.add(source);
  map.set(key, set);
}

function matchKeywords(texts: ReadonlyArray<{ source: PatchTextSource; tokens: Tokens }>): CategoryHit[] {
  const index = buildIndex(KEYWORD_CATEGORIES.map((k) => ({ tokens: tokenize(k.keyword), capital: "none" as const, payload: k })));
  const sources = new Map<string, Set<PatchTextSource>>();
  const keywords = new Map<string, Set<string>>();
  for (const text of texts) {
    scan(text.tokens, index, (k) => {
      addSource(sources, k.category, text.source);
      keywords.set(k.category, (keywords.get(k.category) ?? new Set<string>()).add(k.keyword));
    });
  }
  return [...sources.entries()]
    .map(([category, set]) => ({ category, keywords: [...(keywords.get(category) ?? [])].sort(), sources: orderSources(set) }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/** Every catalog name and category keyword the patch texts mention, with where each was seen. */
export function mapPatchItems(texts: readonly PatchText[], catalog: readonly CatalogEntry[]): PatchMatches {
  const entries = dedupeCatalog(catalog);
  const index = buildIndex(entries.map((entry) => {
    const tokens = tokenize(entry.name);
    const capital: Capital = tokens.length === 1 ? "first" : entry.kind === "base" ? "words" : "none";
    return { tokens, capital, payload: entry };
  }));
  const tokenized = texts.map((t) => ({ source: t.source, tokens: tokensOf(t.text) }));
  const sources = new Map<CatalogEntry, Set<PatchTextSource>>();
  for (const text of tokenized) scan(text.tokens, index, (entry) => addSource(sources, entry, text.source));
  const items = [...sources.entries()]
    .map(([entry, set]) => ({ entry, sources: orderSources(set) }))
    .sort((a, b) => a.entry.name.localeCompare(b.entry.name));
  return { items, categories: matchKeywords(tokenized) };
}
