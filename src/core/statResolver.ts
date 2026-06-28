import { fetchTradeMeta, type StatOption } from "../api/tradeMeta";
import type { ParsedModLine } from "./itemParser";

/**
 * Resolve a parsed mod line to its official trade2 stat id (`explicit.stat_XXXX`) by matching
 * the placeholdered text against the trade stat catalog (`/api/trade2/data/stats`, fetched +
 * cached by tradeMeta). This is how Exiled Exchange 2 does it: localized mod text → '#'
 * placeholder → catalog lookup → trade id + parsed roll. One logical mod can exist in several
 * groups (explicit/implicit/pseudo/rune) — we pick the group the game tagged the line with.
 */
export interface ResolvedStat {
  id: string; // trade stat id, e.g. "explicit.stat_3299347043"
  group: string; // explicit | implicit | pseudo | rune
  text: string; // catalog template, "+# to maximum Life"
  ref: string; // normalized template — the mod-signature token
  value: number; // the roll (avg of the two for "Adds # to #")
}

// strip leading-sign '+' too: the catalog lists "# to Spirit" but item/clipboard text is
// "+# to Spirit" — without this the two never match (broke all "+X" stat resolution).
const norm = (s: string): string => s.toLowerCase().replace(/\+/g, "").replace(/\s+/g, " ").trim();

export interface StatIndex {
  byText: Map<string, StatOption[]>; // normalized template → catalog entries (across groups)
}

/** Build a fast lookup index from the trade stat catalog. */
export function buildStatIndex(stats: StatOption[]): StatIndex {
  const byText = new Map<string, StatOption[]>();
  for (const s of stats) {
    const k = norm(s.text);
    const arr = byText.get(k);
    if (arr) arr.push(s);
    else byText.set(k, [s]);
  }
  return { byText };
}

// the line's game marker → which catalog group to prefer
const PREF: Record<string, string[]> = {
  implicit: ["implicit", "explicit"],
  rune: ["rune", "explicit"],
  enchant: ["enchant", "explicit"],
  explicit: ["explicit", "implicit"],
  crafted: ["explicit"],
  fractured: ["explicit"],
};

/** Resolve one mod line against the index, or null if the catalog has no match. */
export function resolveLine(line: ParsedModLine, idx: StatIndex): ResolvedStat | null {
  const matches = idx.byText.get(norm(line.placeholdered));
  if (!matches || matches.length === 0) return null;

  const order = PREF[line.marker] ?? ["explicit"];
  const pick =
    order.map((g) => matches.find((m) => m.group === g)).find(Boolean) ?? matches[0]!;

  // roll: single number is the value; "Adds a to b" → average; no numbers → presence-only (0)
  const value = line.numbers.length === 0 ? 0 : line.numbers.reduce((a, b) => a + b, 0) / line.numbers.length;
  return { id: pick.id, group: pick.group, text: pick.text, ref: norm(pick.text), value };
}

/** Resolve every mod line on a parsed item; drops lines the catalog can't match. */
export async function resolveItemStats(lines: ParsedModLine[]): Promise<ResolvedStat[]> {
  const { stats } = await fetchTradeMeta();
  const idx = buildStatIndex(stats);
  return lines.map((l) => resolveLine(l, idx)).filter((r): r is ResolvedStat => r != null);
}
