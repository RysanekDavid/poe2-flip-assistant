/**
 * Mod names as players read them, shared by the planner (server) and its UI. Client-safe.
 */

/** "+(165-179) to maximum Mana" → "+# to maximum Mana": the family's name as trade sites write it. */
export const genericText = (text: string): string => text.replace(/\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)|-?\d+(?:\.\d+)?/g, "#");

/**
 * Several mod names as one short line: the words they share at the start and end are said once —
 * "Adds # to # Cold · Fire · Lightning damage to Attacks" — and names with nothing in common are listed.
 */
export function compactNames(names: readonly string[]): string {
  const words = names.map((n) => n.split(" "));
  if (words.length < 2) return names.join("");
  const same = (a: string | undefined, b: string | undefined) => a != null && b != null && a.toLowerCase() === b.toLowerCase();
  const shortest = Math.min(...words.map((w) => w.length));
  const first = words[0]!;
  let head = 0;
  while (head < shortest - 1 && words.every((w) => same(w[head], first[head]))) head++;
  let tail = 0;
  while (tail < shortest - 1 - head && words.every((w) => same(w[w.length - 1 - tail], first[first.length - 1 - tail]))) tail++;
  if (head + tail === 0) return names.join(" · ");
  const mids = words.map((w) => w.slice(head, w.length - tail).join(" "));
  return [first.slice(0, head).join(" "), mids.join(" · "), first.slice(first.length - tail).join(" ")].filter((s) => s.length > 0).join(" ");
}

/** A pool slot's name: "any of: <compact family names>" (each candidate's minimum tier is shown elsewhere). */
export const poolName = (texts: readonly string[]): string => `any of: ${compactNames(texts.map((t) => genericText(t.split("\n")[0] ?? t)))}`;
