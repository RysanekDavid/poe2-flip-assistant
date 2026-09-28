/*
 * Shortest search fragment that highlights a target and nothing outside the selected set.
 *
 * "Safe" means every namespace line containing the fragment belongs to an item we are already
 * searching for — matching another selected item is harmless, matching a mod line or an unselected
 * item is a false highlight. Pure: all inputs come from the Namespace built in namespace.ts.
 */
import type { NameEntry, Namespace } from "./namespace";

export interface FragmentResult {
  /** Text to put in the search string (regex metacharacters escaped in the full-name fallback). */
  fragment: string;
  /** The same text unescaped — what an in-game substring test actually compares. */
  literal: string;
  /** Unselected entries the fragment still matches; non-empty only for the full-name fallback. */
  collisions: string[];
}

// Regex metacharacters and search-syntax characters: the in-game box is regex-aware, so a fragment
// containing one of these would not mean what it says. Fragments avoid them; the fallback escapes.
const SEARCH_SPECIAL = /["!|\\^$.*+?()[\]{}]/;
const REGEX_META = /[\\^$.*+?()[\]{}|]/g;
const COLLISION_REPORT_LIMIT = 5;
// A quoted fragment costs two quote characters; a spaced one has to save more than that to win.
const SPACE_PENALTY = 3;

export function escapeSearchText(text: string): string {
  return text.replace(REGEX_META, (c) => `\\${c}`);
}

function rarestPosting(text: string, ns: Namespace): readonly number[] {
  let best: readonly number[] | null = null;
  for (let p = 0; p + 3 <= text.length; p++) {
    const list = ns.trigrams.get(text.slice(p, p + 3)) ?? [];
    if (best === null || list.length < best.length) best = list;
    if (list.length === 0) break;
  }
  return best ?? [];
}

/** Entries outside `allowed` whose searchable text contains `text`, up to `limit`. */
export function unsafeMatches(
  text: string,
  ns: Namespace,
  allowed: ReadonlySet<string>,
  limit: number,
): NameEntry[] {
  if (text.length < 3) throw new RangeError(`fragment "${text}" is shorter than the 3-char trigram index`);
  const out: NameEntry[] = [];
  for (const i of rarestPosting(text, ns)) {
    const entry = ns.entries[i];
    if (!entry || allowed.has(entry.key) || !entry.haystack.includes(text)) continue;
    out.push(entry);
    if (out.length >= limit) break;
  }
  return out;
}

function usable(candidate: string): boolean {
  return !SEARCH_SPECIAL.test(candidate) && !candidate.startsWith(" ") && !candidate.endsWith(" ");
}

interface Best {
  plain: string | null;
  spaced: string | null;
}

/** Scan substrings shortest-first; stop once a space-free safe one exists (nothing longer beats it). */
function scanCandidates(key: string, ns: Namespace, allowed: ReadonlySet<string>, minLen: number): Best {
  const best: Best = { plain: null, spaced: null };
  for (let len = minLen; len <= key.length && best.plain === null; len++) {
    for (let start = 0; start + len <= key.length; start++) {
      const candidate = key.slice(start, start + len);
      const spaced = candidate.includes(" ");
      if ((spaced ? best.spaced : best.plain) !== null || !usable(candidate)) continue;
      if (unsafeMatches(candidate, ns, allowed, 1).length > 0) continue;
      if (spaced) best.spaced = candidate;
      else best.plain = candidate;
    }
  }
  return best;
}

/**
 * Shortest safe substring of the text the stash shows for `target` (its haystack). Space-free
 * fragments win unless a spaced one is at least SPACE_PENALTY chars shorter, because spaces force
 * quoting. With no safe substring the full name comes back with the collisions it cannot avoid,
 * for a "verify in-game" flag — never silently dropped.
 */
export function shortestUniqueFragment(
  target: NameEntry,
  ns: Namespace,
  allowedKeys: ReadonlySet<string>,
  minLen = 3,
): FragmentResult {
  if (minLen < 3) throw new RangeError(`minLen ${minLen} is below the 3-char trigram index`);
  const allowed = allowedKeys.has(target.key) ? allowedKeys : new Set([...allowedKeys, target.key]);
  const { plain, spaced } = scanCandidates(target.haystack, ns, allowed, minLen);
  const pick =
    spaced !== null && (plain === null || spaced.length + SPACE_PENALTY <= plain.length) ? spaced : plain;
  if (pick !== null) return { fragment: pick, literal: pick, collisions: [] };
  const literal = target.haystack;
  const collisions =
    literal.length >= 3 ? unsafeMatches(literal, ns, allowed, COLLISION_REPORT_LIMIT).map((e) => e.name) : [];
  return { fragment: escapeSearchText(literal), literal, collisions };
}
