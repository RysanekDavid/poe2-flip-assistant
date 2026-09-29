/*
 * Vendor-screen search: equipment filters → stash-search strings, with every token proven safe
 * against the vendor namespace (all craftable equipment lines, bases, class names). Filters
 * (rarity, item class, item level, required level) are ANDed into every string; the "wanted"
 * properties (quality, movement speed, resistances, +skills, sockets) follow the any/all switch,
 * like wanted mods on the pool tabs. Same result shape as composePool so one output bar renders
 * both.
 */
import type { VendorSelection, PoolWarning } from "../../../lib/tools/regexPoolContract";
import { renderChunk } from "./compose";
import { normalizeText } from "./namespace";
import { numberRangeRegex } from "./numberRange";
import type { ComposedToken, PoolChunk, PoolComposeOptions, PoolComposeResult } from "./poolCompose";
import { buildVendorNamespace, headerKey, lineKey, memoPoolNamespace, type PoolNamespace } from "./poolNamespace";
import { literalTokens, propertyToken, rarityTokens, thresholdToken, type PoolToken } from "./poolTokens";
import { VENDOR_HEADERS, type PoolHeader } from "./pools/headers";
import type { VendorData } from "./pools/schema";

const MOVEMENT_SPEED = "#% increased Movement Speed";
const RESISTANCE_LINE: Record<keyof VendorSelection["resistances"], string> = {
  fire: "+#% to Fire Resistance",
  cold: "+#% to Cold Resistance",
  lightning: "+#% to Lightning Resistance",
  chaos: "+#% to Chaos Resistance",
};
const ALL_SKILLS = "+# to Level of all Skills";
// Every "+# to Level of all … Skills/Skill Gems" line counts as "+skills" — a threshold may land on any.
const SKILL_LINE = /^\+# to Level of all .*Skill/;
const CLASS_NOTE = 'item class is matched on the clipboard\'s "Item Class:" line — check the in-game search sees it';

interface VendorTerm {
  tokens: PoolToken[];
  label: string;
}

interface VendorContext {
  data: VendorData;
  ns: PoolNamespace;
  selection: VendorSelection;
  round10: boolean;
  ignored: string[];
}

function header(id: string): PoolHeader {
  const h = VENDOR_HEADERS.find((x) => x.id === id);
  if (!h) throw new Error(`vendor headers lack "${id}"`);
  return h;
}

function lineThreshold(ctx: VendorContext, template: string, min: number, label: string, allowedLines: readonly string[] = []): VendorTerm | null {
  if (!ctx.data.lines.includes(template)) {
    ctx.ignored.push(`${label}: "${template}" is not in the game data`);
    return null;
  }
  const allowed = new Set(allowedLines.map(lineKey));
  const token = thresholdToken(ctx.ns, { key: lineKey(template), template }, 0, { min, max: null }, { kind: "threshold", round10: ctx.round10, allowed });
  return { tokens: [token], label };
}

/*
 * The requirement line continues with attributes ("Requires: Level 65, 86 Str"), so the number is
 * closed by "," or the line end — thresholdToken's "$" edge alone would miss most gear.
 */
function requiredLevelTerm(range: { min: number; max: number | null }): VendorTerm {
  const text = `level ${numberRangeRegex(range.min, range.max)}(,|$)`;
  const note = "requirement line spelling (\"Requires: Level #, … Str\") is not in the clipboard corpus yet";
  return { tokens: [{ text, kind: "property", covers: [headerKey("requiredLevel")], collisions: [], anchored: true, rounded: false, verify: true, note }], label: "required level" };
}

/*
 * PoE2 prints one letter per socket ("Sockets: S S"), not a count, so "at least N" is the prefix
 * with N letters — any item with more sockets contains it too.
 */
function socketsTerm(n: number): VendorTerm {
  const text = `sockets: ${Array.from({ length: n }, () => "s").join(" ")}`;
  const note = "socket line spelling (one S per socket) is not in the clipboard corpus yet";
  return { tokens: [{ text, kind: "property", covers: [headerKey("sockets")], collisions: [], anchored: false, rounded: false, verify: true, note }], label: `${n}+ sockets` };
}

function filterTerms(ctx: VendorContext): VendorTerm[] {
  const s = ctx.selection;
  const terms: VendorTerm[] = [];
  if (s.rarity.length > 0 && s.rarity.length < 4) terms.push({ tokens: rarityTokens(ctx.ns, s.rarity), label: "rarity" });
  const known = s.classes.filter((c) => ctx.data.classes.includes(c));
  for (const c of s.classes.filter((x) => !known.includes(x))) ctx.ignored.push(`item class "${c}" is not in the game data`);
  if (known.length > 0) {
    // class names only appear on the clipboard's "Item Class:" line, which the tooltip may not print
    const tokens = literalTokens(ctx.ns, known.map((c) => `class:${normalizeText(c)}`), "type").map((t) => ({ ...t, verify: true, note: CLASS_NOTE }));
    terms.push({ tokens, label: "item class" });
  }
  if (s.itemLevel) terms.push({ tokens: [propertyToken(ctx.ns, header("itemLevel"), s.itemLevel, ctx.round10)], label: "item level" });
  if (s.requiredLevel) terms.push(requiredLevelTerm(s.requiredLevel));
  return terms;
}

function wantedTerms(ctx: VendorContext): VendorTerm[] {
  const s = ctx.selection;
  const terms: Array<VendorTerm | null> = [];
  if (s.quality !== null) terms.push({ tokens: [propertyToken(ctx.ns, header("quality"), { min: s.quality, max: null }, ctx.round10)], label: "quality" });
  if (s.movementSpeed !== null) terms.push(lineThreshold(ctx, MOVEMENT_SPEED, s.movementSpeed, "movement speed"));
  for (const [element, template] of Object.entries(RESISTANCE_LINE) as Array<[keyof typeof RESISTANCE_LINE, string]>) {
    const min = s.resistances[element];
    if (min !== null) terms.push(lineThreshold(ctx, template, min, `${element} resistance`));
  }
  if (s.plusSkills !== null) {
    terms.push(lineThreshold(ctx, ALL_SKILLS, s.plusSkills, "+skills", ctx.data.lines.filter((l) => SKILL_LINE.test(l))));
  }
  if (s.sockets !== null) terms.push(socketsTerm(s.sockets));
  return terms.filter((t): t is VendorTerm => t !== null);
}

const render = (tokens: readonly PoolToken[]): string => renderChunk(tokens.map((t) => t.text), "keep");
const join = (parts: readonly string[]): string => parts.filter((p) => p.length > 0).join(" ");

function renderWanted(match: VendorSelection["match"], wanted: readonly VendorTerm[]): string {
  if (wanted.length === 0) return "";
  return match === "all" ? join(wanted.map((t) => render(t.tokens))) : render(wanted.flatMap((t) => t.tokens));
}

/** First-fit the wanted terms into strings that each repeat the filters. */
function pack(prefix: string, match: VendorSelection["match"], wanted: readonly VendorTerm[], maxChars: number): { chunks: PoolChunk[]; dropped: string[] } {
  const bins: VendorTerm[][] = [];
  const dropped: string[] = [];
  const text = (bin: readonly VendorTerm[]): string => join([prefix, renderWanted(match, bin)]);
  for (const term of wanted) {
    if (text([term]).length > maxChars) {
      dropped.push(term.label);
      continue;
    }
    const bin = bins.find((b) => text([...b, term]).length <= maxChars);
    if (bin) bin.push(term);
    else bins.push([term]);
  }
  const chunks = (bins.length > 0 ? bins : [[]]).map((bin) => {
    const t = text(bin);
    return { text: t, chars: t.length, covers: bin.map((x) => x.label) };
  });
  return { chunks: chunks.filter((c) => c.chars > 0), dropped };
}

function vendorWarnings(tokens: readonly PoolToken[], chunks: readonly PoolChunk[], match: VendorSelection["match"], ignored: readonly string[], dropped: readonly string[]): PoolWarning[] {
  const out: PoolWarning[] = [];
  if (chunks.length > 1) {
    out.push(match === "any"
      ? { code: "multi-string", label: `${chunks.length} strings`, detail: "The filters did not fit one string. Paste each in turn; an item is a match if ANY of them lights it." }
      : { code: "all-split", label: `${chunks.length} strings (all)`, detail: "An \"all\" search did not fit one string. A match must light up in EVERY string." });
  }
  if (tokens.some((t) => t.rounded)) out.push({ code: "rounded", label: "rounded", detail: "Thresholds were widened to whole tens to fit — slightly lower rolls also match." });
  if (tokens.some((t) => t.anchored)) out.push({ code: "anchors", label: "uses ^ / $", detail: "Line anchors are the least-tested part of the search dialect — verify once in-game." });
  const verify = tokens.filter((t) => t.verify);
  if (verify.length > 0) out.push({ code: "verify-in-game", label: `${verify.length} to verify`, detail: verify.map((t) => t.note ?? `"${t.text}" may also light: ${t.collisions.join(", ")}`).join("; ") });
  const unverified = VENDOR_HEADERS.filter((h) => h.verified === "unverified" && tokens.some((t) => t.covers.includes(headerKey(h.id))));
  if (unverified.length > 0) out.push({ code: "unverified-header", label: `${unverified.length} unverified line`, detail: `Spelling not yet seen in a clipboard paste: ${unverified.map((h) => h.template).join(", ")}.` });
  if (dropped.length > 0) out.push({ code: "uncovered", label: `${dropped.length} not in any string`, detail: `Too long next to the filters: ${dropped.join(", ")}.` });
  if (ignored.length > 0) out.push({ code: "threshold-ignored", label: `${ignored.length} ignored`, detail: ignored.join("; ") });
  return out;
}

const empty = (reason: string, warnings: PoolWarning[] = []): PoolComposeResult => ({ chunks: [], tokens: [], masked: [], uncovered: [], warnings, reason });

/** Compose vendor-screen search strings. Throws only on programmer errors. */
export function composeVendor(data: VendorData, selection: VendorSelection, options: PoolComposeOptions): PoolComposeResult {
  const ns = memoPoolNamespace(data, () => buildVendorNamespace(data, VENDOR_HEADERS));
  let ctx: VendorContext = { data, ns, selection, round10: false, ignored: [] };
  let filters = filterTerms(ctx);
  let wanted = wantedTerms(ctx);
  const ignored = ctx.ignored;
  if (filters.length === 0 && wanted.length === 0) return empty("nothing selected — set a filter or a minimum", vendorWarnings([], [], selection.match, ignored, []));
  let single = join([...filters.map((t) => render(t.tokens)), renderWanted(selection.match, wanted)]);
  if (single.length > options.maxChars) {
    ctx = { ...ctx, round10: true, ignored: [] };
    filters = filterTerms(ctx);
    wanted = wantedTerms(ctx);
    single = join([...filters.map((t) => render(t.tokens)), renderWanted(selection.match, wanted)]);
  }
  const tokens: ComposedToken[] = [...filters, ...wanted].flatMap((t) => t.tokens).map((t) => ({ ...t, alsoMatches: [] }));
  const prefix = join(filters.map((t) => render(t.tokens)));
  if (prefix.length > options.maxChars) return empty(`the filters alone need ${prefix.length} chars — over the ${options.maxChars}-char limit`);
  const { chunks, dropped } = single.length <= options.maxChars
    ? { chunks: [{ text: single, chars: single.length, covers: wanted.map((t) => t.label) }], dropped: [] }
    : pack(prefix, selection.match, wanted, options.maxChars);
  const warnings = vendorWarnings(tokens, chunks, selection.match, ignored, dropped);
  return { chunks, tokens, masked: [], uncovered: dropped, warnings, reason: chunks.length === 0 ? "nothing fits the character limit" : null };
}
