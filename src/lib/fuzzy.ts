/**
 * Order-independent keyword search, the way PoE's own trade filter works: type
 * "increased chance hit" and it finds "#% increased Critical Hit Chance" — every
 * typed word must appear somewhere in the candidate, order doesn't matter.
 *
 * Ranking favours, in order: an exact contiguous phrase hit, word-prefix matches
 * (a token starting a word beats a mid-word substring), and shorter (more specific)
 * candidates. Pure + synchronous so it runs inline on every keystroke.
 */

/** Split to lowercase alphanumeric tokens — drops punctuation, "#", "+", etc. */
const tokens = (s: string): string[] => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];

export interface Ranked<T> {
  item: T;
  score: number;
}

/**
 * Rank `items` by how well they match `query`. Returns only candidates where EVERY
 * query token is present (AND semantics), best first, capped at `limit`.
 */
export function fuzzyRank<T>(query: string, items: readonly T[], text: (t: T) => string, limit = 25): T[] {
  const q = tokens(query);
  if (q.length === 0) return [];
  const phrase = query.trim().toLowerCase();

  const out: Ranked<T>[] = [];
  for (const item of items) {
    const raw = text(item);
    const hay = raw.toLowerCase();
    const hayToks = tokens(raw);

    let ok = true;
    let score = 0;
    for (const t of q) {
      if (!hay.includes(t)) {
        ok = false;
        break;
      }
      const wholeWord = hayToks.includes(t);
      const prefix = hayToks.some((w) => w.startsWith(t));
      score += wholeWord ? 3 : prefix ? 2 : 1;
    }
    if (!ok) continue;

    if (phrase.length > 2 && hay.includes(phrase)) score += 6; // contiguous phrase
    score += Math.max(0, 4 - hay.length / 25); // shorter = more specific

    out.push({ item, score });
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.item);
}
