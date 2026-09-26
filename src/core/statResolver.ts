import { fetchTradeMeta, type StatOption } from "../api/tradeMeta";
import type { ParsedModLine } from "./itemParser";

/**
 * Resolve a parsed mod line to its official trade2 stat id (`explicit.stat_XXXX`). Two routes:
 *  1. by id — trade2 fetch responses now carry each mod's stat hash (ItemMod.hash), which is the
 *     exact catalog id; no text matching can beat that;
 *  2. by text — match the placeholdered text against the stat catalog (`/api/trade2/data/stats`),
 *     the Exiled Exchange 2 method, used for pasted clipboard items and legacy string mods.
 * One logical mod can exist in several groups (explicit/implicit/pseudo/rune) — we pick the group
 * the game tagged the line with.
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
  byId: Map<string, StatOption>; // trade stat id → catalog entry
}

/** Build a fast lookup index from the trade stat catalog. */
export function buildStatIndex(stats: StatOption[]): StatIndex {
  const byText = new Map<string, StatOption[]>();
  const byId = new Map<string, StatOption>();
  for (const s of stats) {
    const k = norm(s.text);
    const arr = byText.get(k);
    if (arr) arr.push(s);
    else byText.set(k, [s]);
    byId.set(s.id, s);
  }
  return { byText, byId };
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

/** Groups whose mods are ordinary explicits carrying a flag (crafted/fractured/desecrated). */
const EXPLICIT_VARIANTS = new Set(["crafted", "fractured", "desecrated"]);

/**
 * Catalog ids to try for a fetched stat hash. A fractured/desecrated/crafted mod is searched as its
 * `explicit.` twin FIRST: comparables are "items with this mod", and narrowing them to the ones
 * where it happens to be fractured would shrink the set to near nothing. Implicit/rune/enchant
 * ids stay in their own group — there the group IS the meaning.
 */
function catalogIdCandidates(statId: string): string[] {
  const dot = statId.indexOf(".");
  if (dot < 0) return [statId];
  return EXPLICIT_VARIANTS.has(statId.slice(0, dot)) ? [`explicit${statId.slice(dot)}`, statId] : [statId];
}

function rollOf(line: ParsedModLine): number {
  // single number is the value; "Adds a to b" → average; no numbers → presence-only (0)
  return line.numbers.length === 0 ? 0 : line.numbers.reduce((a, b) => a + b, 0) / line.numbers.length;
}

function toResolved(pick: StatOption, line: ParsedModLine): ResolvedStat {
  return { id: pick.id, group: pick.group, text: pick.text, ref: norm(pick.text), value: rollOf(line) };
}

/** Resolve one mod line against the index, or null if the catalog has no match. */
export function resolveLine(line: ParsedModLine, idx: StatIndex): ResolvedStat | null {
  if (line.statId) {
    const byId = catalogIdCandidates(line.statId).map((id) => idx.byId.get(id)).find(Boolean);
    if (byId) return toResolved(byId, line);
  }
  const matches = idx.byText.get(norm(line.placeholdered));
  if (!matches || matches.length === 0) return null;

  const order = PREF[line.marker] ?? ["explicit"];
  const pick = order.map((g) => matches.find((m) => m.group === g)).find(Boolean) ?? matches[0]!;
  return toResolved(pick, line);
}

/** Resolve every mod line on a parsed item; drops lines the catalog can't match. */
export async function resolveItemStats(lines: ParsedModLine[]): Promise<ResolvedStat[]> {
  const { stats } = await fetchTradeMeta();
  const idx = buildStatIndex(stats);
  return lines.map((l) => resolveLine(l, idx)).filter((r): r is ResolvedStat => r != null);
}
