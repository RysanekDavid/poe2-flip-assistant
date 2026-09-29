import { PATCH_TEXT_SOURCES, type PatchTextSource } from "../../lib/patchImpactContract";
import { KEYWORD_CATEGORIES } from "./keywords";

/**
 * Patch text → the items and exchange categories it names. Pure.
 *
 * Whole-name, case-insensitive: both sides are tokenized the same way and a name matches only as a
 * run of whole tokens, so "Divine Orb" never matches inside "Divine Orbital" and plural or
 * possessive forms ("Divine Orbs") do not count — a missed mention costs less than a wrong row.
 * At each position the LONGEST name wins and the scan resumes after it, so "Greater Rune of
 * Alacrity" does not also report "Rune of Alacrity". One-word names additionally need a capital
 * where they appear (see Phrase.capital).
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

interface Phrase<T> {
  tokens: string[];
  /**
   * One-word names must be capitalized where they appear. Uniques such as "Incomplete",
   * "Opportunity" or "Redemption" are everyday words in patch prose; multi-word names are
   * distinctive enough to match in any case.
   */
  capital: boolean;
  payload: T;
}

/** First token → phrases, longest first so the scan can stop at the first hit. */
function buildIndex<T>(phrases: Array<Phrase<T>>): Map<string, Array<Phrase<T>>> {
  const index = new Map<string, Array<Phrase<T>>>();
  for (const phrase of phrases) {
    const head = phrase.tokens[0];
    if (head === undefined) continue;
    const bucket = index.get(head) ?? [];
    bucket.push(phrase);
    index.set(head, bucket);
  }
  for (const bucket of index.values()) bucket.sort((a, b) => b.tokens.length - a.tokens.length);
  return index;
}

const startsUpper = (token: string | undefined): boolean => token !== undefined && token[0] !== token[0]?.toLowerCase();

function matchesAt<T>(text: Tokens, at: number, phrase: Phrase<T>): boolean {
  if (at + phrase.tokens.length > text.lower.length) return false;
  if (phrase.capital && !startsUpper(text.raw[at])) return false;
  return phrase.tokens.every((token, i) => text.lower[at + i] === token);
}

function scan<T>(text: Tokens, index: Map<string, Array<Phrase<T>>>, onHit: (payload: T) => void): void {
  let i = 0;
  while (i < text.lower.length) {
    const hit = index.get(text.lower[i] ?? "")?.find((p) => matchesAt(text, i, p));
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
  const index = buildIndex(KEYWORD_CATEGORIES.map((k) => ({ tokens: tokenize(k.keyword), capital: false, payload: k })));
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
    return { tokens, capital: tokens.length === 1, payload: entry };
  }));
  const tokenized = texts.map((t) => ({ source: t.source, tokens: tokensOf(t.text) }));
  const sources = new Map<CatalogEntry, Set<PatchTextSource>>();
  for (const text of tokenized) scan(text.tokens, index, (entry) => addSource(sources, entry, text.source));
  const items = [...sources.entries()]
    .map(([entry, set]) => ({ entry, sources: orderSources(set) }))
    .sort((a, b) => a.entry.name.localeCompare(b.entry.name));
  return { items, categories: matchKeywords(tokenized) };
}
