/*
 * The one plain sentence under the result band: what the current selection lights up, in player
 * words ("Lights waystones with any of 3 wanted mods and none of 2 avoided · tier 14–16"). Pure
 * (no React) so the node tests pin the wording; the band renders `strong` parts in bold.
 */
import { RARITIES, type PoolHeader, type Rarity } from "../../../core/tools/regex/pools/headers";
import type { RegexPool } from "../../../core/tools/regex/pools/schema";
import { slotCount } from "../../../core/tools/regex/pools/template";
import type { PricePresetParams } from "../../../lib/tools/regexContract";
import { parseThresholdKey, type PoolTabSelection, type ValueRange, type VendorSelection } from "../../../lib/tools/regexPoolContract";

export type SentencePart = string | { strong: string };

const NOUN: Record<PoolTabSelection["tab"], string> = { waystone: "waystones", tablet: "tablets", relic: "relics", jewel: "jewels" };
const RARITY_LABEL: Record<Rarity, string> = { normal: "Normal", magic: "Magic", rare: "Rare", unique: "Unique" };
const NOTHING = "Nothing selected yet — set a filter or mark mods Avoid / Want. The string only highlights; it never changes an item.";

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

// Notes that mean the string does NOT do what the selection says: a wanted mod can never light,
// a mod id is gone from the game data, or an "all" search must be checked across several strings.
export const CRITICAL_CODES: ReadonlySet<string> = new Set(["masked", "uncovered", "unknown-mod", "all-split"]);

/** Composer notes with the critical ones first (stable otherwise), as the notes pill lists them. */
export function criticalFirst<W extends { code: string }>(warnings: readonly W[]): W[] {
  return [...warnings].sort((a, b) => Number(CRITICAL_CODES.has(b.code)) - Number(CRITICAL_CODES.has(a.code)));
}

/** Flattened text of a sentence (tests, tooltips, aria). */
export const sentenceText = (parts: readonly SentencePart[]): string => parts.map((p) => (typeof p === "string" ? p : p.strong)).join("");

/** "Pack Size: +#%" → "Pack Size": the label a property field and the sentence share. */
export const headerName = (h: PoolHeader): string => h.template.replace(/:? ?[+-]?#%?$/, "");

function rangeClause(name: string, r: ValueRange, unit: string): string {
  if (r.max === null) return `${name} ≥ ${r.min}${unit}`;
  return r.min === r.max ? `${name} ${r.min}${unit}` : `${name} ${r.min}–${r.max}${unit}`;
}

/** What the composer reported about the wanted mods: those that can never light a match. */
export interface ComposeFacts {
  /** Wanted mods the avoid part also matches. */
  masked: readonly string[];
  /** Wanted mods too long to fit any string. */
  uncovered: readonly string[];
}

function modClause(sel: PoolTabSelection, pool: RegexPool, facts: ComposeFacts | null): SentencePart[] {
  // Mirrors resolveContext: ids the pool lacks are dropped by the composer, so they are not counted here.
  const wants = pool.mods.filter((m) => sel.mods[m.id] === "want").map((m) => m.id);
  const avoid = pool.mods.filter((m) => sel.mods[m.id] === "avoid").length;
  const dark = new Set([...(facts?.masked ?? []), ...(facts?.uncovered ?? [])]);
  const dead = wants.filter((id) => dark.has(id)).length;
  const want = wants.length;
  const out: SentencePart[] = [];
  if (want === 1) out.push(" with ", { strong: "1" }, " wanted mod");
  else if (want > 1 && sel.match === "all") out.push(" with ", { strong: "all" }, ` ${want} wanted mods`);
  else if (want > 1) out.push(" with ", { strong: "any" }, ` of ${want} wanted mods`);
  if (dead > 0) out.push(" (", { strong: `${dead} can never light` }, " — see notes)");
  if (avoid > 0) out.push(want > 0 ? " and " : " with ", { strong: "none" }, ` of ${plural(avoid, "avoided mod")}`);
  return out;
}

/** Roll limits the composer actually uses (validThreshold + one per mod in "any" mode). */
export function usedRollLimits(sel: PoolTabSelection, pool: RegexPool): number {
  const perMod = new Map<string, number>();
  for (const key of Object.keys(sel.thresholds)) {
    const { modId, line, slot } = parseThresholdKey(key);
    const target = sel.mods[modId] === "want" ? pool.mods.find((m) => m.id === modId)?.lines[line] : undefined;
    if (!target || slot >= target.numeric.count || target.numeric.decimals > 0) continue;
    perMod.set(modId, (perMod.get(modId) ?? 0) + 1);
  }
  const counts = [...perMod.values()];
  return counts.reduce((n, c) => n + (sel.match === "any" ? Math.min(c, 1) : c), 0);
}

/** Tablet types narrow the search only when their bases are a strict subset (as stateTerms decides). */
function tabletTypesFilter(sel: PoolTabSelection, pool: RegexPool): string | null {
  if (sel.tab !== "tablet" || sel.types.length === 0) return null;
  const types: readonly string[] = sel.types;
  const bases = pool.bases.filter((b) => (pool.baseBands[b] ?? []).some((t) => types.includes(t)));
  if (bases.length === 0 || bases.length >= pool.bases.length) return null;
  return `${sel.types.map((t) => pool.bands.find((b) => b.id === t)?.label ?? t).join(" or ")} only`;
}

function poolFilters(sel: PoolTabSelection, pool: RegexPool, headers: readonly PoolHeader[]): string[] {
  const out: string[] = [];
  if (sel.tab === "waystone" && sel.tier) out.push(sel.tier.min === sel.tier.max ? `tier ${sel.tier.min}` : `tier ${sel.tier.min}–${sel.tier.max}`);
  const types = tabletTypesFilter(sel, pool);
  if (types) out.push(types);
  // every rarity ticked is no filter at all — the composer drops it too
  if (sel.rarity.length > 0 && sel.rarity.length < RARITIES.length) out.push(`${sel.rarity.map((r) => RARITY_LABEL[r]).join(" or ")} only`);
  if (sel.corrupted === "only") out.push("corrupted only");
  if (sel.corrupted === "exclude") out.push("not corrupted");
  for (const h of headers) {
    const r = sel.props[h.id];
    if (r && h.kind === "property" && slotCount(h.template) === 1) out.push(rangeClause(headerName(h), r, h.template.endsWith("%") ? "%" : ""));
  }
  const limits = usedRollLimits(sel, pool);
  if (limits > 0) out.push(plural(limits, "roll limit"));
  const unknown = Object.keys(sel.mods).filter((id) => !pool.mods.some((m) => m.id === id)).length;
  if (unknown > 0) out.push(`${plural(unknown, "unknown mod")} ignored`);
  return out;
}

/** Waystone / Tablet / Relic / Jewel selection → the band's sentence (facts: the last compose). */
export function describeSelection(sel: PoolTabSelection, pool: RegexPool, headers: readonly PoolHeader[], facts: ComposeFacts | null): SentencePart[] {
  const mods = modClause(sel, pool, facts);
  const filters = poolFilters(sel, pool, headers);
  if (mods.length === 0 && filters.length === 0) return [NOTHING];
  const lead: SentencePart[] = mods.length > 0 ? [`Lights ${NOUN[sel.tab]}`, ...mods] : [`Lights every ${NOUN[sel.tab].slice(0, -1)}`];
  return filters.length > 0 ? [...lead, ` · ${filters.join(" · ")}`] : lead;
}

function vendorWanted(s: VendorSelection): string[] {
  const out: string[] = [];
  if (s.quality !== null) out.push(`≥ ${s.quality}% quality`);
  if (s.movementSpeed !== null) out.push(`≥ ${s.movementSpeed}% movement speed`);
  for (const [name, v] of Object.entries(s.resistances)) if (v !== null) out.push(`≥ ${v}% ${name} resistance`);
  if (s.plusSkills !== null) out.push(`≥ +${s.plusSkills} to skill levels`);
  if (s.sockets !== null) out.push(`≥ ${plural(s.sockets, "socket")}`);
  return out;
}

function vendorFilters(s: VendorSelection): string[] {
  const out: string[] = [];
  if (s.rarity.length > 0 && s.rarity.length < RARITIES.length) out.push(`${s.rarity.map((r) => RARITY_LABEL[r]).join(" or ")} only`);
  if (s.itemLevel) out.push(rangeClause("item level", s.itemLevel, ""));
  if (s.requiredLevel) out.push(rangeClause("required level", s.requiredLevel, ""));
  if (s.classes.length > 0) out.push(s.classes.length <= 3 ? s.classes.join(", ") : `${s.classes.slice(0, 3).join(", ")} +${s.classes.length - 3} more`);
  return out;
}

/** Vendor selection → sentence: wanted properties combine by Any / All like wanted mods. */
export function describeVendor(s: VendorSelection): SentencePart[] {
  const wanted = vendorWanted(s);
  const filters = vendorFilters(s);
  if (wanted.length === 0 && filters.length === 0) return ["Nothing selected yet — set a minimum or a filter. The string only highlights; it never changes an item."];
  const lead: SentencePart[] =
    wanted.length === 0
      ? ["Lights every vendor item"]
      : wanted.length === 1
        ? [`Lights vendor items with ${wanted[0]}`]
        : ["Lights vendor items with ", { strong: s.match === "all" ? "all" : "any" }, ` of: ${wanted.join(", ")}`];
  return filters.length > 0 ? [...lead, ` · ${filters.join(" · ")}`] : lead;
}

/** Price params → sentence. Trash mode inverts the search: it lights everything but the valuables. */
export function describePrice(p: PricePresetParams, categoryCount: number): SentencePart[] {
  if (p.categories.length === 0 && !p.includeUniques) return ["Nothing to search — turn on at least one category."];
  const scope = `${p.categories.length} of ${categoryCount} categories${p.includeUniques ? " + uniques" : ""}`;
  return p.mode === "keep"
    ? ["Lights stash items worth ", { strong: `≥ ${p.minDiv} Div` }, ` each · ${scope}`]
    : ["Lights everything ", { strong: "except" }, ` items worth ≥ ${p.minDiv} Div — the rest is vendor trash · ${scope}`];
}
