/*
 * The one plain sentence under the result band: what the current selection lights up, in player
 * words ("Lights waystones with any of 3 wanted mods and none of 2 avoided · tier 14–16"). Pure
 * (no React) so the node tests pin the wording; the band renders `strong` parts in bold.
 */
import type { PoolHeader, Rarity } from "../../../core/tools/regex/pools/headers";
import type { PricePresetParams } from "../../../lib/tools/regexContract";
import type { PoolTabSelection, ValueRange, VendorSelection } from "../../../lib/tools/regexPoolContract";

export type SentencePart = string | { strong: string };

const NOUN: Record<PoolTabSelection["tab"], string> = { waystone: "waystones", tablet: "tablets", relic: "relics", jewel: "jewels" };
const RARITY_LABEL: Record<Rarity, string> = { normal: "Normal", magic: "Magic", rare: "Rare", unique: "Unique" };
const NOTHING = "Nothing selected yet — set a filter or mark mods Avoid / Want. The string only highlights; it never changes an item.";

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Flattened text of a sentence (tests, tooltips, aria). */
export const sentenceText = (parts: readonly SentencePart[]): string => parts.map((p) => (typeof p === "string" ? p : p.strong)).join("");

/** "Pack Size: +#%" → "Pack Size": the label a property field and the sentence share. */
export const headerName = (h: PoolHeader): string => h.template.replace(/:? ?[+-]?#%?$/, "");

function rangeClause(name: string, r: ValueRange, unit: string): string {
  if (r.max === null) return `${name} ≥ ${r.min}${unit}`;
  return r.min === r.max ? `${name} ${r.min}${unit}` : `${name} ${r.min}–${r.max}${unit}`;
}

function modClause(sel: PoolTabSelection): SentencePart[] {
  const states = Object.values(sel.mods);
  const want = states.filter((s) => s === "want").length;
  const avoid = states.length - want;
  const out: SentencePart[] = [];
  if (want === 1) out.push(" with ", { strong: "1" }, " wanted mod");
  else if (want > 1 && sel.match === "all") out.push(" with ", { strong: "all" }, ` ${want} wanted mods`);
  else if (want > 1) out.push(" with ", { strong: "any" }, ` of ${want} wanted mods`);
  if (avoid > 0) out.push(want > 0 ? " and " : " with ", { strong: "none" }, ` of ${plural(avoid, "avoided mod")}`);
  return out;
}

function poolFilters(sel: PoolTabSelection, headers: readonly PoolHeader[], bands: readonly { id: string; label: string }[]): string[] {
  const out: string[] = [];
  if (sel.tab === "waystone" && sel.tier) out.push(sel.tier.min === sel.tier.max ? `tier ${sel.tier.min}` : `tier ${sel.tier.min}–${sel.tier.max}`);
  if (sel.tab === "tablet" && sel.types.length > 0) out.push(`${sel.types.map((t) => bands.find((b) => b.id === t)?.label ?? t).join(" or ")} only`);
  if (sel.rarity.length > 0) out.push(`${sel.rarity.map((r) => RARITY_LABEL[r]).join(" or ")} only`);
  if (sel.corrupted === "only") out.push("corrupted only");
  if (sel.corrupted === "exclude") out.push("not corrupted");
  for (const h of headers) {
    const r = sel.props[h.id];
    if (r) out.push(rangeClause(headerName(h), r, h.template.endsWith("%") ? "%" : ""));
  }
  const limits = Object.keys(sel.thresholds).length;
  if (limits > 0) out.push(plural(limits, "roll limit"));
  return out;
}

/** Waystone / Tablet / Relic / Jewel selection → the band's sentence. */
export function describeSelection(sel: PoolTabSelection, headers: readonly PoolHeader[], bands: readonly { id: string; label: string }[]): SentencePart[] {
  const mods = modClause(sel);
  const filters = poolFilters(sel, headers, bands);
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
  if (s.rarity.length > 0) out.push(`${s.rarity.map((r) => RARITY_LABEL[r]).join(" or ")} only`);
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
