import { parseItem, type ParsedItem } from "../../itemParser";
import { comboFor, type AffixSide, type CraftCatalog } from "./catalog";
import { buildPool } from "./modMatcher";
import { groupLines, matchGroup, type MatchContext } from "./affixMatch";
import { readItemMeta, resolveBase, type ItemMeta } from "./itemMeta";

/**
 * Pasted item → what a crafter needs to know before the next click: which affixes it carries, on
 * which side, and how many slots are PROVABLY open. Any explicit line we cannot place on a side
 * makes the open counts null — the rules engine then offers no "add a mod" move rather than guess.
 */

export type AffixKind = "explicit" | "crafted" | "fractured" | "desecrated";

export interface Affix {
  lines: string[];
  kind: AffixKind;
  side: AffixSide | null;
  family: string | null;
  modId: string | null;
  level: number | null;
  /** In-game tier numbering (counts upward: the highest number is the best tier). */
  tier: { rank: number; of: number } | null;
  unrevealed: boolean;
  note: string | null;
}

/** Affix limits. `p`/`s` null = the per-side split is not known (regular jewels: 4 total, KB §6). */
export interface Capacity {
  p: number | null;
  s: number | null;
  total: number;
}

export type StateFlagCode =
  | "unknown-class"
  | "unknown-base"
  | "ambiguous-base"
  | "ambiguous-split"
  | "ambiguous-side"
  | "extra-capacity"
  | "over-capacity"
  | "ignored-text"
  | "unidentified";

export interface StateFlag {
  code: StateFlagCode;
  message: string;
}

export interface ItemState {
  rarity: string;
  itemClass: string | null;
  baseType: string | null;
  ilvl: number | null;
  quality: number | null;
  corrupted: boolean;
  mirrored: boolean;
  unidentified: boolean;
  jewel: boolean;
  timeLost: boolean;
  affixes: Affix[];
  prefixes: number;
  suffixes: number;
  capacity: Capacity | null;
  openPrefixes: number | null;
  openSuffixes: number | null;
  openTotal: number | null;
  slots: { crafted: number; desecrated: number; fractured: number; unrevealed: number };
  unmatched: string[];
  flags: StateFlag[];
}

/**
 * Rare = 3 prefixes + 3 suffixes; magic = 1 + 1 (game rules, not KB facts). Regular rare jewels
 * cap at 4 explicit mods (KB §6) with no per-side split in the KB, so jewels get a total only.
 */
function capacityOf(rarity: string, jewel: boolean): Capacity | null {
  if (rarity === "Normal") return { p: 0, s: 0, total: 0 };
  if (rarity === "Magic") return { p: 1, s: 1, total: 2 };
  if (rarity === "Rare") return jewel ? { p: null, s: null, total: 4 } : { p: 3, s: 3, total: 6 };
  return null;
}

function emptyState(parsed: ParsedItem, meta: ItemMeta, itemClass: string | null, baseType: string | null): ItemState {
  const jewel = itemClass === "Jewels";
  return {
    rarity: parsed.rarity,
    itemClass,
    baseType,
    ilvl: parsed.itemLevel,
    quality: meta.quality,
    corrupted: parsed.corrupted,
    mirrored: parsed.mirrored,
    unidentified: meta.unidentified,
    jewel,
    timeLost: jewel && /time-lost/i.test(baseType ?? parsed.baseType),
    affixes: [],
    prefixes: 0,
    suffixes: 0,
    capacity: capacityOf(parsed.rarity, jewel),
    openPrefixes: null,
    openSuffixes: null,
    openTotal: null,
    slots: { crafted: 0, desecrated: 0, fractured: 0, unrevealed: 0 },
    unmatched: [],
    flags: [],
  };
}

/** Counts, slots and — only when every explicit line was placed on a side — the open counts. */
function finalize(state: ItemState): ItemState {
  const count = (side: AffixSide): number => state.affixes.filter((a) => a.side === side).length;
  state.prefixes = count("prefix");
  state.suffixes = count("suffix");
  for (const a of state.affixes) {
    if (a.kind === "crafted") state.slots.crafted++;
    if (a.kind === "desecrated") state.slots.desecrated++;
    if (a.kind === "fractured") state.slots.fractured++;
    if (a.unrevealed) state.slots.unrevealed++;
  }
  const sideless = state.affixes.filter((a) => a.side == null);
  if (sideless.length > 0) {
    state.flags.push({ code: "ambiguous-side", message: `${sideless.length} affix(es) could not be placed on a side — open slots unknown` });
  }
  const cap = state.capacity;
  const provable = cap != null && state.unmatched.length === 0 && sideless.length === 0 && !state.unidentified
    && !state.flags.some((f) => f.code === "extra-capacity" || f.code === "ambiguous-split");
  if (!provable) return state;
  const used = state.affixes.length;
  const openP = cap.p == null ? null : cap.p - state.prefixes;
  const openS = cap.s == null ? null : cap.s - state.suffixes;
  if (used > cap.total || (openP ?? 0) < 0 || (openS ?? 0) < 0) {
    state.flags.push({ code: "over-capacity", message: `${used} affixes exceed the ${state.rarity.toLowerCase()} limit — some line was misread` });
    return state;
  }
  state.openPrefixes = openP;
  state.openSuffixes = openS;
  state.openTotal = cap.total - used;
  return state;
}

/** Classify an already-parsed item. `meta` carries the header lines parseItem drops. */
export function classifyItem(parsed: ParsedItem, meta: ItemMeta, cat: CraftCatalog): ItemState {
  const base = resolveBase(cat, meta, parsed);
  const state = emptyState(parsed, meta, base.itemClass, base.baseType);
  const ignored: string[] = [];
  const groups = groupLines(parsed, ignored);
  if (ignored.length > 0) state.flags.push({ code: "ignored-text", message: `ignored non-mod text: ${ignored.join(" | ")}` });
  if (meta.unidentified) state.flags.push({ code: "unidentified", message: "unidentified — mods are hidden until identified" });
  if (base.ambiguous) state.flags.push({ code: "ambiguous-base", message: `"${base.baseType}" names bases with different tag sets — tier pools may be off` });
  const combo = base.itemClass && base.baseType ? comboFor(cat, base.itemClass, base.baseType) : null;
  if (!combo) {
    const code = base.itemClass && !cat.classes[base.itemClass] ? "unknown-class" : "unknown-base";
    state.flags.push({ code, message: code === "unknown-class" ? `item class "${base.itemClass ?? "?"}" is not craftable here` : "base type not found in the craft catalog" });
    state.unmatched.push(...groups.flatMap((g) => g.lines.map((l) => l.text)));
    return finalize(state);
  }
  const ctx: MatchContext = { pool: buildPool(cat, combo, true), combo, ilvl: parsed.itemLevel, state };
  for (const g of groups) matchGroup(ctx, g);
  return finalize(state);
}

/** Parse + classify pasted clipboard text; null when the text is not an item at all. */
export function classifyText(text: string, cat: CraftCatalog): { parsed: ParsedItem; state: ItemState } | null {
  const parsed = parseItem(text);
  if (!parsed) return null;
  return { parsed, state: classifyItem(parsed, readItemMeta(text), cat) };
}
