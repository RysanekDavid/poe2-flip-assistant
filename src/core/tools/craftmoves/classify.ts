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

/** Affix limits per side; `total` = p + s. An item whose limits are unknown has no Capacity at all. */
export interface Capacity {
  p: number;
  s: number;
  total: number;
}

export type StateFlagCode =
  | "unknown-class"
  | "unknown-base"
  | "ambiguous-base"
  | "ambiguous-split"
  | "ambiguous-side"
  | "over-capacity"
  | "over-cap-jewel"
  | "ignored-text"
  | "unidentified"
  | "unknown-capacity";

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
 * Rare gear = 3 prefixes + 3 suffixes; magic = 1 + 1 (game rules). A rare BASIC jewel = 2 + 2
 * (KB §6 "Affix caps"). The rare Time-Lost cap is UNRESOLVED there (3 + 3 is claimed, not
 * corroborated), so its capacity is null: open slots stay unknown rather than guessed.
 */
function capacityOf(rarity: string, jewel: boolean, timeLost: boolean): Capacity | null {
  if (rarity === "Normal") return { p: 0, s: 0, total: 0 };
  if (rarity === "Magic") return { p: 1, s: 1, total: 2 };
  if (rarity !== "Rare") return null;
  if (!jewel) return { p: 3, s: 3, total: 6 };
  return timeLost ? null : { p: 2, s: 2, total: 4 };
}

/**
 * Signed affix allowances: Contempt's crafted "+1 Suffix Modifier allowed" (sits in a PREFIX slot)
 * and its prefix twin, and the Dusk / Gloam Ring implicits "+1 Prefix … / -1 Suffix Modifier
 * allowed" and their mirror (KB §3, RePoE base_items implicits).
 */
export const EXTRA_CAPACITY = /^([+-]?\d+) (Prefix|Suffix) Modifiers? allowed$/i;

interface Allowance {
  p: number;
  s: number;
}

function addAllowance(extra: Allowance, line: string): void {
  const m = EXTRA_CAPACITY.exec(line);
  if (!m) return;
  if (m[2]!.toLowerCase() === "prefix") extra.p += Number(m[1]);
  else extra.s += Number(m[1]);
}

/** Extra slots granted by every cataloged "±N … Modifier allowed" mod the item carries. */
function extraCapacity(affixes: readonly Affix[]): Allowance {
  const extra = { p: 0, s: 0 };
  for (const a of affixes) if (a.modId != null && a.lines.length === 1) addAllowance(extra, a.lines[0]!);
  return extra;
}

/**
 * Allowance a base's own implicits grant (Dusk Ring +1 prefix / -1 suffix, Gloam Ring the mirror).
 * Read from the catalog, not the paste: affix matching skips the implicit section.
 */
export function baseAllowance(cat: CraftCatalog, baseType: string | null): Allowance {
  const extra = { p: 0, s: 0 };
  for (const line of (baseType ? cat.bases[baseType]?.implicits : undefined) ?? []) addAllowance(extra, line);
  return extra;
}

function withExtraCapacity(cap: Capacity | null, extra: Allowance): Capacity | null {
  if (cap == null) return null;
  return { p: cap.p + extra.p, s: cap.s + extra.s, total: cap.total + extra.p + extra.s };
}

const MAGIC_BASE_ALLOWANCE =
  "this base's implicit changes its affix limits, which KB §3 states for rares only — open slots on a magic one are not counted";

/**
 * The base's implicit allowance on top of the rarity cap. KB §3 gives the rare result (Dusk Ring =
 * 4 prefixes + 2 suffixes); what it does to a magic item's 1 + 1 is not verified, so that cap is
 * unknown rather than guessed. A normal item carries no affixes, so its 0 + 0 stays.
 */
function applyBaseAllowance(state: ItemState, extra: Allowance): void {
  if (extra.p === 0 && extra.s === 0) return;
  if (state.rarity === "Rare") {
    state.capacity = withExtraCapacity(state.capacity, extra);
  } else if (state.rarity === "Magic") {
    state.capacity = null;
    state.flags.push({ code: "unknown-capacity", message: MAGIC_BASE_ALLOWANCE });
  }
}

function emptyState(parsed: ParsedItem, meta: ItemMeta, itemClass: string | null, baseType: string | null): ItemState {
  const jewel = itemClass === "Jewels";
  const timeLost = jewel && /time-lost/i.test(baseType ?? parsed.baseType);
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
    timeLost,
    affixes: [],
    prefixes: 0,
    suffixes: 0,
    capacity: capacityOf(parsed.rarity, jewel, timeLost),
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
  const extra = extraCapacity(state.affixes);
  state.capacity = withExtraCapacity(state.capacity, extra);
  const cap = state.capacity;
  const provable = cap != null && state.unmatched.length === 0 && sideless.length === 0 && !state.unidentified
    && !state.flags.some((f) => f.code === "ambiguous-split");
  if (!provable) return state;
  const openP = cap.p - state.prefixes;
  const openS = cap.s - state.suffixes;
  if (openP >= 0 && openS >= 0) {
    state.openPrefixes = openP;
    state.openSuffixes = openS;
    state.openTotal = openP + openS;
  } else if (state.jewel && !state.timeLost && extra.p + extra.s === 0 && Math.min(openP, openS) === -1 && Math.max(openP, openS) >= 0) {
    setStrippedContempt(state, openP, openS);
  } else {
    state.flags.push({ code: "over-capacity", message: `${state.affixes.length} affixes exceed the ${state.rarity.toLowerCase()} limit — some line was misread` });
  }
  return state;
}

/**
 * KB §6 (b): creators strip Contempt's "+1 … allowed" mod and keep the over-cap 3rd affix, so a basic
 * jewel one over on one side is that end state, not a misread. The over side is full (0 open); the
 * other side is only known when it is full too — whether it can still grow is unverified.
 */
function setStrippedContempt(state: ItemState, openP: number, openS: number): void {
  state.flags.push({ code: "over-cap-jewel", message: "over-cap jewel: stripped Contempt slot (KB §6 b, creator-demonstrated)" });
  const otherOpen = openP < 0 ? openS : openP;
  const known = otherOpen === 0 ? 0 : null;
  state.openPrefixes = openP < 0 ? 0 : known;
  state.openSuffixes = openS < 0 ? 0 : known;
  state.openTotal = known;
}

/** Classify an already-parsed item. `meta` carries the header lines parseItem drops. */
export function classifyItem(parsed: ParsedItem, meta: ItemMeta, cat: CraftCatalog): ItemState {
  const base = resolveBase(cat, meta, parsed);
  const state = emptyState(parsed, meta, base.itemClass, base.baseType);
  const ignored: string[] = [];
  const groups = groupLines(parsed, ignored);
  if (ignored.length > 0) state.flags.push({ code: "ignored-text", message: `ignored non-mod text: ${ignored.join(" | ")}` });
  if (meta.unidentified) state.flags.push({ code: "unidentified", message: "unidentified — mods are hidden until identified" });
  if (state.capacity == null && state.timeLost) {
    state.flags.push({ code: "unknown-capacity", message: "rare Time-Lost jewel affix limit is unresolved (KB §6) — open slots are not counted" });
  }
  applyBaseAllowance(state, baseAllowance(cat, base.baseType));
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
