import type { ItemState } from "./classify";
import { KB, type Verdict } from "./ruleTypes";

/** Predicates shared by the rule tables. Each returns a block (with the reason) or null = satisfied. */

export type Block = { block: string } | null;

export const PASS: Verdict = { pass: true };

export const OPEN_UNKNOWN = "open slots unknown — an explicit line could not be placed on a side";

export const isNormal = (s: ItemState): boolean => s.rarity === "Normal";
export const isMagic = (s: ItemState): boolean => s.rarity === "Magic";
export const isRare = (s: ItemState): boolean => s.rarity === "Rare";
export const isMagicOrRare = (s: ItemState): boolean => isMagic(s) || isRare(s);

/** Provably at least `count` open slots on `side` ("any" = either side). */
export function needOpen(s: ItemState, side: "prefix" | "suffix" | "any", count = 1): Block {
  const open = side === "prefix" ? s.openPrefixes : side === "suffix" ? s.openSuffixes : s.openTotal;
  if (open == null) {
    if (s.capacity == null && s.rarity === "Rare") return { block: "the affix limit of this item is unresolved (rare Time-Lost jewels, KB §6) — open slots unknown" };
    if (s.flags.some((f) => f.code === "over-cap-jewel")) return { block: "over-cap jewel: whether the other side can still take a mod is unverified (KB §6 b)" };
    return { block: OPEN_UNKNOWN };
  }
  if (open >= count) return null;
  const where = side === "any" ? "affix" : side;
  return { block: count === 1 ? `no open ${where} slot` : `needs ${count} open ${where} slots, has ${open}` };
}

/** At least `count` readable explicit mods (optionally on one side). */
export function needMods(s: ItemState, count: number, side?: "prefix" | "suffix"): Block {
  const have = side ? (side === "prefix" ? s.prefixes : s.suffixes) : s.affixes.length;
  if (have >= count) return null;
  const where = side ?? "explicit";
  return { block: `needs ${count} ${where} mod${count === 1 ? "" : "s"}, found ${have}` };
}

/** First block wins; all null → pass with the given extras. */
export function all(blocks: Block[], pass: Verdict = PASS): Verdict {
  return blocks.find((b) => b != null) ?? pass;
}

/**
 * Soft-floor wording (KB §1): a floor never excludes a family — when every reachable tier sits
 * below it, the family's top reachable tier still rolls. "Cannot roll tiers below N", never
 * "mod X cannot appear".
 */
export function floorNote(floor: number): string {
  return `cannot roll tiers below modifier level ${floor} — soft floor: a family whose reachable tiers are all below ${floor} still rolls its top reachable tier (${KB} §1)`;
}

/** KB §9: a Perfect Aug was refused in-game on a low-ilvl ring. Floors above the item level are a red flag. */
export function lowIlvlWarning(s: ItemState, floor: number): string[] {
  if (s.ilvl == null || s.ilvl >= floor) return [];
  return [`item level ${s.ilvl} is below this floor (${floor}) — a Perfect Aug was refused in-game on a low-ilvl ring (${KB} §9)`];
}

/** Whittling removes the lowest MODIFIER LEVEL (KB §4). Name it when every affix level is readable. */
export function whittlingTarget(s: ItemState): string {
  if (s.slots.unrevealed > 0) return "an unrevealed desecrated mod counts as level 1 — it is whittled first";
  const unknown = s.affixes.filter((a) => a.level == null);
  if (unknown.length > 0 || s.unmatched.length > 0) return "at least one mod's level is unreadable — the hover preview is the only truth";
  const lowest = [...s.affixes].sort((a, b) => (a.level ?? 0) - (b.level ?? 0))[0];
  return lowest ? `lowest modifier level we can read: "${lowest.lines.join(" / ")}" (level ${lowest.level}) — confirm on the hover preview` : "no mods to whittle";
}
